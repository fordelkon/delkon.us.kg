---
title: "计算机网络（三）：路由转发、NAT 与虚拟网络接口"
description: "解释最长前缀匹配与策略路由的边界，追踪 TTL、ICMP 和 NAPT 地址转换，并区分 TUN 接口、代理重建连接与 IP 隧道的处理方式。"
publishDate: "20 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（二）：IP 寻址、子网划分与局域网通信》](/posts/networking/ip-addressing-subnet-lan-delivery/)用普通单接口配置解释了[直连子网与默认网关](/posts/networking/ip-addressing-subnet-lan-delivery/#子网掩码cidr-与同网段判定)。本篇把这一模型推广到多接口和多条路由：先看下一跳如何选出，再追踪每一跳的头部变化和 ICMP 反馈。最后区分 NAT 地址转换与 TUN、TAP 的用户态交付。

## 路由表与最长前缀匹配

### 单表选路与最长前缀匹配

应用要发出一个 IP 包时，内核需要根据包的目的地址，决定从哪个接口发出、下一跳交给谁。路由表按“目的网络前缀 → 下一跳 / 出接口 / 其他属性”组织条目，一条前缀可以匹配一组目的地址，不必为每一个可能的 IP 单独建表。

先设定一个简化场景，只讨论 IPv4，并固定查询同一张路由表：

- 本机的 `en0` 接口配置为 `192.168.1.10/24`，连接 `192.168.1.0/24` 局域网；`lo0` 是本机的回环接口。
- 局域网上有两个可达的路由器：`192.168.1.1` 是默认网关，`192.168.1.254` 用于一条额外配置的主机路由。
- 现在本机要向 `192.168.1.99` 发包。它是这次查表的目的地址，下面要判断这个包如何发出。

下表只列出本例需要的路由；“目的前缀”一列是拿来与包的目的地址匹配的条件：

| 目的前缀 | 下一跳 | 出口接口 | 含义 |
| --- | --- | --- | --- |
| `127.0.0.0/8` | 本机 | `lo0` | 回环通信 |
| `192.168.1.0/24` | 直连（on-link） | `en0` | 直接解析该链路上的目标邻居 |
| `192.168.1.99/32` | `192.168.1.254` | `en0` | 仅发往 `192.168.1.99` 的包经指定网关转发 |
| `0.0.0.0/0` | `192.168.1.1` | `en0` | 没有更具体匹配时使用的默认路由 |

把目的地址 `192.168.1.99` 与这些前缀对照：

1. 它不属于 `127.0.0.0/8`，因此不匹配回环路由。
2. 它属于 `192.168.1.0/24`，也恰好等于 `/32` 主机路由指定的 `192.168.1.99`，因此这两条都匹配。
3. `0.0.0.0/0` 的前缀长度为 0，不限定任何地址位，也能匹配这个目的地址。

同一张表内多条目的前缀同时匹配时，**最长前缀匹配**（Longest Prefix Match，LPM）优先选择前缀位数最多、范围最具体的条目[^1]。本次匹配的前缀长度分别是 24、32 和 0，因此选中 `192.168.1.99/32`：包从 `en0` 发出，下一跳是 `192.168.1.254`。这条额外配置的主机路由说明，“目的地址属于本机 `/24`”并不在所有配置下都等于直接交付。如果没有这条 `/32` 路由，本例就会选中 `/24`，直接解析 `192.168.1.99` 的 MAC 并交付。

再把目的地址换成 `198.51.100.20`，用它代表本局域网之外的一台目标服务器。这个地址取自专供文档示例使用的 `198.51.100.0/24`（TEST-NET-2），不代表可在公网访问的真实服务[^example-ip]。它不匹配表中的回环、局域网或主机路由，只匹配 `/0`，因此从 `en0` 发出，下一跳是默认网关 `192.168.1.1`。

查表得到下一跳，并不会把包的目的 IP 改成网关 IP。在这个例子中，IP 包的目的地址仍为 `198.51.100.20`；若出口是以太网，内核通过上一篇的 [ARP](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv4-的地址解析arp) 找到下一跳 `192.168.1.1` 的 MAC，把它填进当前链路的帧头。目的 IP 与下一跳 MAC 分别服务于跨网寻址和本跳交付。

### 用路由条目实现单表查找

在这个 C 模型中，每个 `Route` 保存一个 IPv4 前缀、可选网关和出接口。`Ipv4` 沿用上一篇的[主机字节序整数](/posts/networking/ip-addressing-subnet-lan-delivery/#算清一个-27-子网)，例如 `192.168.1.99` 写作 `0xc0a80163`。前缀等长时，示例保留表中第一条匹配；内核的度量值、多路径与策略路由由下一小节解释。

```c
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef uint32_t Ipv4;  // Host-byte-order IPv4 address.

struct Route {
    Ipv4 network;
    unsigned prefix_length;  // Valid range: 0..32.
    bool has_gateway;        // True for indirect via gateway; false for on-link.
    Ipv4 gateway;            // Valid only when has_gateway is true.
    const char *interface_name;
};

const struct Route *longest_match(const struct Route *routes, size_t count,
                                  Ipv4 destination) {
    if (routes == NULL) {
        return NULL;
    }

    const struct Route *best = NULL;
    for (size_t i = 0; i < count; ++i) {
        const struct Route *route = &routes[i];
        if (route->prefix_length > 32) {
            continue;
        }

        // Shifting a 32-bit unsigned integer by 32 bits is UB in C17.
        Ipv4 mask = route->prefix_length == 0
            ? 0
            : UINT32_MAX << (32 - route->prefix_length);
        // Mask both sides in case a route entry carries non-zero host bits.
        // Strict > keeps the first matching entry on equal prefix lengths.
        if ((destination & mask) == (route->network & mask) &&
            (best == NULL || route->prefix_length > best->prefix_length)) {
            best = route;
        }
    }
    return best;
}
```

把前几节的 `/0`、`/24`、`/32` 条目放进数组，查 `192.168.1.99` 得到 `/32`，查 `198.51.100.20` 得到 `/0`。空表或没有匹配项时返回空指针；成功时返回的指针借用原表。对本例的单播转发条目，`has_gateway` 为真时解析 `gateway` 的链路地址，否则解析目标。回环等本地交付另有路由类型。

### Linux 策略路由、RPDB 与 /1 接管

以上例子先固定了一张表。同一前缀的候选路由先比较平台的度量值（Metric），度量值更小者优先；开销相等的多条路径，则可按**等价多路径路由**（Equal-Cost Multi-Path，ECMP）按流分摊。更一般地，Linux 的**策略路由**（Policy-Based Routing）可先按源地址、入口接口或防火墙标记（firewall mark，`fwmark`）等匹配规则，决定查询哪张路由表[^policy]。

在 Linux 上，**路由策略数据库**（Routing Policy Database，RPDB）按优先级数字从小到大检查规则。每条规则先匹配选择条件，匹配后才执行动作。默认 IPv4 规则依次查询 `local`（`0`）、`main`（`32766`）和 `default`（`32767`）；这里的数字是规则优先级，`default` 是表名，不是 `/0` 路由[^policy]。

```mermaid title="Linux IPv4 的 RPDB 选路决策" description="从最小优先级数字开始。规则不匹配、本次查表无路由或命中 throw、查表成功但结果被抑制，都会继续扫描。goto 只能跳向优先级数字更大的后续规则以防止环路。查到可用路由或得到拒绝结果时停止；规则用尽且未得到结果则选路失败。图展示常见的本地与单播交付，不展开广播等特殊路由。"
flowchart TB
 rules["按优先级取下一条规则<br/>小数字在前"]
 rules -->|规则用尽| miss["选路失败：无路由结果"]
 rules -->|有规则| selector{"规则匹配？"}
 selector -->|否| next["回到起点<br/>检查下一条规则"]
 selector -->|是| action["执行规则动作"]
 action -->|goto| jump["跳到后续更高优先级<br/>数字的目标规则重新匹配"]
 action -->|lookup| lookup["只查指定表<br/>表内做最长前缀匹配"]
 action -->|直接拒绝| negative["终止：丢弃或报错"]
 lookup -->|无路由或 throw| next
 lookup -->|命中拒绝路由| negative
 lookup -->|查表成功| suppress{"结果被抑制？"}
 suppress -->|是| next
 suppress -->|否| usable["终止：采用结果<br/>local：本机交付<br/>unicast：选定出接口与下一跳"]
 class rules,selector,suppress state
 class action,lookup,jump,next actor
 class usable result
 class miss,negative risk
```

为避免策略表之间出现死循环，Linux 内核要求 `goto` 的目标规则优先级数字必须严格大于当前规则（只允许向后跳），若目标未命中也会继续扫描下一条。`throw` 结束的是本次查表，不会再退回同一张表找更短前缀。**抑制**（suppression）则发生在查表成功之后，例如 `suppress_prefixlength 0` 会拒用匹配到的 `/0` 路由，但不会拒用匹配到的 `/24`；`suppress_ifgroup` 可以按出接口所属的接口组抑制结果。`blackhole` 则表示静默丢弃：不论是规则动作还是命中的路由类型，它都终止整个决策。`unreachable` 和 `prohibit` 同样终止，而差错含义不同[^policy][^iproute][^rpdb-kernel]。

因此，若优先级较高的规则查到一条未被抑制的 `/0` 单播路由，后面规则所查表里的 `/32` 不会参与竞争。要验证实际选择，应按[路由查询实验](#实验一查看完整路由表与特定目标的选路结果)检查规则、对应的表和具体目标。

:::note[两条 /1 路由与环路预防]
`0.0.0.0/1` 与 `128.0.0.0/1` 共同覆盖 IPv4 地址空间，并优先于原有 `/0` 默认路由。因此，把它们指向虚拟接口，可以接管原本依赖默认路由的 IPv4 流量；`/24`、`/32` 等更具体路由仍可能优先命中，策略规则也可能选择其他表。但全量 `/1` 接管也会把 VPN 对端或远端代理节点的 IP 吸进隧道从而形成转发环路，因此实际部署必须用更具体的 `/32` 旁路路由、Linux `fwmark` 配合 RPDB 独立路由表、`suppress_prefixlength 0` 或按出接口绑定套接字（如 `SO_BINDTODEVICE` / `IP_BOUND_IF`）让外层出站流量绕开虚拟接口。IPv6 的选路独立于这两条 IPv4 路由。
:::

沿用刚才的网段外目标 `198.51.100.20`，下面比较保留原配置与额外添加两条指向 TUN 的 `/1` 路由后的查询结果。仍固定同一张 IPv4 路由表，且没有针对该目标的更具体路由：

| 配置 | 相关候选路由 | 本次命中 |
| --- | --- | --- |
| A：未接管 | `/0 → en0` | 经物理出口的默认路由 |
| B：另有 TUN 路由 | `/0 → en0`、`0.0.0.0/1 → utun`、`128.0.0.0/1 → utun` | 目标首位为 1，命中 `128.0.0.0/1` |

两种配置分别得到不同的出口。IPv6 则使用 `::/0` 及其更具体路由，可能出现 IPv4 进入 TUN、IPv6 仍走物理出口的双栈配置。

## 逐跳转发时哪些字段会变

### 路由器如何处理收到的包

**路由选择**（routing）维护路径信息，**分组转发**（packet forwarding）使用这些信息处理到达的数据包。在一个普通 IPv4 以太网路由器上，可把转发方向概括为：

1. 接收入站帧，检查并移除链路层封装。
2. 按目的 IP 和适用策略查找转发表，确定下一跳与出接口。
3. 递减 IPv4 TTL；若减至 0 且非发往本机则丢弃，并按适用规则生成差错报文[^ttl]。
4. 因 TTL 改变而更新 IPv4 头部校验和。IPv6 转发递减 Hop Limit，其基本首部没有校验和字段。TCP、UDP 等上层协议仍按各自规则校验；Hop Limit 不属于它们使用的 IPv6 伪首部[^ipv6-hdr]。
5. 对下一跳完成必要的邻居解析，重新封装该出口链路的帧后发送（帧头的源/目的 MAC 地址每一跳都会被改写）。

实际设备还可能执行防火墙、NAT、排队或硬件卸载，这里只保留理解逐跳交付需要的部分。TTL 是有限的转发预算，避免路由环路让同一个包长期存活；它能经过多少跳取决于初始值。

### 同一个 IP 包经过三段以太网链路

把前面的动作放进一条完整路径：`主机 A → 路由器 R1 → 路由器 R2 → 服务器 B`。这是一个隔离的路由实验网络，三段链路都使用以太网，已配置好往返路由与邻居映射；没有 NAT、代理、隧道或 IP 分片，也不对流量做其他头部或载荷改写。私网地址可以在这个内部网络中跨子网路由，文档示例地址也只在此充当目标，并不表示它们能这样直接访问公网。

每台路由器的入口和出口是两个不同接口。下面列出这条路径的地址，MAC 均取自[文档专用单播范围](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv4-的地址解析arp)：

| 所在链路 | 接口 | IPv4 地址 / 前缀 | MAC 地址 |
| --- | --- | --- | --- |
| A 与 R1 | A | `192.168.1.10/24` | `00:00:5e:00:53:01` |
| A 与 R1 | R1 入口 | `192.168.1.1/24` | `00:00:5e:00:53:02` |
| R1 与 R2 | R1 出口 | `192.0.2.1/30` | `00:00:5e:00:53:03` |
| R1 与 R2 | R2 入口 | `192.0.2.2/30` | `00:00:5e:00:53:04` |
| R2 与 B | R2 出口 | `198.51.100.1/24` | `00:00:5e:00:53:05` |
| R2 与 B | B | `198.51.100.20/24` | `00:00:5e:00:53:06` |

A 向 B 的 TCP `443` 端口发送一段数据，源端口为 `50001`，初始 TTL 取 `64`。沿途观察承载这个 IP 包的三份帧：

| 字段 | A → R1 | R1 → R2 | R2 → B |
| --- | --- | --- | --- |
| 以太网源 MAC | `…:01` | `…:03` | `…:05` |
| 以太网目的 MAC | `…:02` | `…:04` | `…:06` |
| IPv4 源地址 | `192.168.1.10` | `192.168.1.10` | `192.168.1.10` |
| IPv4 目的地址 | `198.51.100.20` | `198.51.100.20` | `198.51.100.20` |
| IPv4 TTL | 64 | 63 | 62 |
| TCP 端口 | `50001 → 443` | `50001 → 443` | `50001 → 443` |

MAC 只列末字节，完整地址见上表。R1 和 R2 各更新一遍 IPv4 头部校验和，新帧各有自己的 FCS。

第一份帧的目的 MAC 是 R1 的入口，第二份的源 MAC 则是 R1 的出口；R1 不会把 A 的 MAC 原样带到下一段链路。R2 再以自己的出口 MAC 向 B 成帧。B 收到包后做本机交付，不会因为自己是第三份帧的接收者，就再执行一次路由转发的 TTL 递减。

| 组成部分 | 经过 R1、R2 时发生什么 |
| --- | --- |
| 以太网头与帧尾 | 每段链路重新生成源 / 目的 MAC 与 FCS |
| IPv4 头 | 源 / 目的 IP 保留；TTL 递减，头部校验和随之更新 |
| TCP 头与载荷 | 本例中保持不变；IPv4 TTL 不参与 TCP 伪头部校验和计算 |

所以“IP 地址不变”并不等于“整个 IP 头不变”。路由器转发的是去掉旧链路封装后的 IP 包；TCP 确认与重传由两端的 TCP 处理，见第四篇的[序号与确认示例](/posts/networking/transport-tcp-udp-socket-quic/#tcp-的序号确认与重传)[^forward-packet]。

## ICMP 差错与探测反馈

**互联网控制报文协议**（Internet Control Message Protocol，ICMP）用来报告 IP 层状态与差错。**IPv6 互联网控制报文协议**（Internet Control Message Protocol for IPv6，ICMPv6）不仅使用独立的类型编号，还同时承担第二篇的 [NDP 邻居发现](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv6-的邻居发现ndp)和路径 MTU 反馈；因为 IPv6 路由器不再沿途分片，IPv4 里的分片提示就独立为 ICMPv6 Packet Too Big[^2][^3]。

| 语义 | IPv4 ICMP 类型 | IPv6 ICMPv6 类型 | 说明 |
| --- | --- | --- | --- |
| 回显请求 / 应答 | `8` / `0` | `128` / `129` | `ping` 探测与往返延迟测量 |
| 目的不可达 | `3` | `1` | 报告网络、主机、端口不可达等；IPv4 中需要分片但置 DF 时对应 `Type 3 Code 4` |
| 数据包过大（Packet Too Big） | 归入 `Type 3 Code 4` | `2` | IPv6 路由器遇超长包时返回携带下一跳 MTU 的独立类型[^3] |
| 超时（Time Exceeded） | `11` | `3` | TTL / Hop Limit 耗尽或分片重组超时，`traceroute` 借此收集逐跳响应 |
| 邻居发现（NDP） | 由独立 ARP 协议负责 | `133`–`137` | RS、RA、NS、NA 与重定向；全盘封禁 ICMPv6 会直接中断本地交付 |

### ICMP Echo Request 的报文布局

以 IPv4 的 `ping` 回显请求为例。IPv4 头的 `Protocol=1` 指明载荷交给 ICMP。ICMP 用标识符和序号关联请求与应答；应答使用 `Type=0`，并返回相应的标识符、序号和探测数据[^2]。

```mermaid title="IPv4 直接承载 ICMP Echo Request" description="外层 Ethernet II 帧承载 IPv4 包。IPv4 头用 Protocol=1 指向 ICMP。Echo Request 的固定部分为 8 字节，后面可带探测数据。此处没有 TCP 或 UDP 头，省略链路层填充和 FCS。"
flowchart TB
 subgraph frame[Ethernet II 帧]
  eth["帧头 · EtherType=0x0800"]
  subgraph ip[IPv4 包]
   ip_header["IPv4 头 · Protocol=1 · ICMP<br/>源 IPv4 · 目的 IPv4 · TTL"]
   subgraph echo[ICMP Echo Request]
    first["Type=8 · Code=0 · 校验和"]
    match["标识符 · 序号"]
    data["探测数据 · 可为空"]
    first --- match --- data
   end
   ip_header --- first
  end
  eth --- ip_header
 end
 linkStyle default stroke:none
```

### 路由器怎样报告差错

IPv6 路由器遇到 Hop Limit 耗尽时可返回超时报文，遇到包超过出接口允许的大小时会返回**数据包过大**（Packet Too Big）报文[^3]。**路径最大传输单元**（Path Maximum Transmission Unit，PMTU）取路径上各链路 MTU 的最小值。源端可用这类报文调整对 PMTU 的估计，参见第八篇的[路径 MTU 诊断](/posts/networking/network-diagnostics-performance-troubleshooting/#mtumss-与-pmtud-黑洞)[^pmtu]。

ICMP 差错报文之所以能被发送端关联到具体连接或 `traceroute` 探测，是因为它在自身头部后面**内嵌了触发差错的原 IP 包片段**：RFC 1812 要求 IPv4 路由器尽量附带原包内容，但差错报文总长不超过 576 字节（至少含原 IP 头与传输层前 8 字节，即包含端口或 ICMP 标识符）；ICMPv6 则附带尽可能多的原包字节以使总长不超过 1280 字节[^icmp-payload][^3]。这也意味着经过 NAT 的连接收到外网发回的 ICMP 差错时，网关同样需要改写内嵌原包头里的地址与端口。为防止差错雪崩，规范禁止对 ICMP 差错报文自身回发差错，通常也不对链路广播或组播包生成差错（ICMPv6 Packet Too Big 等少数例外），且路由器会对差错发送限速[^icmp-payload][^icmpv6-rules]。

:::tip[怎样解读 traceroute 的星号]
`*` 表示对应探测在等待窗口内没有获得预期回应，可能涉及控制报文限速、过滤、回程丢失或路径变化。它不能单独证明业务包在该处丢弃；后续跳或目标有响应时，尤其不能把中间星号当作转发故障。响应包的源地址也未必就是探测包经过的入口接口。
:::

## NAT：多台内网设备如何共用一个公网 IP

普通路由转发保持包内的源与目的 IP 不变；但家庭或办公网络里的主机往往使用私网 IPv4 地址，离开局域网时必须先把源地址转换成公网地址。

### NAT 类型与改写字段

[私网地址](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)不用于普通全球公网路由。家庭网络若用多个私网 IPv4 地址共享一个公网 IPv4 地址，出口常采用 NAPT，同时改写地址与端口。这种做法也常称为**端口地址转换**（Port Address Translation，PAT）[^pat]。**基本网络地址转换**（Basic NAT）只转换地址，保留端口[^4]。

**源网络地址转换**（Source Network Address Translation，SNAT）和**目的网络地址转换**（Destination Network Address Translation，DNAT）按改写的字段命名。NAPT 强调端口参与映射，**端口转发**（port forwarding）则是常见的配置场景[^4][^netfilter]。

| 名称 | 改动 | 例子 |
| --- | --- | --- |
| SNAT | 某方向包的源地址，必要时也改源端口 | 出站把私网源地址转换为出口地址 |
| DNAT | 某方向包的目的地址，必要时也改目的端口 | 把访问公网地址的请求交给内部服务 |
| NAPT / PAT | 在地址转换中引入传输端口映射 | 多台主机共用同一个公网 IPv4 |
| 端口转发 | 常见的静态入向 DNAT 配置场景 | `203.0.113.5:8443 → 192.168.1.20:443` |

家用设备往往同时执行 NAT 与防火墙规则：前者改写地址端口，后者决定是否放行，两者都不提供传输加密。如果家庭 NAT 外还有[运营商的 CGNAT](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)，在家庭路由器上配置端口转发只解决入站路径中的一层。

### NAPT：地址端口映射与回包转换

假设路由器公网地址为文档示例地址 `203.0.113.5`，两台内网主机访问同一个 TCP 服务，源端口恰好相同。下面是本次通信的一种可能转换：

| 内网源地址 | 公网侧源地址 | 目标地址 |
| --- | --- | --- |
| `192.168.1.10:50001` | `203.0.113.5:61001` | `198.51.100.20:443` |
| `192.168.1.11:50001` | `203.0.113.5:61002` | `198.51.100.20:443` |

取表中的第一条映射，把 NAPT 两侧的出站包与返回包分别展开。这里只看 IP 与 TCP 头；以太网头仍像上一节那样按链路重新封装。

| 方向与字段 | 内网侧 | 公网侧 |
| --- | --- | --- |
| 出站源（改写） | `192.168.1.10:50001` | `203.0.113.5:61001` |
| 出站目的 | `198.51.100.20:443` | `198.51.100.20:443` |
| 返回源 | `198.51.100.20:443` | `198.51.100.20:443` |
| 返回目的（还原） | `192.168.1.10:50001` | `203.0.113.5:61001` |

出站从内网列读到公网列，返回则从公网列读到内网列。两侧观察的是同一条端到端 TCP 连接，NAPT 不替对端发送 TCP 确认。

把第一条映射放回[冷启动访问的时序](/posts/networking/layered-architecture-packet-journey/#冷启动时客户端会发哪些报文)。客户端与直连解析器之间的 DNS 查询走局域网，网站连接的首个 SYN 才经过这里的出口转换。之后从同一条连接发出的 TLS 握手与 HTTP 数据继续使用这条映射。表中两列对应网关的两个观测位置，转换发生在网关转发各个包时。

路由器修改出站包的源地址和端口，并更新 IPv4 头部和 TCP 校验和。使用 UDP 时，已启用的 UDP 校验和也要更新。TCP 和 UDP 的校验都涉及包含 IP 地址的伪头部[^4]。

动态映射有自己的生命周期，即使两端的 Socket 仍打开，映射也可能过期：

1. 建立或复用：内网流量出站时，设备分配外部地址端口，或按映射规则复用已有的分配；若外网端口尚未被其他会话占用，RFC 4787 建议尽量保持原源端口，即**端口保留**（Port Preservation）[^nat-preserve]。本例第一条映射因并发冲突或策略分配了 `203.0.113.5:61001`[^4][^5]。
2. 转换与刷新：映射仍有效且过滤允许时，发往 `203.0.113.5:61001` 的回包会被还原为发往 `192.168.1.10:50001`。对 UDP，RFC 4787 要求出站流量刷新计时，入站流量不一定刷新。对 TCP，设备可以按观察到的连接阶段采用不同的空闲计时；只看到单向 FIN 不代表两个方向都已结束[^nat-lifetime]。
3. 过期后移除：旧映射不再提供回包的还原路径。之后的出站流量若建立新映射，外部地址或端口可能不同；分配新映射不等于恢复 TCP 连接。实际超时由协议、设备实现和配置决定[^nat-lifetime]。

用一个 C 内存模型追踪表中第一条 TCP 转换：除保存转换前后的源端点与本例对端外，分别提供出站与入站改写函数，端口与 IPv4 整数均采用主机字节序。

```c
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

struct Ipv4Endpoint {
    uint32_t address;  // Host byte order.
    uint16_t port;     // Host byte order.
};

struct TcpNatMapping {
    struct Ipv4Endpoint inside;   // 192.168.1.10:50001
    struct Ipv4Endpoint outside;  // 203.0.113.5:61001
    struct Ipv4Endpoint peer;     // 198.51.100.20:443
};

static bool endpoint_equal(struct Ipv4Endpoint a, struct Ipv4Endpoint b) {
    return a.address == b.address && a.port == b.port;
}

// Rewrites outbound source endpoint if both inside and peer match this entry.
bool nat_rewrite_outbound(const struct TcpNatMapping *mapping,
                          struct Ipv4Endpoint *src,
                          struct Ipv4Endpoint dst) {
    if (mapping == NULL || src == NULL) {
        return false;
    }
    if (!endpoint_equal(*src, mapping->inside) ||
        !endpoint_equal(dst, mapping->peer)) {
        return false;
    }
    *src = mapping->outside;
    return true;
}

// Restores inbound destination endpoint when traffic returns from the same peer.
bool nat_rewrite_inbound(const struct TcpNatMapping *mapping,
                         struct Ipv4Endpoint src,
                         struct Ipv4Endpoint *dst) {
    if (mapping == NULL || dst == NULL) {
        return false;
    }
    if (!endpoint_equal(src, mapping->peer) ||
        !endpoint_equal(*dst, mapping->outside)) {
        return false;
    }
    *dst = mapping->inside;
    return true;
}
```

出站方向把匹配记录的源端点从 `inside` 改为 `outside`；入站回包则把目的端点从 `outside` 改回 `inside`。真实网关的 NAT 表远不止单条记录：一是要为内网索引和公网回包索引建立双向查找表，二是单个公网 IP 对同一目标的并发连接数受限于 16 位临时端口空间（约六万余端口，耗尽时只能依赖多公网 IP 地址池或结合远端地址端口复用），三是要维护单调时钟到期淘汰，四是改写包头后需按 RFC 3022 / RFC 1624 对 IPv4 首部及 TCP/UDP 校验和做一补码增量更新（IPv4 中原本禁用、值为 `0` 的 UDP 校验和不得改写为非零，计算结果为 `0x0000` 时须编码为 `0xFFFF`）[^4][^checksum-inc]。

### 映射、过滤与连接跟踪

有了映射，不等于任意远端的包都会被放行。判断 NAT 设备怎样处理流量，需要分清三件事：

- **映射**（mapping）：内网地址端口对应哪个外部地址端口，以及联系不同远端时能否复用映射。
- **入向过滤**（inbound filtering）：已存在映射时，允许哪些远端发来的包进入。
- **连接跟踪**（connection tracking）：设备为会话维护什么状态；常见模型使用源/目的地址、源/目的端口和协议组成的五元组，但不能把所有 NAT 映射的键都定义为五元组。

另一项常见要求是**发卡环回**（Hairpinning，又称 NAT 回流）：两台位于同一 NAT 后的内网主机通过彼此映射出的公网地址端口互访时，NAT 设备需要把包转换后再转发回内网，而不是要求它离开公网接口[^nat-hairpin]。

没有动态映射或静态转发安排时，外部主机通常不能主动访问内部服务。**对等通信**（Peer-to-Peer，P2P）还需考虑地址发现与中继，不能凭一个“NAT 类型”判断能否直连。RFC 4787 分别描述 UDP 的映射与过滤，指出**完全锥形 NAT**（Full Cone NAT）、**地址受限锥形 NAT**（Restricted Cone NAT）、**端口受限锥形 NAT**（Port-Restricted Cone NAT）和**对称型 NAT**（Symmetric NAT）等旧分类不足以描述实际行为。这份文档的行为要求针对 UDP[^5]。

在 Linux Netfilter 中，连接跟踪可关联原方向与应答方向。状态防火墙可拿这些状态作放行条件，NAT 可据此沿用映射，二者分别受规则控制。**透明代理**（transparent proxy）还需要在本地接收流量并处理出站。例如 Linux 的 `TPROXY` 机制可以保留包的原目的信息，并把包交给透明套接字（transparent socket），通常需配合标记与策略路由。相关入口对照见第七篇的[透明接管与域名关联](/posts/networking/proxies-tunnels-transparent-interception/#透明接管tun-提供-ip-包域名需要额外关联)[^netfilter]。

一个常见例子是 Linux 上 Docker 的**桥接网络**（bridge network）。一对**虚拟以太网设备**（Virtual Ethernet Device，`veth`）分别位于容器的网络命名空间与宿主机，宿主端连到网桥，同一网桥内可以二层交付。访问外部网络时由宿主机路由转发，默认桥接配置常用**地址伪装**（masquerade），把出站包的源地址转换为宿主机的出口地址。发布端口则是另外的入站配置。具体规则还取决于网关模式与防火墙后端[^bridge]。

### NAT 与 TCP 代理：改写包头还是重建连接

同一台网关可以做路由转发、NAPT，也可以运行应用代理。以客户端访问 TCP 服务为例，判断三者的关键不只是服务端看到哪个源地址，还要看 TCP 在哪里终结：

| 机制 | 中间设备处理什么 | TCP 连接端点 |
| --- | --- | --- |
| 普通 IP 路由转发 | 选择下一跳，更新 TTL 等逐跳字段，保留源／目的 IP 与端口 | 客户端 ↔ 服务端 |
| 普通 NAPT | 转发时按映射改写 IP 地址、端口和相关校验和 | 仍是客户端 ↔ 服务端；设备不代发 TCP ACK |
| 应用代理（如 HTTP `CONNECT` 或 SOCKS5 的 TCP 转接） | 接收客户端连接，将载荷转到独立的出站连接[^proxy-protocols] | 客户端 ↔ 代理、代理 ↔ 服务端；各有序号、确认与关闭状态 |

`CONNECT` 转接 TCP 字节不要求代理同时终结里面的 TLS。不同连接如何分别确认与缓冲，见第四篇的 [Socket 读写契约](/posts/networking/transport-tcp-udp-socket-quic/#socket-接口与内核缓冲区契约)；第七篇的[出站与回包示例](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)再沿两段连接追踪回包。

:::note[IPv6 为什么通常不用 NAPT]
普通 IPv6 网络为每台主机分配全局单播地址，经普通路由转发与邻居发现即可直连公网，不需要靠 NAPT 挤占端口来共享单一地址。之所以外网主机仍不能随意直连家用 IPv6 设备，靠的是路由器上的**状态防火墙**阻止未请求的入站流量，而不是地址转换本身。仅在多出口无状态前缀映射（NPTv6）[^nptv6]或 IPv6 与 IPv4 互通（NAT64）等过渡场景下，才会引入前缀或协议转换。
:::

## 虚拟网络接口：TUN 与 TAP 如何接入协议栈

前面讨论的出口主要是物理网卡；除此之外，选路得到的出口也可以是软件虚拟出的网络接口。第一篇介绍过的**三层虚拟隧道接口**（Network Tunnel，TUN）与**二层虚拟以太网接口**（Ethernet Tunnel Interface，TAP）都能把内核网络栈连接到用户态程序，但交付的数据单元不同[^tun-name][^6]。

### TUN 与 TAP：用户态读写哪些数据

TUN 的“三层”指接口在网络层交付 IP 包。读、写方向以操作接口的用户态程序为参照：`read` 取走的是内核选路后交给 TUN 的出站包；`write` 则向内核注入一个从 TUN 收到的入站包，不会直接在物理网卡上发包。TUN 提供这个交接点，本身不建立远端连接，也不提供加密[^6]。

| 接口 | 用户态读写的数据 | 内核如何处理 |
| --- | --- | --- |
| TUN | 完整 IP 包 | 读出选路交给 TUN 的包；写入的包进入 IP 接收路径 |
| TAP | 带链路层头部的以太网帧 | 读出发往 TAP 的帧；写入的帧进入链路层接收路径，可用于虚拟机桥接 |
| 普通 TCP Socket | TCP 连接的应用字节流 | 内核维护 TCP 连接，负责分段、确认与重传 |

表中描述的是网络数据单元，接口还可单独或随包提供元数据。Linux 通过 `/dev/net/tun` 创建 TUN/TAP；未设置 `IFF_NO_PI` 时，每包前带 4 字节信息（标志和协议）[^6]。macOS 原生 `utun` 控制套接字的包以 4 字节网络字节序的协议族字段开头；Apple 的 Network Extension `packetFlow` 则可通过 `readPackets` 和 `writePackets` 分别传递包数据与协议族[^apple-tunnel]。

IPv4/IPv6 路由、策略规则和排除项决定哪些包进入 TUN。接入 TUN 后，程序再决定如何处理 IP 包，包括是否终结应用侧 TCP、是否采用加密隧道。普通 TCP Socket 的应用接口见第四篇的[读写契约](/posts/networking/transport-tcp-udp-socket-quic/#socket-接口与内核缓冲区契约)。

### TUN、代理与 IP 隧道的处理区别

三层**虚拟专用网络**（Virtual Private Network，VPN）可用 TUN 收发内层 IP 包，再通过外部网络连接远端隧道端点。

| 机制 | 接口之后的主要处理 | 回程如何回到应用 |
| --- | --- | --- |
| TUN 接口 | 交付 IP 包，后续由使用它的程序决定 | 程序向接口写入符合该平台要求的入站 IP 包，交给内核处理 |
| 通过 TUN 接管的代理 | 可终结应用侧传输连接，取出载荷，再建立独立的直连或代理出站 | 把出站结果交回应用侧协议栈，构造相应包写回 TUN |
| 三层 VPN 隧道 | 将内层 IP 包封装后传给远端隧道端点 | 收到外层流量后解封装，把内层回包写回接口 |

这几行可以组合，但不能混为同一机制。代理重建连接时，不一定把原始 IP 包逐个套上外层头；因此，第八篇讨论 [MTU 与包长预算](/posts/networking/network-diagnostics-performance-troubleshooting/#包长预算与-tcp-载荷)时不能仅凭“启用了 TUN”推导固定的隧道头开销。应用自身的 HTTPS、代理链路加密与 VPN 封装也分别由相应协议决定。

```mermaid title="同一个 TUN 入口之后的两种处理" description="比较两种实现，不是同一条连接依次经过两种模式。左支限定终结应用侧 TCP 的用户态代理，创建独立出站连接；右支限定把完整内层 IP 包加密封装到 UDP/IP 的一种三层 VPN，远端解封装后继续转发原包。两种程序的外层出站都需要可用的绕行路由；标记、策略或接口绑定的效果必须按平台验证。图只展示出站，回程分别重建应用侧包或解封装内层回包。"
flowchart TB
 tun["内核按路由发送 IP 包<br/>用户态从 TUN 读取"] --> proxy["TUN 代理<br/>协议栈终结应用侧 TCP"]
 proxy --> socket["取得载荷，新建出站套接字<br/>拥有独立确认、重传与关闭"]
 socket --> bypass["按策略与实际选路绕过 TUN<br/>直连或交给远端代理"]
 tun --> vpn["三层 IP VPN<br/>保留完整内层 IP 包"]
 vpn --> outer["加密封装为外层 UDP/IP<br/>路由到远端隧道端点<br/>（外层流量需绕过 TUN）"]
 outer --> peer["远端解密并去掉外层头<br/>继续转发内层 IP 包"]
 class tun state
 class proxy,vpn actor
 class socket,outer resource
 class bypass,peer result
```

再把右支的封装展开。应用建立连接时选用本机隧道地址 `10.0.0.2` 访问 `198.51.100.20`；VPN 程序通过物理接口地址 `192.168.1.10` 向对端 `203.0.113.9` 发送流量。这里观察的是靠近本机的两个位置：TUN 读出的内层包，以及上游 NAT 之前的物理出口。

```mermaid title="VPN 密文包住完整的 TUN 原包" description="TUN 原包包含内层 IPv4 头、TCP 头和原始载荷。加密箭头指向 UDP 数据报内的 VPN 密文区。外层 IPv4、UDP 和 VPN 元数据各有自己的位置；省略外部链路帧与认证标签的具体格式。"
flowchart LR
 original["TUN 原包<br/>内层 IPv4：10.0.0.2 → 198.51.100.20<br/>TCP：50001 → 443<br/>原始载荷"]
 subgraph outer[物理出口的 IPv4 包]
  ip["外层 IPv4 头 · Protocol=17<br/>192.168.1.10 → 203.0.113.9"]
  subgraph udp[UDP 数据报]
   udp_header["UDP 头 · 52000 → 51820"]
   subgraph vpn[UDP 载荷 · VPN 数据]
    metadata["VPN 元数据"]
    cipher["密文 · 完整内层包"]
   end
  end
 end
 original -->|加密完整原包| cipher
 class original actor
 class cipher state
```

外层目的 IP 让普通路由把包送到 VPN 对端；对端解密、去掉外层封装后，才按内层目的 IP 继续转发。这里的内层地址没有被外层地址简单替换，外层也有自己的 TTL 与路由。反过来，左支的代理若终结应用侧 TCP，物理出口通常出现的是独立出站连接的包，不能套用这张“完整内层包在里面”的结构。

读到 TUN 时，先核对哪条路由把包交给接口，以及程序写回后内核如何处理。代理如何终结应用侧 TCP、建立独立出站并处理回程，见第七篇的 [TUN 连接与返回路径](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)。

## 观察路由与转发路径：实验与边界

实验先回答本机把包交给哪里，再观察哪些中间设备愿意回应探测。选路查询只读取本机配置，不向查询地址发送业务包；`traceroute` 则会发送真实网络探测，应在允许探测该目标的本机终端运行。两类命令都不需要修改路由，也不能用在线代码运行环境的网络配置代替本机结果。

### 实验一：查看完整路由表与特定目标的选路结果

先查看路由表，再查询 `198.51.100.20` 这个示例目标在当前配置下的出口。如果要判断双栈接管范围，再用 `2001:db8::20` 另做一次 IPv6 查询。两者都只用于查表对照。

| 观察目的 | Linux | macOS |
| --- | --- | --- |
| 查看 IPv4 路由表 | `ip route show table all` | `netstat -rn -f inet` |
| 查询 IPv4 目标 | `ip route get 198.51.100.20` | `route -n get 198.51.100.20` |
| 查看 IPv6 路由表 | `ip -6 route show table all` | `netstat -rn -f inet6` |
| 查询 IPv6 目标 | `ip -6 route get 2001:db8::20` | `route -n get -inet6 2001:db8::20` |

Linux 的 `table all` 仅用于列出各表，缺省的 `ip route show` 只列出 `main`。有策略路由时，按地址族补查 `ip rule show` 或 `ip -6 rule show`，再对照实际命中规则所查的表；源地址、入口接口或 `fwmark` 等条件不同时，只查询同一个目的地址不能代表所有流量[^policy][^iproute]。macOS 上还需结合接口作用域和具体 Network Extension 的路由配置。

macOS 的 `route -n get` 常见字段包括：

- `destination`、`mask`：本次查询关联的目标或前缀，具体打印方式依路由类型而异。
- `gateway`：经网关的路由显示下一跳，直连接口路由也可能显示链路标识或邻居信息。
- `interface`：当前选择的物理或虚拟接口，例如 `en0` 或 `utunX`。

将输出与路由表对照，再换一个局域网目标重复查询，可以观察默认路由与更具体路由的区别。存在策略、接口作用域或应用自行绑定接口时，普通查询结果仍需与应用实际使用的连接条件核对。

如果公网 IPv4 目标的选路结果指向 `utun` 虚拟接口，就需要按实际的接管路径解释连接。抓包与计时之前，应先确认流量在哪个接口进入代理。

### 实验二：观察逐跳路径与 TTL 触发的 ICMP 响应

下面限制最多探测 5 跳，每跳一次探测，单次等待最多 1 秒；`-n` 只跳过对中间跳 IP 的反向 DNS 查询（命令对 `example.com` 仍会先做正向解析）：

```bash frame="code"
traceroute -n -m 5 -q 1 -w 1 example.com
```

左侧数字对应探测包的初始 TTL，右侧若有响应则显示响应者地址与测得的往返耗时。最多 5 跳未到目标是这个实验主动设置的范围限制，不能据此判断目标不可达。若本机已开启 Fake-IP 或 DNS 接管，域名可能先解析到虚接口保留地址并在第 1 跳结束，此时应直接探测已知的真实公网 IPv4 地址；未预装 `traceroute` 的 Linux 环境可用 `tracepath -n` 替代（无 `-q`/`-w` 选项）。

`route get` 观察本地决策，不知道后续路由器会怎样转发；`traceroute` 记录这轮探测的响应，不保证不同探测经过同一条路径。去程与回程也可能不对称，单侧结果不能证明响应沿原路返回。要诊断业务连接，可按[本次请求实际发生的阶段选择观测点](/posts/networking/network-diagnostics-performance-troubleshooting/#按请求阶段选择观测点)。

## 总结

- 固定路由表内优先匹配更具体的前缀；策略规则还可能先选择不同的表。下一跳地址与包头目的地址承担不同职责。
- 路由转发逐跳递减 TTL/Hop Limit，并重新封装出口链路；ICMP 差错携带原包截断头以便关联流，回应的有无不能直接等同于业务转发是否成功。
- NAPT 改写地址端口并同步增量更新校验和，映射、过滤、端口保留、发卡环回和会话状态需要分别理解；它不会因为转换地址而终结两端 TCP。
- TUN 提供 IP 包入口，代理与 VPN 决定后续处理。接管范围、出站绕行和回包交付共同决定通信能否成立。

下一篇沿协议栈向上，讨论[《计算机网络（四）：TCP、UDP、QUIC 与 Socket 接口》](/posts/networking/transport-tcp-udp-socket-quic/)：不可靠的逐跳 IP 交付，怎样支撑有序字节流，应用读写连接时又能依赖哪些保证？

## 延伸阅读

- [RFC 5382: NAT Behavioral Requirements for TCP](https://www.rfc-editor.org/rfc/rfc5382.html)——完整查阅 TCP NAT 的状态超时、端点独立映射与发卡环回要求
- [WireGuard 白皮书（PDF）](https://www.wireguard.com/papers/wireguard.pdf)与 [Linux Advanced Routing & Traffic Control (LARTC)](https://lartc.org/howto/)——深入理解三层轻量级 VPN 隧道与 Linux 多表策略路由、流量控制实践

[^1]: 〔RFC〕[RFC 4632 §5.1](https://www.rfc-editor.org/rfc/rfc4632.html#section-5.1)——转发时选择最具体的匹配前缀。

[^example-ip]: 〔RFC〕[RFC 5737 §3—4](https://www.rfc-editor.org/rfc/rfc5737.html#section-3)——`198.51.100.0/24`（TEST-NET-2）等地址段保留供文档示例使用，不应出现在公共互联网上。

[^policy]: 〔平台与实现〕[Linux ip-rule(8)](https://man7.org/linux/man-pages/man8/ip-rule.8.html)——规则优先级、匹配条件、默认规则、按规则查表与结果抑制。

[^rpdb-kernel]: 〔平台与实现〕Linux 内核的 [RPDB 扫描](https://github.com/torvalds/linux/blob/master/net/core/fib_rules.c)、[IPv4 规则动作与结果抑制](https://github.com/torvalds/linux/blob/master/net/ipv4/fib_rules.c)及[单表查询](https://github.com/torvalds/linux/blob/master/net/ipv4/fib_trie.c)——`goto` 的向后跳转约束与规则回退、成功结果的抑制，以及 `throw` 结束本次查表。

[^2]: 〔RFC〕[RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792.html)——IPv4 Echo、Destination Unreachable 和 Time Exceeded 报文。

[^3]: 〔RFC〕[RFC 4443 §3](https://www.rfc-editor.org/rfc/rfc4443.html#section-3)——ICMPv6 差错报文，包括 Packet Too Big 与 Time Exceeded。

[^icmp-payload]: 〔RFC〕[RFC 1812 §4.3.2.3](https://www.rfc-editor.org/rfc/rfc1812.html#section-4.3.2.3)与 [§4.3.2.7–4.3.2.8](https://www.rfc-editor.org/rfc/rfc1812.html#section-4.3.2.7)——IPv4 ICMP 差错报文携带尽量多的原数据报（总长不超过 576 字节），以及不回复差错与速率限制规则。

[^icmpv6-rules]: 〔RFC〕[RFC 4443 §2.4](https://www.rfc-editor.org/rfc/rfc4443.html#section-2.4)——ICMPv6 差错生成限制与尽量附带原包至不超过 IPv6 最小 MTU（1280 字节）的规定。

[^4]: 〔RFC〕[RFC 3022 §2.1–2.2](https://www.rfc-editor.org/rfc/rfc3022.html#section-2.1)区分 Basic NAT 与 NAPT，[§4.1–4.2](https://www.rfc-editor.org/rfc/rfc3022.html#section-4.1)说明双向包头改写与校验和调整。

[^checksum-inc]: 〔RFC〕[RFC 1624 §3](https://www.rfc-editor.org/rfc/rfc1624.html#section-3)与 [RFC 3022 §4.2](https://www.rfc-editor.org/rfc/rfc3022.html#section-4.2)——增量更新一补码校验和与 `0x0000` / `0xFFFF` 处理，以及 IPv4 UDP 禁用校验和（`0`）的保留规则。

[^5]: 〔RFC〕[RFC 4787 §3、§4.1、§5](https://www.rfc-editor.org/rfc/rfc4787.html#section-3)——旧 NAT 分类的不足，以及 UDP 地址/端口映射和入向过滤的独立描述。

[^nat-preserve]: 〔RFC〕[RFC 4787 §4.2.1](https://www.rfc-editor.org/rfc/rfc4787.html#section-4.2.1)——UDP NAT 的端口保留要求与冲突时的分配规则。

[^nat-hairpin]: 〔RFC〕[RFC 4787 §6](https://www.rfc-editor.org/rfc/rfc4787.html#section-6)与 [RFC 5382 §7.2](https://www.rfc-editor.org/rfc/rfc5382.html#section-7.2)——UDP 与 TCP NAT 的发卡环回（Hairpinning）行为要求。

[^nptv6]: 〔RFC〕[RFC 6296 §1、§2](https://www.rfc-editor.org/rfc/rfc6296.html#section-1)与 [RFC 6146 §1](https://www.rfc-editor.org/rfc/rfc6146.html#section-1)——IPv6 无状态前缀转换 NPTv6 及有状态 IPv6-IPv4 转换 NAT64 的适用场景。

[^nat-lifetime]: 〔RFC〕[RFC 4787 §4.3](https://www.rfc-editor.org/rfc/rfc4787.html#section-4.3)定义 UDP 映射超时与刷新方向；[RFC 5382 §5](https://www.rfc-editor.org/rfc/rfc5382.html#section-5)说明 TCP 的空闲状态与半关闭；[RFC 7857 §2、§7](https://www.rfc-editor.org/rfc/rfc7857.html#section-2)更新 TCP 过渡状态计时及 UDP 入向刷新的条件。

[^6]: 〔平台与实现〕[Linux Kernel: Universal TUN/TAP device driver](https://docs.kernel.org/networking/tuntap.html)——TUN 处理 IP 包、TAP 处理以太网帧，以及用户态读写与内核收发之间的关系；其创建 API 示例针对 Linux。

[^tun-name]: 〔平台与实现〕[OpenBSD tun(4)](https://man.openbsd.org/tun.4)——手册将 `tun` 称为三层隧道接口，将 `tap` 称为以太网隧道接口。

[^pat]: 〔RFC〕[RFC 2663 §4.1.2](https://www.rfc-editor.org/rfc/rfc2663.html#section-4.1.2)与 [RFC 3022 §2.2](https://www.rfc-editor.org/rfc/rfc3022.html#section-2.2)——NAPT / PAT 的术语定义与端口区分方式。

[^pmtu]: 〔RFC〕[RFC 8201 §2、§3](https://www.rfc-editor.org/rfc/rfc8201.html#section-2)——链路 MTU、路径 MTU，以及如何根据 Packet Too Big 报文更新路径 MTU。

[^proxy-protocols]: 〔RFC〕[RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)与[RFC 1928 §4、§6](https://www.rfc-editor.org/rfc/rfc1928.html#section-4)——HTTP `CONNECT` 方法和 SOCKS5 的 TCP 连接请求。

[^ttl]: 〔RFC〕[RFC 1812 §5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.3.1)——IPv4 路由器转发时递减 TTL，TTL 耗尽时丢弃并按规则生成 ICMP Time Exceeded；本机交付与转发处理需要区分。

[^forward-packet]: 〔RFC〕[RFC 1812 §5.2.1、§5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2.1)——IPv4 转发、出接口封装、TTL 与头部校验和更新；[RFC 9293 §3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.1)定义 TCP 校验和覆盖的伪头部，其中不包含 IPv4 TTL。

[^ipv6-hdr]: 〔RFC〕[RFC 8200 §3](https://www.rfc-editor.org/rfc/rfc8200.html#section-3)列出 IPv6 基本首部字段和 Hop Limit 的转发规则，[§8.1](https://www.rfc-editor.org/rfc/rfc8200.html#section-8.1)定义上层校验使用的 IPv6 伪首部。

[^apple-tunnel]: 〔平台与实现〕[Apple XNU：`if_utun.c`](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/net/if_utun.c)说明原生控制套接字的协议族字段。[NEPacketTunnelFlow](https://developer.apple.com/documentation/networkextension/nepackettunnelflow)提供分开读取或写入包数据和协议族的方法，[NEIPv4Settings](https://developer.apple.com/documentation/networkextension/neipv4settings)定义包含、排除路由配置。

[^netfilter]: 〔平台与实现〕[nftables(8) 手册（CT / NAT 语句）](https://netfilter.org/projects/nftables/manpage.html)与[Linux 内核文档：透明代理](https://docs.kernel.org/networking/tproxy.html)——连接状态匹配、状态 NAT 与 TPROXY 的路由和套接字要求。

[^bridge]: 〔平台与实现〕[Docker Engine：Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)与 [Linux veth(4)](https://man7.org/linux/man-pages/man4/veth.4.html)——bridge 驱动的连通、转换与端口发布，以及 veth 对在命名空间之间的连接方式。

[^iproute]: 〔平台与实现〕[Linux ip-route(8)](https://man7.org/linux/man-pages/man8/ip-route.8.html)——路由类型、`show table all` 的显示范围与 `get` 的按条件选路查询。

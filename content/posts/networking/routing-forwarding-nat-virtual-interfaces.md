---
title: "计算机网络（三）：路由转发、NAT 与虚拟网络接口"
description: "解释最长前缀匹配与策略路由的边界，追踪 TTL、ICMP 和 NAPT 地址转换，并区分 TUN 接口、代理重建连接与 IP 隧道的处理方式。"
publishDate: "20 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（二）：IP 寻址、子网划分与局域网通信》](/posts/networking/ip-addressing-subnet-lan-delivery/)用普通单接口配置解释了[直连子网与默认网关](/posts/networking/ip-addressing-subnet-lan-delivery/#子网掩码cidr-与同网段判定)。本篇把这一模型推广到多接口和多条路由：下一跳如何选出，转发途中哪些头部会改变，虚拟接口又怎样把包交给用户态程序。

本篇先看路由如何选出下一跳，再追踪 NAT 转换前后的地址与端口，最后对照 TUN 与二层虚拟接口的交付方式。第七篇再把这几种机制组合成具体的代理接管与出站过程。

## 路由表与最长前缀匹配

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

以上例子先固定了一张表。只有当多条候选路由的前缀长度相同时，才进一步按具体平台的管理距离（Administrative Distance / Preference）、度量值（Metric）或多路径规则（例如**等价多路径路由**，Equal-Cost Multi-Path，ECMP）处理。更一般地，Linux 的**策略路由**（Policy-Based Routing）可先按源地址、入口接口或防火墙标记（firewall mark，`fwmark`）等匹配规则，决定查询哪张路由表；不能把整套决策都概括为对一张表做一次最长前缀匹配[^policy]。

在 Linux 上，**路由策略数据库**（Routing Policy Database，RPDB）按规则优先级数字从小到大处理。某条规则选择 `lookup` 表时，先在该表内找匹配路由。如果规则不匹配、表内无适用结果，或 `throw` 路由让该次查表结束，查询可继续下一条适用规则。已有终结动作（如 `unreachable`）则直接返回结果，不再尝试后面的表。用 `ip rule show` 查看规则顺序，再用 `ip route get` 或 `ip -6 route get` 对具体目标验证[^policy][^iproute]。

:::note[两条 /1 路由能覆盖什么]
`0.0.0.0/1` 与 `128.0.0.0/1` 共同覆盖 IPv4 地址空间，并优先于原有 `/0` 默认路由。因此，把它们指向虚拟接口，可以接管原本依赖默认路由的 IPv4 流量；`/24`、`/32` 等更具体路由仍可能优先命中，策略规则也可能选择其他表。IPv6 的选路独立于这两条 IPv4 路由。删除这两条路由后的行为取决于剩余配置。
:::

沿用刚才的网段外目标 `198.51.100.20`，下面比较保留原配置与额外添加两条指向 TUN 的 `/1` 路由后的查询结果。仍固定同一张 IPv4 路由表，且没有针对该目标的更具体路由：

| 配置 | 相关候选路由 | 本次命中 |
| --- | --- | --- |
| A：未接管 | `/0 → en0` | 经物理出口的默认路由 |
| B：另有 TUN 路由 | `/0 → en0`、`0.0.0.0/1 → utun`、`128.0.0.0/1 → utun` | 目标首位为 1，命中 `128.0.0.0/1` |

两种配置分别得到不同的出口。IPv6 则使用 `::/0` 及其更具体路由，可能出现 IPv4 进入 TUN、IPv6 仍走物理出口的双栈配置。

## 路由选择与逐跳转发：TTL 与 ICMP

**路由选择**（routing）维护路径信息，**分组转发**（packet forwarding）使用这些信息处理到达的数据包。在一个普通 IPv4 以太网路由器上，可把转发方向概括为：

1. 接收入站帧，检查并移除链路层封装。
2. 按目的 IP 和适用策略查找转发表，确定下一跳与出接口。
3. 递减 IPv4 TTL；若减至 0 且非发往本机则丢弃，并按适用规则生成差错报文[^ttl]。
4. 因头部字段改变而更新 IPv4 头部校验和。IPv6 的 Hop Limit 同样逐跳递减，IPv6 基础头部没有校验和字段[^ipv6-hdr]。
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

```mermaid title="三次链路交付中的 MAC、IP 与 TTL" description="同一个 IPv4/TCP 包在三段以太网链路上的发送快照。R1 与 R2 分别去掉入站帧，查路由，递减 TTL，并更新 IPv4 头部校验和后重新成帧。源和目的 IP、TCP 端口及载荷在本例中保持不变。每份帧有自己的 FCS，省略实际校验值与其他字段；箭头表示路由转发的先后，不代表时间或距离。"
flowchart TB
 subgraph first[第 1 跳：A → R1 的帧]
  eth1["Ethernet Header<br/>源 MAC = 00:00:5e:00:53:01<br/>目的 MAC = 00:00:5e:00:53:02"]
  ip1["IPv4 Header<br/>源 IP = 192.168.1.10<br/>目的 IP = 198.51.100.20<br/>TTL = 64"]
  tcp1["TCP Header + Data<br/>端口 = 50001 → 443<br/>载荷 = 本次发送的字节"]
  fcs1["Ethernet Trailer / FCS"]
  eth1 --- ip1
  ip1 --- tcp1
  tcp1 --- fcs1
 end
 subgraph second[第 2 跳：R1 → R2 的帧]
  eth2["Ethernet Header<br/>源 MAC = 00:00:5e:00:53:03<br/>目的 MAC = 00:00:5e:00:53:04"]
  ip2["IPv4 Header<br/>源 IP = 192.168.1.10<br/>目的 IP = 198.51.100.20<br/>TTL = 63"]
  tcp2["TCP Header + Data<br/>端口 = 50001 → 443<br/>载荷 = 同一批字节"]
  fcs2["Ethernet Trailer / FCS"]
  eth2 --- ip2
  ip2 --- tcp2
  tcp2 --- fcs2
 end
 subgraph third[第 3 跳：R2 → B 的帧]
  eth3["Ethernet Header<br/>源 MAC = 00:00:5e:00:53:05<br/>目的 MAC = 00:00:5e:00:53:06"]
  ip3["IPv4 Header<br/>源 IP = 192.168.1.10<br/>目的 IP = 198.51.100.20<br/>TTL = 62"]
  tcp3["TCP Header + Data<br/>端口 = 50001 → 443<br/>载荷 = 同一批字节"]
  fcs3["Ethernet Trailer / FCS"]
  eth3 --- ip3
  ip3 --- tcp3
  tcp3 --- fcs3
 end
 first -->|R1 去帧、选路、重新封装| second
 second -->|R2 去帧、选路、重新封装| third
 linkStyle 0,1,2,3,4,5,6,7,8 stroke:none
```

第一份帧的目的 MAC 是 R1 的入口，第二份的源 MAC 则是 R1 的出口；R1 不会把 A 的 MAC 原样带到下一段链路。R2 再以自己的出口 MAC 向 B 成帧。B 收到包后做本机交付，不会因为自己是第三份帧的接收者，就再执行一次路由转发的 TTL 递减。

| 组成部分 | 经过 R1、R2 时发生什么 |
| --- | --- |
| 以太网头与帧尾 | 每段链路重新生成源 / 目的 MAC 与 FCS |
| IPv4 头 | 源 / 目的 IP 保留；TTL 递减，头部校验和随之更新 |
| TCP 头与载荷 | 本例中保持不变；IPv4 TTL 不参与 TCP 伪头部校验和计算 |

所以“IP 地址不变”并不等于“整个 IP 头不变”。路由器转发的是去掉旧链路封装后的 IP 包；TCP 确认与重传由两端的 TCP 处理，见[第四篇的序号与确认示例](/posts/networking/transport-tcp-udp-socket-quic/#tcp-的序号确认与重传)[^forward-packet]。

### TTL 耗尽后怎样反馈

**互联网控制报文协议**（Internet Control Message Protocol，ICMP）用来报告 IP 层状态与差错。下表列出 IPv4 的常见 ICMP 报文。**IPv6 互联网控制报文协议**（Internet Control Message Protocol for IPv6，ICMPv6）使用独立的类型编号[^2][^3]。

| IPv4 ICMP 报文 | 典型用途 |
| --- | --- |
| 回显请求／回显应答（Echo Request／Echo Reply，类型 8／0） | `ping` 测试这类探测是否得到回应，并测量往返时间 |
| 超时（Time Exceeded，类型 11） | 报告 TTL 等超时；传统 `traceroute` 借助递增 TTL 观察响应者 |
| 目的不可达（Destination Unreachable，类型 3） | 报告目标或端口不可达，以及设置**不分片标志**（Don't Fragment，DF）后仍需分片等情况 |

IPv6 路由器遇到 Hop Limit 耗尽时可返回超时报文，遇到包超过出接口允许的大小时会返回**数据包过大**（Packet Too Big）报文[^3]。**路径最大传输单元**（Path Maximum Transmission Unit，PMTU）取路径上各链路 MTU 的最小值。源端可用这类报文调整对 PMTU 的估计，参见第八篇的[路径 MTU 诊断](/posts/networking/network-diagnostics-performance-troubleshooting/)[^pmtu]。

:::tip[怎样解读 traceroute 的星号]
`*` 表示对应探测在等待窗口内没有获得预期回应，可能涉及控制报文限速、过滤、回程丢失或路径变化。它不能单独证明业务包在该处丢弃；后续跳或目标有响应时，尤其不能把中间星号当作转发故障。响应包的源地址也未必就是探测包经过的入口接口。
:::

## NAT：多台内网设备如何共用一个公网 IP

[私网地址](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)不用于普通全球公网路由。家庭网络若用多个私网 IPv4 地址共享一个公网 IPv4 地址，出口常采用 NAPT，同时改写地址与端口。这种做法也常称为**端口地址转换**（Port Address Translation，PAT）[^pat]。**基本网络地址转换**（Basic NAT）只转换地址，保留端口[^4]。

**源网络地址转换**（Source Network Address Translation，SNAT）和**目的网络地址转换**（Destination Network Address Translation，DNAT）按改写的字段命名。NAPT 强调端口参与映射，**端口转发**（port forwarding）则是常见的配置场景[^4][^netfilter]。

| 名称 | 改动 | 例子 |
| --- | --- | --- |
| SNAT | 某方向包的源地址，必要时也改源端口 | 出站把私网源地址转换为出口地址 |
| DNAT | 某方向包的目的地址，必要时也改目的端口 | 把访问公网地址的请求交给内部服务 |
| NAPT / PAT | 在地址转换中引入传输端口映射 | 多台主机共用同一个公网 IPv4 |
| 端口转发 | 常见的静态入向 DNAT 配置场景 | `203.0.113.5:8443 → 192.168.1.20:443` |

家用设备往往同时执行 NAT 与防火墙规则：前者改写地址端口，后者决定是否放行，两者都不提供传输加密。如果家庭 NAT 外还有[运营商的 CGNAT](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)，在家庭路由器上配置端口转发只解决入站路径中的一层。

假设路由器公网地址为文档示例地址 `203.0.113.5`，两台内网主机访问同一个 TCP 服务，源端口恰好相同。下面是本次通信的一种可能转换：

| 内网源地址 | 公网侧源地址 | 目标地址 |
| --- | --- | --- |
| `192.168.1.10:50001` | `203.0.113.5:61001` | `198.51.100.20:443` |
| `192.168.1.11:50001` | `203.0.113.5:61002` | `198.51.100.20:443` |

取表中的第一条映射，把 NAPT 两侧的出站包与返回包分别展开。这里只看 IP 与 TCP 头；以太网头仍像上一节那样按链路重新封装。

```mermaid title="NAPT 两侧的出站包与返回包" description="两组分别展示一次出站与对应返回，使用表中主机 .10 的映射。出站改源 IP 与源端口；响应在映射有效且过滤允许时恢复目的 IP 与目的端口。它们属于同一条端到端 TCP 连接，NAPT 不生成 TCP 确认。省略逐跳变化的 TTL、链路头与实际校验和数值；主机 .11 的另一条映射同理，公网端口为 61002。"
flowchart TB
 subgraph outbound[出站：内网 → 公网]
  subgraph out_lan[内网侧]
   out_lan_ip["IPv4 Header<br/>源 = 192.168.1.10<br/>目的 = 198.51.100.20"]
   out_lan_tcp["TCP Header<br/>源端口 = 50001<br/>目的端口 = 443"]
   out_lan_ip --- out_lan_tcp
  end
  subgraph out_wan[公网侧]
   out_wan_ip["IPv4 Header<br/>源 = 203.0.113.5<br/>目的 = 198.51.100.20"]
   out_wan_tcp["TCP Header<br/>源端口 = 61001<br/>目的端口 = 443"]
   out_wan_ip --- out_wan_tcp
  end
  out_lan -->|改源地址端口，调整校验和| out_wan
 end
 subgraph inbound[返回：公网 → 内网]
  subgraph in_wan[公网侧]
   in_wan_ip["IPv4 Header<br/>源 = 198.51.100.20<br/>目的 = 203.0.113.5"]
   in_wan_tcp["TCP Header<br/>源端口 = 443<br/>目的端口 = 61001"]
   in_wan_ip --- in_wan_tcp
  end
  subgraph in_lan[内网侧]
   in_lan_ip["IPv4 Header<br/>源 = 198.51.100.20<br/>目的 = 192.168.1.10"]
   in_lan_tcp["TCP Header<br/>源端口 = 443<br/>目的端口 = 50001"]
   in_lan_ip --- in_lan_tcp
  end
  in_wan -->|查映射，允许后恢复目的| in_lan
 end
 outbound --- inbound
 linkStyle 0,1,3,4,6 stroke:none
```

路由器修改出站包的源地址和端口，并更新 IPv4 头部和 TCP 校验和。使用 UDP 时，已启用的 UDP 校验和也要更新。TCP 和 UDP 的校验都涉及包含 IP 地址的伪头部[^4]。响应到达 `203.0.113.5:61002` 后，路由器按有效映射和过滤策略处理，再把目的地址恢复为 `192.168.1.11:50001`，转发至内网。公网端口如何分配、多久过期，取决于实现、协议与配置，不由这张示例表统一规定。

这里必须分开理解三件事：

- **映射**（mapping）：内网地址端口对应哪个外部地址端口，以及联系不同远端时能否复用映射。
- **入向过滤**（inbound filtering）：已存在映射时，允许哪些远端发来的包进入。
- **连接跟踪**（connection tracking）：设备为会话维护什么状态；常见模型使用源/目的地址、源/目的端口和协议组成的五元组，但不能把所有 NAT 映射的键都定义为五元组。

RFC 4787 分别描述 UDP 的映射与过滤行为。它指出，旧分类中的**完全锥形 NAT**（Full Cone NAT）、**受限锥形 NAT**（Restricted Cone NAT）和**对称型 NAT**（Symmetric NAT）等名称不足以准确描述实际实现。这份文档的行为要求针对 UDP[^5]。

在 Linux Netfilter 中，连接跟踪可关联原方向与应答方向。状态防火墙可拿这些状态作放行条件，NAT 可据此沿用映射，二者分别受规则控制。**透明代理**（transparent proxy）还需要在本地接收流量并处理出站。例如 Linux 的 `TPROXY` 机制可以保留包的原目的信息，并把包交给透明套接字（transparent socket），通常需配合标记与策略路由。相关入口对照见[第七篇](/posts/networking/proxies-tunnels-transparent-interception/#透明接管tun-提供-ip-包域名需要额外关联)[^netfilter]。

一个常见例子是 Linux 上 Docker 的**桥接网络**（bridge network）。一对**虚拟以太网设备**（Virtual Ethernet Device，`veth`）分别位于容器的网络命名空间与宿主机，宿主端连到网桥，同一网桥内可以二层交付。访问外部网络时由宿主机路由转发，默认桥接配置常用**地址伪装**（masquerade），把出站包的源地址转换为宿主机的出口地址。发布端口则是另外的入站配置。具体规则还取决于网关模式与防火墙后端[^bridge]。

### NAT 与应用代理改变了什么

没有动态映射或静态转发安排时，外部主机通常无法主动找到某台内部主机的服务；有了映射也不意味着所有入站包都会放行。**对等通信**（Peer-to-Peer，P2P）的 NAT 穿透还需考虑映射、过滤、地址发现与中继等机制，不能只根据一个“NAT 类型”推断连接一定成功。

**普通 NAT 转换保留了两端的 TCP 连接，应用代理则通常建立两段独立连接。** NAT 改写包头，不因为执行转换就成为 TCP 接收端。使用 HTTP `CONNECT` 或 SOCKS5 建立 TCP 会话时，代理接收客户端连接，再建立自己的出站连接[^proxy-protocols]。网站看到的源地址可能都发生了变化，但 TCP 确认、缓冲和连接关闭的边界不同。第四篇会解释 [套接字与传输连接](/posts/networking/transport-tcp-udp-socket-quic/)，第七篇再展开代理的双向转发。

## 虚拟网络接口：TUN 与 TAP 如何接入协议栈

路由选择得到一个出口接口，这个接口可以由软件提供。TUN 与**二层虚拟以太网接口**（Ethernet Tunnel Interface，TAP）都能把内核网络栈连接到用户态程序。**虚拟专用网络**（Virtual Private Network，VPN）可通过外部网络提供私有连接。三层 VPN 可使用 TUN 收发 IP 包，二层桥接可使用 TAP 收发以太网帧[^tun-name][^6]。

| 接口类型 | 用户态处理的数据单元 | 常见用途 |
| --- | --- | --- |
| TAP | 以太网帧，包含链路层头部 | 虚拟机桥接、二层网络模拟 |
| TUN | IP 包，不含以太网帧头 | 三层 VPN、通过 IP 包入口工作的透明代理 |

平台接口不同：Linux 常通过 `/dev/net/tun` 创建 TUN/TAP，macOS 的三层隧道接口通常显示为 `utunX`；Linux 的设备配置接口（Application Programming Interface，API）不应被解释为所有平台的统一创建方式。用户态读写时还可能有平台专用元数据，表中描述的是核心网络数据单元。Apple 的 Network Extension 提供 `NEPacketTunnelProvider` / `packetFlow` 等隧道接口及包含、排除路由配置，但并非所有 `utun` 都由同一种 API 创建[^apple-tunnel]。

| 目的 | Linux | macOS |
| --- | --- | --- |
| 查看 IPv4 / IPv6 路由 | `ip route` / `ip -6 route` | `netstat -rn -f inet` / `netstat -rn -f inet6` |
| 查询特定目标 | `ip route get <IPv4>` / `ip -6 route get <IPv6>` | `route -n get <IPv4>` / `route -n get -inet6 <IPv6>` |
| 检查策略控制 | `ip rule`、`fwmark` 和相应路由表 | 接口作用域、系统路由与具体 Network Extension 配置 |
| 三层接口 | TUN 设备及其创建程序 | `utunX` 及其创建程序或扩展 |

macOS 的接口作用域与网络扩展策略有自己的实现，表中的命令只按观察目的对应。判断出站是否绕过虚拟入口，仍需结合该平台的选路结果。

TUN 本身只确定“程序可以读写 IP 包”。它既不规定加密协议，也不规定是否终结 TCP，更不保证所有应用流量都会进入该接口。范围由 IPv4/IPv6 路由、策略规则和排除项共同决定。

### TUN、代理与 IP 隧道的处理区别

| 机制 | 接口之后的主要处理 | 回程如何回到应用 |
| --- | --- | --- |
| TUN 接口 | 交付 IP 包，后续由使用它的程序决定 | 程序向接口写入符合该平台要求的入站 IP 包，交给内核处理 |
| 通过 TUN 接管的代理 | 可终结应用侧传输连接，取出载荷，再建立独立的直连或代理出站 | 把出站结果交回应用侧协议栈，构造相应包写回 TUN |
| IP VPN 隧道 | 通常将内层 IP 包封装或保护后，传给远端隧道端点 | 收到外层流量后解封装，把内层回包写回接口 |

这几行可以组合，但不能混为同一机制。代理重建连接时，不一定把原始 IP 包逐个套上外层头；因此，第八篇讨论 MTU 时不能仅凭“启用了 TUN”推导固定的隧道头开销。应用自身的 HTTPS、代理链路加密与 VPN 封装也分别由相应协议决定。

```mermaid title="同一个 TUN 入口之后的两种处理" description="比较两种实现，不是同一条连接依次经过两种模式。左支限定终结应用侧 TCP 的用户态代理，创建独立出站连接；右支限定把完整内层 IP 包加密封装到 UDP/IP 的一种三层 VPN，远端解封装后继续转发原包。两种程序的外层出站都需要可用的绕行路由；标记、策略或接口绑定的效果必须按平台验证。图只展示出站，回程分别重建应用侧包或解封装内层回包。"
flowchart TB
 tun["内核按路由发送 IP 包<br/>用户态从 TUN 读取"] --> proxy["TUN 代理<br/>协议栈终结应用侧 TCP"]
 proxy --> socket["取得载荷，新建出站套接字<br/>拥有独立确认、重传与关闭"]
 socket --> bypass["按策略与实际选路绕过 TUN<br/>直连或交给远端代理"]
 tun --> vpn["三层 IP VPN<br/>保留完整内层 IP 包"]
 vpn --> outer["加密封装为外层 UDP/IP<br/>路由到远端隧道端点"]
 outer --> peer["远端解密并去掉外层头<br/>继续转发内层 IP 包"]
```

再把右支的封装展开。设本机物理接口地址为 `192.168.1.10`，VPN 对端使用文档地址 `203.0.113.9`，内层仍要访问 `198.51.100.20`。下面选用“完整内层 IP 包经 VPN 加密后由 UDP 承载”的一种模型，观察本机物理出口、上游可能执行的 NAT 之前：

```mermaid mobile-direction="TB" title="TUN 原包与 IP VPN 外层包的包含关系" description="左侧是程序从 TUN 读到的 IP 包，右侧是本机随后生成的一个 UDP/IP 外层包的逻辑结构。内层 IP 与 TCP 头在加密前具有标出的值，物理线路上的 VPN 保护区为密文，旁观者不能直接读取这些内层字段。端口仅为示例，省略 VPN 元数据、认证标签和外层链路封装，不推导固定开销或所有 VPN 的封装方式。"
flowchart LR
 original["TUN 原包（内层 IPv4/TCP）<br/>源 IP = 192.168.1.10<br/>目的 IP = 198.51.100.20<br/>TCP：50001 → 443<br/>原始载荷"]
 subgraph outer_packet[物理出口的外层 IPv4 包]
  outer_ip["外层 IPv4 头<br/>源 = 192.168.1.10<br/>目的 = 203.0.113.9<br/>Protocol = 17（UDP）"]
  outer_udp["外层 UDP 头<br/>端口 = 52000 → 51820"]
  ciphertext["VPN 元数据与保护后的载荷<br/>密文内部承载原 IP 包<br/>解密后：内层 IP 仍指向 198.51.100.20"]
  outer_ip --- outer_udp
  outer_udp --- ciphertext
 end
 original -->|VPN 加密并封装| ciphertext
 linkStyle 0,1 stroke:none
```

外层目的 IP 让普通路由把包送到 VPN 对端；对端解密、去掉外层封装后，才按内层目的 IP 继续转发。这里的内层地址没有被外层地址简单替换，外层也有自己的 TTL 与路由。反过来，左支的代理若终结应用侧 TCP，物理出口通常出现的是独立出站连接的包，不能套用这张“完整内层包在里面”的结构。

读到 TUN 时，先核对哪条路由把包交给接口，以及程序写回后内核如何处理。代理如何终结应用侧 TCP、建立独立出站并处理回程，见[第七篇的 TUN 连接与返回路径](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)。

## 观察路由与转发路径：实验与边界

实验先回答本机把包交给哪里，再观察哪些中间设备愿意回应探测。选路查询只读取本机配置，不向查询地址发送业务包；`traceroute` 则会发送真实网络探测，应在允许探测该目标的本机终端运行。两类命令都不需要修改路由，也不能用在线代码运行环境的网络配置代替本机结果。

### 实验一：查看完整路由表与特定目标的选路结果

在 macOS 上查看 IPv4 路由表，再查询一个具体目标。这里的地址只是用于选路对照，不代表它一定提供可用的网站服务：

```bash frame="code"
netstat -rn -f inet
route -n get 198.51.100.20
```

Linux 对应为：

```bash frame="code"
ip route show
ip route get 198.51.100.20
ip rule show
```

macOS 的 `route -n get` 常见字段包括：

- `destination`、`mask`：本次查询关联的目标或前缀，具体打印方式依路由类型而异。
- `gateway`：经网关的路由显示下一跳，直连接口路由也可能显示链路标识或邻居信息。
- `interface`：当前选择的物理或虚拟接口，例如 `en0` 或 `utunX`。

将输出与路由表对照，再换一个局域网目标重复查询，可以观察默认路由与更具体路由的区别。存在策略、接口作用域或应用自行绑定接口时，普通查询结果仍需与应用实际使用的连接条件核对。

如果公网 IPv4 目标的选路结果指向 `utun` 虚拟接口，就需要按实际的接管路径解释连接。抓包与计时之前，应先确认流量在哪个接口进入代理。

### 实验二：观察逐跳路径与 TTL 触发的 ICMP 响应

下面限制最多探测 5 跳，每跳一次探测，单次等待最多 1 秒；数字输出可跳过反向 DNS 查询，避免因把 IP 地址查成名称而引入额外等待。

```bash frame="code"
traceroute -n -m 5 -q 1 -w 1 example.com
```

左侧数字对应探测包的初始 TTL，右侧若有响应则显示响应者地址与测得的往返耗时。最多 5 跳未到目标是这个实验主动设置的范围限制，不能据此判断目标不可达。实际目标可换成已经确认解析出的 IPv4 地址。

`route get` 观察本地决策，不知道后续路由器会怎样转发；`traceroute` 记录这轮探测的响应，不保证不同探测经过同一条路径。去程与回程也可能不对称，单侧结果不能证明响应沿原路返回。需要判断业务连接时，还应结合第八篇的[分层排障与控制变量实验](/posts/networking/network-diagnostics-performance-troubleshooting/)。

## 总结

- 固定路由表内优先匹配更具体的前缀；策略规则还可能先选择不同的表。下一跳地址与包头目的地址承担不同职责。
- 路由转发逐跳递减 TTL/Hop Limit，并重新封装出口链路；ICMP 回应的有无不能直接等同于业务转发是否成功。
- NAPT 改写地址端口，映射、过滤和会话状态需要分别理解；它不会因为转换地址而终结两端 TCP。
- TUN 提供 IP 包入口，代理与 VPN 决定后续处理。接管范围、出站绕行和回包交付共同决定通信能否成立。

下一篇沿协议栈向上，讨论[《计算机网络（四）：TCP、UDP、Socket 与可靠传输》](/posts/networking/transport-tcp-udp-socket-quic/)：不可靠的逐跳 IP 交付，怎样支撑有序字节流，应用读写连接时又能依赖哪些保证？

## 延伸阅读

- [RFC 4787 §3—5](https://www.rfc-editor.org/rfc/rfc4787.html#section-3)——分别理解 UDP NAT 的映射与入向过滤，以及旧 Cone/Symmetric 分类的局限
- [Linux Kernel: Universal TUN/TAP device driver](https://docs.kernel.org/networking/tuntap.html)——Linux 设备创建、多队列与文件描述符交互细节

[^1]: 〔RFC〕[RFC 4632 §5.1](https://www.rfc-editor.org/rfc/rfc4632.html#section-5.1)——转发时选择最具体的匹配前缀。

[^example-ip]: 〔RFC〕[RFC 5737 §3—4](https://www.rfc-editor.org/rfc/rfc5737.html#section-3)——`198.51.100.0/24`（TEST-NET-2）等地址段保留供文档示例使用，不应出现在公共互联网上。

[^policy]: 〔平台与实现〕[Linux ip-rule(8)](https://man7.org/linux/man-pages/man8/ip-rule.8.html)——规则优先级、源地址/fwmark 等匹配条件，以及按规则查询路由表。

[^2]: 〔RFC〕[RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792.html)——IPv4 Echo、Destination Unreachable 和 Time Exceeded 报文。

[^3]: 〔RFC〕[RFC 4443 §3](https://www.rfc-editor.org/rfc/rfc4443.html#section-3)——ICMPv6 差错报文，包括 Packet Too Big 与 Time Exceeded。

[^4]: 〔RFC〕[RFC 3022 §2、§4](https://www.rfc-editor.org/rfc/rfc3022.html#section-2)——Basic NAT 与 NAPT、双向地址端口转换及校验和调整。

[^5]: 〔RFC〕[RFC 4787 §3、§4.1、§5](https://www.rfc-editor.org/rfc/rfc4787.html#section-3)——旧 NAT 分类的不足，以及 UDP 地址/端口映射和入向过滤的独立描述。

[^6]: 〔平台与实现〕[Linux Kernel: Universal TUN/TAP device driver](https://docs.kernel.org/networking/tuntap.html)——TUN 处理 IP 包、TAP 处理以太网帧，以及用户态读写与内核收发之间的关系；其创建 API 示例针对 Linux。

[^tun-name]: 〔平台与实现〕[OpenBSD tun(4)](https://man.openbsd.org/tun.4)——手册将 `tun` 称为三层隧道接口，将 `tap` 称为以太网隧道接口。

[^pat]: 〔平台与实现〕[Cisco IOS XE: Port Address Translation](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/nat/nat-configuration-guide/nat.html)——PAT 的英文名称及端口区分方式。

[^pmtu]: 〔RFC〕[RFC 8201 §2、§3](https://www.rfc-editor.org/rfc/rfc8201.html#section-2)——链路 MTU、路径 MTU，以及如何根据 Packet Too Big 报文更新路径 MTU。

[^proxy-protocols]: 〔RFC〕[RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)与[RFC 1928 §4、§6](https://www.rfc-editor.org/rfc/rfc1928.html#section-4)——HTTP `CONNECT` 方法和 SOCKS5 的 TCP 连接请求。

[^ttl]: 〔RFC〕[RFC 1812 §5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.3.1)——IPv4 路由器转发时递减 TTL，TTL 耗尽时丢弃并按规则生成 ICMP Time Exceeded；本机交付与转发处理需要区分。

[^forward-packet]: 〔RFC〕[RFC 1812 §5.2.1、§5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2.1)——IPv4 转发、出接口封装、TTL 与头部校验和更新；[RFC 9293 §3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.1)定义 TCP 校验和覆盖的伪头部，其中不包含 IPv4 TTL。

[^ipv6-hdr]: 〔RFC〕[RFC 8200 §3、§4.5](https://www.rfc-editor.org/rfc/rfc8200.html#section-3)——IPv6 固定 40 字节基础头部取消头部校验和字段，仅保留 Hop Limit 逐跳递减。

[^apple-tunnel]: 〔平台与实现〕[Apple: NEPacketTunnelProvider](https://developer.apple.com/documentation/networkextension/nepackettunnelprovider)、[NEPacketTunnelFlow](https://developer.apple.com/documentation/networkextension/nepackettunnelflow)与[NEIPv4Settings](https://developer.apple.com/documentation/networkextension/neipv4settings)——Packet Tunnel 的包读写及包含、排除路由；不把 Linux TUN API 套用为 macOS 的统一实现。

[^netfilter]: 〔平台与实现〕[nftables 官方手册：Connection tracking](https://netfilter.org/projects/nftables/manpage.html)与[Linux 内核文档：透明代理](https://docs.kernel.org/networking/tproxy.html)——连接状态匹配、状态 NAT 与 TPROXY 的路由和套接字要求。

[^bridge]: 〔软件与平台实现〕[Docker Engine：Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)与 [Linux veth(4)](https://man7.org/linux/man-pages/man4/veth.4.html)——bridge 驱动的连通、转换与端口发布，以及 veth 对在命名空间之间的连接方式。

[^iproute]: 〔平台与实现〕[Linux ip-route(8)](https://man7.org/linux/man-pages/man8/ip-route.8.html)——`throw` 路由与按目标查询实际选路的 `get` 子命令。

---
title: "计算机网络（三）：路由转发、NAT 与虚拟网络接口"
description: "解释最长前缀匹配与策略路由的边界，追踪 TTL、ICMP 和 NAPT 地址转换，并区分 TUN 接口、代理重建连接与 IP 隧道的处理方式。"
publishDate: "20 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（二）：IP 寻址、子网划分与局域网通信》](/posts/networking/ip-addressing-subnet-lan-delivery/)用普通单接口配置解释了[直连子网与默认网关](/posts/networking/ip-addressing-subnet-lan-delivery/#子网掩码cidr-与同网段判定)。本篇把这一模型推广到多接口和多条路由：下一跳如何选出，转发途中哪些头部会改变，虚拟接口又怎样把包交给用户态程序。

沿着这个顺序，可以分别理解三种不同动作：路由决定交给哪里，NAT 改写地址与端口，TUN 提供内核与程序之间的 IP 包接口。第七篇再把它们组合成具体的代理接管与出站过程。

## 路由表与最长前缀匹配

路由表按“目的网络前缀 → 下一跳 / 出接口 / 其他属性”组织条目，而不是为每一个可能的 IP 单独建表。先看一个只讨论 IPv4、固定查找同一张路由表的简化例子：

| 目的前缀 | 下一跳 | 出口接口 | 含义 |
| --- | --- | --- | --- |
| `127.0.0.0/8` | 本机 | `lo0` | 回环通信 |
| `192.168.1.0/24` | 直连（on-link） | `en0` | 直接解析该链路上的目标邻居 |
| `192.168.1.99/32` | `192.168.1.254` | `en0` | 单个主机经指定网关转发 |
| `0.0.0.0/0` | `192.168.1.1` | `en0` | 没有更具体匹配时使用的默认路由 |

同一张表内多条目的前缀同时匹配时，**最长前缀匹配**（Longest Prefix Match，LPM）优先选择前缀位数最多、范围最具体的条目[^1]。访问 `192.168.1.99` 时，`/32` 比 `/24` 和 `/0` 都更具体，所以本例把包交给 `192.168.1.254`。这也说明“属于本机 `/24`”并不在所有配置下都等于直接交付。

只有当多条候选路由的前缀长度相同时，才进一步按具体平台的管理距离（Administrative Distance / Preference）、度量值（Metric）或多路径规则（例如**等价多路径路由**，Equal-Cost Multi-Path，ECMP）处理。更一般地，Linux 的**策略路由**（Policy-Based Routing）可先按源地址、入口接口或防火墙标记（`fwmark`）等匹配规则，决定查询哪张路由表；不能把整套决策都概括为对一张表做一次最长前缀匹配[^policy]。

在 Linux 上，**路由策略数据库**（Routing Policy Database，RPDB）按规则优先级数字从小到大处理。某条规则选择 `lookup` 表时，先在该表内找匹配路由。如果规则不匹配、表内无适用结果，或 `throw` 路由让该次查表结束，查询可继续下一条适用规则。已有终结动作（如 `unreachable`）则直接返回结果，不再尝试后面的表。用 `ip rule show` 查看规则顺序，再用 `ip route get` 或 `ip -6 route get` 对具体目标验证[^policy][^iproute]。

查表得到下一跳，并不会把包的目的 IP 改成网关 IP。发往 `198.51.100.20` 的包，在普通转发中仍以它为目的地址；若出口是以太网，内核通过上一篇的 [ARP](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv4-的地址解析arp) 找到网关 MAC，把它填进当前链路的帧头。目的 IP 与下一跳 MAC 分别服务于跨网寻址和本跳交付。

:::note[两条 /1 路由能覆盖什么]
`0.0.0.0/1` 与 `128.0.0.0/1` 共同覆盖 IPv4 地址空间，并优先于原有 `/0` 默认路由。因此，把它们指向虚拟接口，可以接管原本依赖默认路由的 IPv4 流量；`/24`、`/32` 等更具体路由仍可能优先命中，策略规则也可能选择其他表。它们不控制 IPv6，删除这两条路由后的行为还取决于剩余配置。
:::

下面是两个独立配置的查询结果对照，目标均为 `198.51.100.20`，固定同一张 IPv4 路由表且没有更具体的例外：

| 配置 | 相关候选路由 | 本次命中 |
| --- | --- | --- |
| A：未接管 | `/0 → en0` | 经物理出口的默认路由 |
| B：另有 TUN 路由 | `/0 → en0`、`0.0.0.0/1 → utun`、`128.0.0.0/1 → utun` | 目标首位为 1，命中 `128.0.0.0/1` |

两种配置分别得到不同的出口。IPv6 则使用 `::/0` 及其更具体路由，可能出现 IPv4 进入 TUN、IPv6 仍走物理出口的双栈配置。

## 路由选择与逐跳转发：TTL 与 ICMP

**路由选择**维护路径信息，**分组转发**使用这些信息处理到达的数据包。在一个普通 IPv4 以太网路由器上，可把转发方向概括为：

1. 接收入站帧，检查并移除链路层封装。
2. 按目的 IP 和适用策略查找转发表，确定下一跳与出接口。
3. 递减 IPv4 **生存时间**（Time to Live，TTL）；若减至 0 且非发往本机则丢弃，并按适用规则生成差错报文[^ttl]。
4. 因头部字段改变而更新 IPv4 头部校验和（IPv6 对应的**跳数限制** Hop Limit 同样逐跳递减，但 IPv6 基础头部没有校验和，不执行头部校验和重算[^ipv6-hdr]）。
5. 对下一跳完成必要的邻居解析，重新封装该出口链路的帧后发送（帧头的源/目的 MAC 地址每一跳都会被改写）。

实际设备还可能执行防火墙、NAT、排队或硬件卸载，这里只保留理解逐跳交付需要的部分。TTL 是有限的转发预算，避免路由环路让同一个包长期存活；它能经过多少跳取决于初始值。

**互联网控制报文协议**（Internet Control Message Protocol，ICMP）用来报告 IP 层状态与差错。以下类型号属于 IPv4 ICMP，不能直接套给 ICMPv6[^2][^3]：

| IPv4 ICMP 报文 | 典型用途 |
| --- | --- |
| Echo Request / Reply（Type 8 / 0） | `ping` 测试这类探测是否得到回应，并测量往返时间 |
| Time Exceeded（Type 11） | 报告 TTL 等超时；传统 `traceroute` 借助递增 TTL 观察响应者 |
| Destination Unreachable（Type 3） | 报告目标或端口不可达，以及设置**不分片标志**（Don't Fragment，DF）后仍需分片等情况 |

IPv6 使用独立的 ICMPv6 类型，例如 Hop Limit 超时和 Packet Too Big。后者与第八篇的[路径 MTU 诊断](/posts/networking/network-diagnostics-performance-troubleshooting/)直接相关：路径上的路由器无法转发某种大小的包时，源端需要相应反馈来调整发送。

:::tip[怎样解读 traceroute 的星号]
`*` 表示对应探测在等待窗口内没有获得预期回应，可能涉及控制报文限速、过滤、回程丢失或路径变化。它不能单独证明业务包在该处丢弃；后续跳或目标有响应时，尤其不能把中间星号当作转发故障。响应包的源地址也未必就是探测包经过的入口接口。
:::

## NAT：多台内网设备如何共用一个公网 IP

[私网地址](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)不用于普通全球公网路由。家庭网络若用多个私网 IPv4 地址共享一个公网 IPv4 地址，出口常采用**网络地址端口转换**（Network Address Port Translation，NAPT，也称 PAT），同时改写地址与端口。只转换地址、不转换端口的 Basic NAT 则是另一种形式[^4]。

SNAT、DNAT 按改写方向命名，NAPT 强调端口参与映射，端口转发则是常见的配置场景[^4]：

| 名称 | 改动 | 例子 |
| --- | --- | --- |
| SNAT | 某方向包的源地址，必要时也改源端口 | 出站把私网源地址转换为出口地址 |
| DNAT | 某方向包的目的地址，必要时也改目的端口 | 把访问公网地址的请求交给内部服务 |
| NAPT / PAT | 在地址转换中引入传输端口映射 | 多台主机共用同一个公网 IPv4 |
| 端口转发 | 常见的静态入向 DNAT 配置场景 | `203.0.113.5:8443 → 192.168.1.20:443` |

家用设备往往同时执行 NAT 与防火墙规则：前者改写地址端口，后者决定是否放行，两者都不提供传输加密。家庭 NAT 之外还有 CGNAT 时，家庭端口转发只解决其中一层，参见[共享地址与入站路径](/posts/networking/ip-addressing-subnet-lan-delivery/#ip-地址的作用范围公网私网与共享地址)。

假设路由器公网地址为文档示例地址 `203.0.113.5`，两台内网主机使用相同源端口访问同一个 TCP 服务。下面是本次通信的一种可能转换：

| 内网源地址 | 公网侧源地址 | 目标地址 |
| --- | --- | --- |
| `192.168.1.10:50001` | `203.0.113.5:61001` | `198.51.100.20:443` |
| `192.168.1.11:50001` | `203.0.113.5:61002` | `198.51.100.20:443` |

```mermaid mobile-direction="TB" title="同一公网 IP 上两条 NAPT 映射的往返" description="上下两条映射属于同一台 NAPT 路由器，示例地址端口与表格一致。出站时改写源地址端口，返回时在映射仍有效且过滤策略允许的条件下恢复目的地址端口。映射状态不会因为画成节点就成为新的 TCP 端点；每台内网主机与服务端各自维持自己的 TCP 连接。箭头不表示真实时延或固定端口分配算法。"
flowchart LR
 hosts["两台主机的内网源地址<br/>A：192.168.1.10<br/>B：192.168.1.11<br/>相同源端口：50001"] -->|出站改写源| nat["同台 NAPT 的两条映射<br/>A → 203.0.113.5:61001<br/>B → 203.0.113.5:61002"]
 nat -->|61001 或 61002| server["目标服务：端口 443<br/>198.51.100.20"]
 server -->|回包查映射| nat
 nat -->|允许后恢复目的| hosts
```

路由器修改出站包的源地址和端口，并同时更新 IP 头部校验和与受伪头部影响的传输层（TCP/UDP）校验和。响应到达 `203.0.113.5:61002` 后，路由器按有效映射和过滤策略处理，再把目的地址恢复为 `192.168.1.11:50001`，转发至内网。公网端口如何分配、多久过期，取决于实现、协议与配置，不由这张示例表统一规定。

这里必须分开理解三件事：

- **映射**：内网地址端口对应哪个外部地址端口，以及联系不同远端时能否复用映射。
- **入向过滤**：已存在映射时，允许哪些远端发来的包进入。
- **连接跟踪**（connection tracking）：设备为会话维护什么状态；常见模型使用源/目的地址、源/目的端口和协议组成的五元组，但不能把所有 NAT 映射的键都定义为五元组。

RFC 4787 针对 UDP 分别描述映射与过滤行为，并指出旧的 Full Cone、Restricted Cone、Symmetric 等分类不足以准确描述实际实现。它没有把这些旧名称确立为完整的精确分类；其 UDP 行为要求也不能不加区分地套给 TCP[^5]。

在 Linux Netfilter 中，连接跟踪可关联原方向与应答方向。状态防火墙可拿这些状态作放行条件，NAT 可据此沿用映射，二者分别受规则控制。透明代理又在这一层之外增加本地接收和出站责任。例如 Linux TPROXY 可以把包送到透明套接字而保留原目的信息，通常需配合标记与策略路由。相关入口对照见[第七篇](/posts/networking/proxies-tunnels-transparent-interception/#透明接管tun-提供-ip-包域名需要额外关联)[^netfilter]。

一个常见工程例子是 Linux Docker 的 bridge 网络。容器网络命名空间里的接口与宿主机一端的 `veth` 配对，宿主端连到网桥，同一网桥内可以二层交付。访问外部网络时由宿主机路由转发，默认 bridge 配置常用 masquerade 进行源地址转换。发布端口则是另外的入站配置。这个例子特指 Linux bridge 驱动，具体规则还取决于网关模式与防火墙后端[^bridge]。

### NAT 与应用代理改变了什么

没有动态映射或静态转发安排时，外部主机通常无法主动找到某台内部主机的服务；有了映射也不意味着所有入站包都会放行。P2P 穿透还需考虑映射、过滤、地址发现与中继等机制，不能只根据一个“NAT 类型”推断连接一定成功。

**普通 NAT 转换保留了两端的 TCP 连接，应用代理则通常建立两段独立连接。** NAT 改写包头，不因为执行转换就成为 TCP 接收端；HTTP CONNECT 或 SOCKS5 代理接收客户端连接，再建立自己的出站连接。网站看到的源地址可能都发生了变化，但 TCP 确认、缓冲和连接关闭的边界不同。第四篇会解释 [Socket 与传输连接](/posts/networking/transport-tcp-udp-socket-quic/)，第七篇再展开代理的双向转发。

## 虚拟网络接口：TUN 与 TAP 如何接入协议栈

路由选择得到一个出口接口，这个接口可以由软件提供。**三层虚拟接口**（TUN）与**二层虚拟接口**（TAP）把内核网络栈连接到用户态程序，使程序能够收发相应层次的数据单元[^6]。

| 接口类型 | 用户态处理的数据单元 | 常见用途 |
| --- | --- | --- |
| TAP | 以太网帧，包含链路层头部 | 虚拟机桥接、二层网络模拟 |
| TUN | IP 包，不含以太网帧头 | 三层 VPN、通过 IP 包入口工作的透明代理 |

平台接口不同：Linux 常通过 `/dev/net/tun` 创建 TUN/TAP，macOS 的三层隧道接口通常显示为 `utunX`；Linux 的设备配置 API 不应被解释为所有平台的统一创建方式。用户态读写时还可能有平台专用元数据，表中描述的是核心网络数据单元。Apple 的 Network Extension 提供 `NEPacketTunnelProvider` / `packetFlow` 等隧道接口及包含、排除路由配置，但并非所有 `utun` 都由同一种 API 创建[^apple-tunnel]。

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
 proxy --> socket["取得载荷，新建出站 Socket<br/>拥有独立确认、重传与关闭"]
 socket --> bypass["按策略与实际选路绕过 TUN<br/>直连或交给远端代理"]
 tun --> vpn["三层 IP VPN<br/>保留完整内层 IP 包"]
 vpn --> outer["加密封装为外层 UDP/IP<br/>路由到远端隧道端点"]
 outer --> peer["远端解密并去掉外层头<br/>继续转发内层 IP 包"]
```

读到 TUN 时，先核对哪条路由把包交给接口，以及程序写回后内核如何处理。代理如何终结应用侧 TCP、建立独立出站并处理回程，见[第七篇的 TUN 连接与返回路径](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)。

## 观察路由与转发路径：实验与边界

实验先回答本机把包交给哪里，再观察哪些中间设备愿意回应探测。选路查询只读取本机配置，不向查询地址发送业务包；`traceroute` 则会发送真实网络探测，应在允许探测该目标的本机终端运行。两类命令都不需要修改路由，也不能用在线 Playground 的网络配置代替本机结果。

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

下面限制最多探测 5 跳，每跳一次探测，单次等待最多 1 秒；数字输出避免反向 DNS 查询引入额外等待：

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

[^policy]: 〔平台与实现〕[Linux ip-rule(8)](https://man7.org/linux/man-pages/man8/ip-rule.8.html)——规则优先级、源地址/fwmark 等匹配条件，以及按规则查询路由表。

[^2]: 〔RFC〕[RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792.html)——IPv4 Echo、Destination Unreachable 和 Time Exceeded 报文。

[^3]: 〔RFC〕[RFC 4443 §3](https://www.rfc-editor.org/rfc/rfc4443.html#section-3)——ICMPv6 差错报文，包括 Packet Too Big 与 Time Exceeded。

[^4]: 〔RFC〕[RFC 3022 §2、§4](https://www.rfc-editor.org/rfc/rfc3022.html#section-2)——Basic NAT 与 NAPT、双向地址端口转换及校验和调整。

[^5]: 〔RFC〕[RFC 4787 §3、§4.1、§5](https://www.rfc-editor.org/rfc/rfc4787.html#section-3)——旧 NAT 分类的不足，以及 UDP 地址/端口映射和入向过滤的独立描述。

[^6]: 〔平台与实现〕[Linux Kernel: Universal TUN/TAP device driver](https://docs.kernel.org/networking/tuntap.html)——TUN 处理 IP 包、TAP 处理以太网帧，以及用户态读写与内核收发之间的关系；其创建 API 示例针对 Linux。

[^ttl]: 〔RFC〕[RFC 1812 §5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.3.1)——IPv4 路由器转发时递减 TTL，TTL 耗尽时丢弃并按规则生成 ICMP Time Exceeded；本机交付与转发处理需要区分。

[^ipv6-hdr]: 〔RFC〕[RFC 8200 §3、§4.5](https://www.rfc-editor.org/rfc/rfc8200.html#section-3)——IPv6 固定 40 字节基础头部取消头部校验和字段，仅保留 Hop Limit 逐跳递减。

[^apple-tunnel]: 〔平台与实现〕[Apple: NEPacketTunnelProvider](https://developer.apple.com/documentation/networkextension/nepackettunnelprovider)、[NEPacketTunnelFlow](https://developer.apple.com/documentation/networkextension/nepackettunnelflow)与[NEIPv4Settings](https://developer.apple.com/documentation/networkextension/neipv4settings)——Packet Tunnel 的包读写及包含、排除路由；不把 Linux TUN API 套用为 macOS 的统一实现。

[^netfilter]: 〔平台与实现〕[nftables 官方手册：Connection tracking](https://netfilter.org/projects/nftables/manpage.html)与[Linux 内核文档：透明代理](https://docs.kernel.org/networking/tproxy.html)——连接状态匹配、状态 NAT 与 TPROXY 的路由和套接字要求。

[^bridge]: 〔软件与平台实现〕[Docker Engine：Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)与 [Linux veth(4)](https://man7.org/linux/man-pages/man4/veth.4.html)——bridge 驱动的连通、转换与端口发布，以及 veth 对在命名空间之间的连接方式。

[^iproute]: 〔平台与实现〕[Linux ip-route(8)](https://man7.org/linux/man-pages/man8/ip-route.8.html)——`throw` 路由与按目标查询实际选路的 `get` 子命令。

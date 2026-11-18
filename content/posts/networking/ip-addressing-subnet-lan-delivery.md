---
title: "计算机网络（二）：IP 寻址、子网划分与局域网通信"
description: "区分公网、私网与共享地址空间，用 CIDR 解释直连子网，追踪 DHCP 配置获取以及 ARP、NDP 与交换机如何把数据交给同链路目标或下一跳。"
publishDate: "19 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（一）：协议分层、封装与一次请求的路径》](/posts/networking/layered-architecture-packet-journey/)建立了四层模型，并区分了[主机、交换机与路由器的分工](/posts/networking/layered-architecture-packet-journey/#端到端与逐跳主机交换机与路由器的分工)。本篇把请求离开本机之前的准备补齐：接口有哪些地址，主机如何取得配置，以及发包时如何找到同链路目标或网关的 MAC 地址。

先理解地址的作用范围，再用普通局域网说明子网与下一跳，最后回到 DHCP 和 IPv6 自动配置。这样的阅读顺序先解释配置的含义，再解释配置从何而来；实际接入网络时，配置获取通常先于普通业务通信。

## IP 地址的作用范围：公网、私网与共享地址

IP 地址标识网络中的通信接口，而不是设备永久不变的身份。一台主机可以有多张接口，一张接口也可以同时拥有多个地址。IPv4 使用 32 位地址，通常写作 `192.168.1.10`；IPv6 使用 128 位地址，例如文档示例地址 `2001:db8::1`。两者有各自的头部格式、路由和邻居发现机制，排查双栈故障时应分别检查。

| 地址类型 | IPv4 示例或范围 | IPv6 对应概念 | 作用范围 |
| --- | --- | --- | --- |
| 公网单播地址 | 已分配且允许全球路由的地址 | 当前主要分配于 `2000::/3` 的全局单播地址 | 可用于全球路由；实际可达性仍取决于路由与策略 |
| 私网地址 | `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` | `fc00::/7` 的**唯一本地地址**（Unique Local Address，ULA） | 用于内部网络，不应作为普通源或目的地址在公网传播[^1] |
| 共享地址 | `100.64.0.0/10` | 无直接对应地址段 | 常用于**运营商级 NAT**（Carrier-Grade NAT，CGNAT）的接入网络[^2] |
| 链路本地地址 | `169.254.0.0/16` | `fe80::/10` | 限于当前链路，不由路由器转发到其他链路 |
| 环回地址 | `127.0.0.0/8`，常见 `127.0.0.1` | `::1/128` | 用于本机内部通信 |

“公网地址”不等于“任何人都能访问”：没有可用路由、入口防火墙阻止连接或服务没有监听，都会使它不可达。类似地，私网地址可以通过专线、VPN 等在组织内部跨多个子网路由；它们并非只能用于一台家用交换机连接的范围。

不同家庭可以重复使用 `192.168.1.10`，因为这些地址位于不同的地址域内。家庭网络访问公网 IPv4 时常通过下一篇的 [NAT](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip) 转换地址。如果路由器 WAN 地址位于 `100.64.0.0/10`，通常说明还有运营商侧转换，仅配置家庭路由器的端口转发不足以建立完整入站路径；是否可用还需核对运营商的映射与防火墙策略。

:::note[测试地址与 Fake-IP]
`198.18.0.0/15` 是网络设备基准测试保留段，不用于普通全球公网路由；在隔离测试网络中仍可实际使用，不能解释成“没有主机会使用”。透明代理也可能从这一范围分配 Fake-IP，把地址作为本地的域名映射标识。该地址的意义取决于代理维护的映射，具体处理留到[代理与透明接管](/posts/networking/proxies-tunnels-transparent-interception/)[^special]。
:::

## 子网掩码、CIDR 与同网段判定

**无类别域间路由**（Classless Inter-Domain Routing，CIDR）用 `地址/前缀长度` 表示网络范围。对 IPv4，`/24` 表示高 24 位为网络前缀，剩余 8 位区分范围内的地址；对应的子网掩码为 `255.255.255.0`[^3]。

以下先讨论一张普通局域网接口、直连路由和默认路由的配置：本机是 `192.168.1.10/24`，**默认网关**（Default Gateway）是 `192.168.1.1`，没有更具体的路由或策略规则。在这个模型里，由于发送方并不知道目标主机配置了什么掩码，发送方只能用**自己的子网掩码**分别对本机 IP 和目标 IP 做按位与，借此判断目标是否属于本机的直连子网：

1. 计算 `本机 IP & 子网掩码`。
2. 计算 `目标 IP & 子网掩码`。
3. 比较两者是否相等。

| 目标 | 按 `/24` 计算的前缀 | 本例的交付方式 |
| --- | --- | --- |
| 打印机 `192.168.1.50` | `192.168.1.0` | 匹配直连路由，直接交给打印机 |
| 公网目标 `93.184.216.34` | `93.184.216.0` | 不匹配直连路由，经默认网关转发 |

**实际出接口与下一跳以路由选择结果为准。** 配置地址通常会建立相应的直连路由，因而上面的掩码模型能解释最常见的结果；如果另有 `192.168.1.50/32` 主机路由，目标即使属于这个 `/24`，也可能经另一个网关转发。下一篇的[最长前缀匹配](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由表与最长前缀匹配)会把这套简化模型推广到多接口与策略路由。

### 算清一个 /27 子网

把本机改为 `192.168.10.37/27`，仍限定只有普通直连与默认路由。最后一字节的掩码为二进制 `11100000`：`37 & 224 = 32`，每个子网有 32 个地址。

| 项目 | 计算结果 |
| --- | --- |
| 子网掩码 | `255.255.255.224` |
| 网络地址 | `192.168.10.32` |
| 广播地址 | `192.168.10.63` |
| 常规主机范围 | `192.168.10.33` 至 `192.168.10.62`，共 30 个 |
| 目标 `.62` / `.64` | `.62` 属于该前缀；`.64` 属于下一个 `/27` |

再用同一个主机地址练习不同前缀，先算网络边界，再检查目标是否落在其中。

| 本机与前缀 | 网络地址与广播地址 | 可用主机与目标判断 |
| --- | --- | --- |
| `192.168.10.37/24` | `.0` 与 `.255` | `.1` 至 `.254`，目标 `.130` 在前缀内 |
| `192.168.10.37/26` | `.0` 与 `.63` | `.1` 至 `.62`，目标 `.64` 属于下一前缀 |
| `192.0.2.10/31`（点对点） | 前缀从 `.10` 开始，无定向广播地址 | `.10` 与 `.11` 均可作为端点[^31] |

下面的 Rust 程序计算子网掩码、网络地址和广播地址，并检查目标是否属于同一前缀。

```rust
use std::net::Ipv4Addr;

fn main() {
    let local = Ipv4Addr::new(192, 168, 10, 37);
    let prefix = 27_u32;
    assert!(prefix <= 32);
    let mask = u32::MAX.checked_shl(32 - prefix).unwrap_or(0);
    let network = u32::from(local) & mask;
    let broadcast = network | !mask;
    println!("mask={}", Ipv4Addr::from(mask));
    println!("network={}/{}", Ipv4Addr::from(network), prefix);
    println!("broadcast={}", Ipv4Addr::from(broadcast));

    for target in [
        Ipv4Addr::new(192, 168, 10, 62),
        Ipv4Addr::new(192, 168, 10, 64),
    ] {
        let same_prefix = u32::from(target) & mask == network;
        println!("target={target} same_prefix={same_prefix}");
    }
}
```

预期输出如下。

```text
mask=255.255.255.224
network=192.168.10.32/27
broadcast=192.168.10.63
target=192.168.10.62 same_prefix=true
target=192.168.10.64 same_prefix=false
```

`same_prefix=true` 表示目标地址经掩码计算后落在同一前缀。地址能否分配给普通主机取决于子网的地址规则，实际下一跳仍由路由决定。

在常规 IPv4 多址子网中，主机位全 `0` 的地址表示网络本身，全 `1` 的地址用于子网广播，不能分配给普通主机。因此对前缀长度 $n$（$n \le 30$），常见的可用主机地址数是 $2^{32-n}-2$。

| CIDR 前缀 | 子网掩码 | 地址总数 | 常规可用主机数 | 常见用途 |
| --- | --- | --- | --- | --- |
| `/24` | `255.255.255.0` | 256 | 254 | 家庭与小型办公网络 |
| `/26` | `255.255.255.192` | 64 | 62 | 部门或虚拟化网段 |
| `/30` | `255.255.255.252` | 4 | 2 | 点对点互联链路 |
| `/32` | `255.255.255.255` | 1 | 不适用减二规则 | 单个地址的主机路由 |

`/31` 点对点链路可使用两个地址，不套用常规广播子网的减二规则；IPv6 也没有 IPv4 这种子网广播地址[^31]。

例如点对点配置 `192.0.2.10/31` 的两个端点可以是 `.10` 和 `.11`，而不是把它们分别扣成网络地址与广播地址。上面程序仍能计算 `/31` 的位范围，但打印为 `broadcast` 的范围上界在这种链路中不具有子网广播语义。

## 局域网交付：MAC 地址、交换机与 ARP / NDP

选出下一跳之后，还需按出接口的链路类型交付数据。在以太网上，帧头使用 48 位**媒体访问控制地址**（Media Access Control Address，MAC 地址），因此主机需要把“下一跳 IP”关联到链路层地址。这里讨论以太网式局域网；点对点或 TUN 接口不一定需要 ARP。

IP 地址服务于跨网寻址，MAC 地址服务于当前二层链路的帧交付。MAC 可以由硬件提供，也可以由系统配置或为隐私而随机生成。经过路由器时，旧链路头被移除，下一段链路重新封装，原主机的 MAC 不会作为端到端地址一路保留。

交换机通过帧的源 MAC 学习端口位置，再查询目的 MAC 决定转发端口。未知单播通常在相应**虚拟局域网**（Virtual Local Area Network，VLAN）内向其他可转发端口泛洪；广播也在该广播域内传播，不能据此推断整个组织的所有设备都会收到。

### IPv4 的地址解析：ARP

IPv4 在以太网上通过**地址解析协议**（Address Resolution Protocol，ARP）解析下一跳 MAC[^4]。例如本机 `192.168.1.10` 经网关 `192.168.1.1` 访问远端时，要解析的是网关的 MAC；若邻居缓存已有可用映射，可以直接封装，而不必先发 ARP 广播。

下面先选下一跳，再决定是否需要解析；IPv6 分支使用的 NDP 在下一节展开：

```mermaid title="从路由选择到 ARP 或 NDP 解析" description="限定普通以太网单播数据交付，不含代理 ARP、地址冲突探测或 DAD。实际路由结果决定下一跳，直连时是目标自身，经网关时是网关地址；不能只凭地址看起来同网段就跳过选路。缓存未命中才发起解析，收到有效应答后按规则更新缓存并发包。IPv6 被请求节点组播地址中的 XX 表示目标地址低 24 位，不是固定地址。"
flowchart TB
 route["查路由表<br/>选择出口与下一跳"] --> direct{"路由指示直连？"}
 direct -->|是| target["下一跳 IP = 目标 IP"]
 direct -->|否，路由经网关| gateway["下一跳 IP = 网关 IP"]
 target --> cache{"邻居表有可用映射？"}
 gateway --> cache
 cache -->|有| frame["封装以太网帧<br/>目的 MAC = 下一跳 MAC"]
 cache -->|无| family{"下一跳地址族"}
 family -->|IPv4| arp["广播 ARP Request<br/>ff:ff:ff:ff:ff:ff"]
 family -->|IPv6| ns["组播 NS：请求下一跳链路地址<br/>ff02::1:ffXX:XXXX"]
 arp --> arp_reply["收到有效 ARP Reply"]
 ns --> na["收到有效 NA"]
 arp_reply --> frame
 na --> frame
 frame --> send["发送原 IP 包<br/>目的 IP 仍是最终目标"]
```

本文示例使用主机 MAC `00:00:5e:00:53:01`、网关 MAC `00:00:5e:00:53:02`，都属于文档专用的单播地址范围。MAC 首字节的最低位区分单播与组地址；例如 `11:22:33:00:00:ff` 的该位为 `1`，不适合作为普通网关的单播地址[^mac]。

### IPv6 的邻居发现：NDP

IPv6 使用基于 ICMPv6 的**邻居发现协议**（Neighbor Discovery Protocol，NDP），不使用 ARP，也没有 IPv4 式广播[^5]。首次解析邻居链路层地址时，发送方不是向全节点组播 `ff02::1` 泛洪，而是向由固定前缀 `ff02::1:ff00:0/104` 拼接目标 IPv6 地址最后 24 位构成的**被请求节点组播地址**（Solicited-Node Multicast Address，例如 `ff02::1:ffXX:XXXX`，在以太网上映射为 `33:33:ff:XX:XX:XX`）发送邻居请求 NS（Neighbor Solicitation）[^5]；目标通过邻居通告 NA（Neighbor Advertisement）提供链路层地址。已有缓存时的可达性确认还可以使用单播请求。

NDP 也定义路由器发现、前缀发现和邻居不可达检测。地址自动配置使用其中的 RA 等信息，但 SLAAC 地址生成与重复地址检测的具体规则由另一份规范定义，下面会继续区分。

### 使用前探测与地址公告

“免费 ARP”在工程讨论中容易混指不同报文。RFC 5227 明确区分使用前的 `ARP Probe` 和探测成功后的 `ARP Announcement`[^acd]：

| 报文 | 发送方 IP | 目标 IP | 主要用途 |
| --- | --- | --- | --- |
| ARP Probe | `0.0.0.0` | 待使用地址 | 使用前检查是否与其他主机冲突 |
| ARP Announcement | 本机地址 | 同一个本机地址 | 公告地址使用，更新邻居的地址映射 |

两者都使用广播 ARP Request，但字段与阶段不同。公告还可用于使用期间的地址防御；探测成功也不能保证以后不会出现地址冲突。高可用切换时，公告可以帮助邻居更新 IP 到 MAC 的映射，交换机则通过帧的源 MAC 学习所在端口，两种更新不是同一张表。

:::caution[ARP 回复不是身份凭证]
经典 ARP 没有内建的发送者身份认证，恶意主机可能伪造映射。看到一条 ARP Reply 只能证明收到了该声明，不能单独证明发送者就是可信网关。这里的地址探测也不提供防欺骗保证。
:::

## 设备如何获得配置：DHCP 与自动配置

前面解释了 IP、掩码、网关和 DNS 参数的作用。普通家庭或办公网络往往通过**动态主机配置协议**（Dynamic Host Configuration Protocol，DHCPv4）自动下发这些参数；静态配置是另一种来源。

### DHCPv4 的首次租约获取

首次获取租约通常经历 DORA（Discover、Offer、Request、ACK）四步。客户端使用 UDP 端口 `68`，服务器使用 `67`[^6]：

初始客户端尚无可用 IPv4 地址，Discover 通常从 `0.0.0.0:68` 发到 `255.255.255.255:67`，在以太网内使用广播。普通路由器不会把这份局域网广播直接转发到另一子网；DHCP 中继接收后填写 `giaddr` 等信息并转交服务器，服务器据此选择地址池和回复路径。`0.0.0.0` 在这里是尚未配置地址时的协议用法，不是已经租到的主机地址[^6]。

| 阶段 | 作用 | 常见交付方式 |
| --- | --- | --- |
| Discover | 寻找可用服务器 | 客户端通常广播 |
| Offer | 提供地址与配置报价 | 服务器按客户端状态、广播标志及中继情况单播或广播 |
| Request | 选择某一服务器的报价 | 选择阶段通常广播，让其他服务器也知道选择结果 |
| ACK | 确认配置与租约 | 服务器按交付条件单播或广播 |

这是一套消息流程，不能总结为“四步广播”。存在 DHCP 中继时，服务器还可能先把回复发给中继，再由它向客户端交付；续租等状态下的 DHCPREQUEST 也不必广播[^6]。

租约带有期限。默认 T1 为租期的 50%，客户端向原服务器单播续租；默认 T2 为 87.5%，仍未成功时进入重新绑定阶段，广播尝试联系其他服务器。服务器可以指定不同的 T1、T2，且须早于租期结束。到期仍未获得 ACK，客户端必须停止使用该地址并重新获取配置[^6]。

```mermaid title="DHCPv4 从首次租约到续租与重绑定" description="限定无中继的一种首次获取路径，省略广播域内其他接收者。Offer 与 ACK 按客户端状态及广播标志单播或广播，不能把 DORA 统称为四次广播。T1、T2 以本轮租期起点计时，50% 与 87.5% 是默认值；后半图选择 T1 续租未获 ACK 的分支，T2 才广播重绑定。任何成功 ACK 都会按新租约重新计时；箭头和间距不代表真实租期比例。"
sequenceDiagram
 participant Client as 客户端 UDP 68
 participant Original as 原服务器 UDP 67
 participant Other as 其他 DHCP 服务器
 Client->>Original: Discover：广播寻找服务器
 Original->>Client: Offer：报价，单播或广播
 Client->>Original: Request：选择报价，通常广播
 Original->>Client: ACK：确认租约，单播或广播
 Note over Client: 开始使用地址并记录租期
 Client->>Original: T1 默认 50%：单播 Request 续租
 Note over Client,Original: 本分支假设没有收到续租 ACK
 Client->>Other: T2 默认 87.5%：广播 Request 重绑定
 Note over Original,Other: 广播域内可用服务器均可收到
 Other->>Client: 若接受续租，返回 ACK
 Note over Client: 成功则重置租期；否则到期停止用址
```

### IPv6 的 RA、SLAAC 与 DNS 参数

**无状态地址自动配置**（Stateless Address Autoconfiguration，SLAAC）允许主机根据**路由器通告**（Router Advertisement，RA）中的信息自行生成地址，但“收到一个前缀”到“拥有可用地址”之间仍有状态转换：

1. 主机通过路由器通告 RA 发现路由器；默认路由是否有效取决于通告中的 Router Lifetime 等信息。
2. RA 中的前缀信息选项若允许自主配置，主机可把前缀与生成的接口标识符组合为候选地址。用于 SLAAC 的前缀与默认路由信息承担不同职责。
3. 接受**重复地址检测**（Duplicate Address Detection，DAD）的地址在检测完成前处于 tentative 状态，不能按普通可用地址使用。DAD 发现冲突时不得分配该地址；接口配置也可能按规范关闭 DAD。
4. 地址通过检测后，还受 preferred lifetime 与 valid lifetime 约束：首选期限到期后进入 deprecated 状态，既有通信可继续使用；有效期限到期后地址失效[^slaac]。

RA 还可通过**递归 DNS 服务器选项**（Recursive DNS Server，RDNSS）通告递归 DNS 服务器，通过**DNS 搜索列表**（DNS Search List，DNSSL）通告搜索域；这些选项有自己的有效期，不能与默认路由或地址前缀的有效期混为一谈[^rdnss]。网络也可以使用 DHCPv6 提供地址或其他参数，但 IPv6 默认路由通常仍来自 RA。

| 需要的配置 | 主要机制 | 排障时分别检查 |
| --- | --- | --- |
| 默认路由 | RA 的路由器信息与 Router Lifetime | 有全局地址不代表存在有效默认路由；RA 源地址是路由器的链路本地地址 |
| 链路上前缀 | RA 前缀选项的 L 标志 | 判断前缀是否 on-link，与能否生成地址分开 |
| SLAAC 地址 | RA 前缀选项的 A 标志、地址生成及 DAD | 普通以太网 SLAAC 通常使用 `/64`；A 与 L 不是同一个开关 |
| DHCPv6 地址或参数 | 有状态地址分配，或 Information-request 等交互 | M/O 标志提供配置线索，客户端支持与策略仍影响行为；不能套用 DHCPv4 DORA |
| DNS 服务 | RA RDNSS、DHCPv6 或本机配置 | 取得地址、路由和 DNS 是不同的成功条件 |

主机可以先发送路由器请求 RS（Router Solicitation）促使路由器回复 RA，也可以接收周期性 RA。DHCPv6 的地址分配不能代替 RA 的默认路由发现；因此“一律屏蔽 ICMPv6”可能同时破坏邻居解析、路由发现和路径 MTU 反馈[^ra][^dhcpv6]。

一张接口还可同时持有稳定地址与定期更换的**临时地址**（temporary address）。RFC 8981 的临时地址扩展减少长期使用同一接口标识符造成的关联，但不会隐藏网络前缀，也不等于匿名；具体是否生成、优先选择哪个源地址，要看系统策略。不要假定每个 IPv6 地址都由网卡 MAC 推导，也不要把地址变化直接认作另一台设备上线[^privacy]。

地址、前缀、默认网关与 DNS 服务应分别核对。下图只整理配置来源，获得地址之后，主机仍需根据实际选路完成邻居解析或下一跳交付。

```mermaid title="IPv4 与 IPv6 的配置职责" description="独立的 IPv4 和 IPv6 配置路径。DHCPv4 可同时提供地址、前缀、网关和 DNS 参数；IPv6 的 NDP 提供路由器发现和邻居解析，SLAAC 与 DHCPv6 可共同存在，DHCPv6 不通告默认路由。"
flowchart TB
 v4["IPv4 主机"] -.->|请求租约| dhcp4["DHCPv4<br/>地址、掩码、网关、DNS"]
 v6["IPv6 主机"] -.->|接收 RA| ndp["NDP 路由器发现<br/>默认路由与链路前缀"]
 ndp -.->|前缀允许自主配置| slaac["SLAAC 生成地址<br/>执行适用的 DAD"]
 ndp -.->|含 RDNSS 选项| dns["配置递归 DNS"]
 v6 -.->|依网络和本机策略| dhcp6["DHCPv6<br/>地址或其他参数"]
 dhcp6 -.->|含 DNS 参数| dns
```

## 观察本机寻址与邻居表：实验与边界

先查看实际配置，再解释一次业务请求使用了哪张接口。下面的地址与 MAC 仅用于说明字段，请以实际接口配置为准。这些命令观察本机操作系统，抓包还需要接口权限；它们应在本机终端运行，在线 Playground 无法呈现你的邻居表。后面的 `ping` 会向实际网关发送探测，和前面的纯计算示例有不同的运行条件。

### 实验一：查看接口地址、掩码与 MAC

macOS 可先用 `route -n get default` 查看 IPv4 默认路由的接口，再检查对应接口；`en0` 只是常见示例，不能保证是你的出口。Linux 对应使用 `ip route show default` 和 `ip addr show`。

```bash frame="code"
route -n get default
ifconfig en0
```

在接口输出中对应以下字段：

- `ether`：接口当前的 MAC 地址，可能是系统随机化地址。
- `inet ... netmask 0xffffff00`：IPv4 地址及 `/24` 掩码，可用来计算该直连前缀。
- `inet6 fe80::...%en0`：链路本地 IPv6 地址，`%en0` 是作用域标识，用于区分不同链路上可能重复的地址。

默认路由只是起点。VPN、TUN 或主机路由存在时，实际目标可能使用其他接口，需继续查看下一篇的[特定目标选路结果](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果)。

### 实验二：观察 ARP 与 NDP 邻居表

macOS 可用以下命令；Linux 对应 `ip neigh show`：

```bash frame="code"
arp -a
ndp -a
```

在本例经默认网关访问公网目标的配置中，本机解析的是网关 MAC，通常不会为远端公网地址建立 ARP 条目。是否需要邻居解析取决于实际选出的下一跳与链路类型；不能把“公网地址永远不会出现在 ARP 表里”当作所有配置下的规则。

:::important[邻居表不是在线设备清单]
这些命令显示本机已知的邻居状态。未曾需要解析的设备可能不在表中；离线设备的记录也可能尚未老化。表项是否存在、当前状态和设备是否可达，需要分别判断。
:::

### 实验三：观察一次 ARP 解析

把接口和网关替换为前面查到的值，再针对该链路抓取 ARP 报文。抓包通常需要管理员权限：

```bash frame="code"
sudo tcpdump -i en0 -nn -e arp
```

在另一终端对实际网关运行一次有限探测，例如 `ping -c 1 192.168.1.1`。已有可用缓存时可能看不到新的请求；不必为了实验删除邻居表，可等待自然刷新后再观察。下面仅是报文格式示意：

```text
00:00:5e:00:53:01 > ff:ff:ff:ff:ff:ff, ethertype ARP (0x0806): Request who-has 192.168.1.1 tell 192.168.1.10
00:00:5e:00:53:02 > 00:00:5e:00:53:01, ethertype ARP (0x0806): Reply 192.168.1.1 is-at 00:00:5e:00:53:02
```

重点观察请求的广播目的 MAC、回复的单播目的 MAC，以及 ARP 内的目标 IP。先保存 `arp -a` 的缓存状态，抓包中重复两次同样的有限探测，再查看缓存：首次需要解析而后续使用缓存时，可能只有第一轮看到请求。若起初就有可用表项，应记录“缓存命中条件下未见新解析”，等待自然刷新后再对照，不需要清空全机缓存。结束后按 Ctrl+C 停止抓包。没有捕获到 ARP 也可能因为接口选错或流量经虚拟接口处理，不能直接解释为“没有发包”。

## 总结

- 地址作用范围决定它适合出现在哪类网络中，实际可达性仍由路由、策略与服务状态决定。
- 掩码比较解释普通直连子网，实际下一跳以路由选择结果为准；ARP/NDP 解析的是选中的同链路邻居。
- ARP Probe 与 Announcement 分别负责使用前探测和地址公告，邻居缓存不能代替在线设备发现。
- DHCPv4 首次租约通常经历 DORA，但四条消息并非全部广播；IPv6 的路由发现、地址生成、DAD 与 DNS 参数各有自己的状态和期限。

现在已经知道“交给谁的 MAC”如何确定，接下来要回答它之前的决策：多条路由同时匹配时选择哪一个下一跳，NAT 又怎样改变跨网通信中的地址？下一篇进入[《计算机网络（三）：路由转发、NAT 与虚拟网络接口》](/posts/networking/routing-forwarding-nat-virtual-interfaces/)。

## 延伸阅读

- [IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)与[IPv6 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml)——检查特殊地址的作用范围和全球可达属性
- 子网计算示例可在 [Rust Playground](https://play.rust-lang.org/) 运行

[^1]: 〔RFC〕[RFC 1918 §3、§5](https://www.rfc-editor.org/rfc/rfc1918.html#section-3)——IPv4 私网范围及公共互联网路由边界；[RFC 4193 §3、§4.1](https://www.rfc-editor.org/rfc/rfc4193.html#section-3)另行定义 IPv6 ULA 的 `fc00::/7` 范围与外部路由过滤要求。

[^2]: 〔RFC〕[RFC 6598 §4](https://www.rfc-editor.org/rfc/rfc6598.html#section-4)——运营商共享地址空间 `100.64.0.0/10` 及使用限制。

[^3]: 〔RFC〕[RFC 4632 §3.1](https://www.rfc-editor.org/rfc/rfc4632.html#section-3.1)——CIDR 前缀长度表示和地址聚合。

[^4]: 〔RFC〕[RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.html)——以太网上的 ARP 请求、回复及地址映射更新流程。

[^5]: 〔RFC〕[RFC 4861 §3.1、§7.2](https://www.rfc-editor.org/rfc/rfc4861.html#section-7.2)——邻居发现的职责、地址解析与邻居通告。

[^6]: 〔RFC〕[RFC 2131 §4.1、§4.4.5](https://www.rfc-editor.org/rfc/rfc2131.html#section-4.1)——DORA 消息交付的单播、广播和中继条件，以及续租计时与到期行为。

[^special]: 〔RFC〕[RFC 6890 §2.2.2](https://www.rfc-editor.org/rfc/rfc6890.html#section-2.2.2)——特殊地址登记属性与 `198.18.0.0/15` 基准测试范围；Fake-IP 是应用对该地址的使用方式，并非这份 RFC 定义的协议。

[^31]: 〔RFC〕[RFC 3021 §2.1](https://www.rfc-editor.org/rfc/rfc3021.html#section-2.1)——IPv4 `/31` 点对点链路使用两个端点地址的规则。

[^mac]: 〔RFC〕[RFC 9542 §2.1.1、§2.1.4](https://www.rfc-editor.org/rfc/rfc9542.html#section-2.1.4)——MAC 单播/组地址位与 `00:00:5e:00:53:00` 至 `00:00:5e:00:53:ff` 文档专用范围。

[^acd]: 〔RFC〕[RFC 5227 §2.1.1、§2.3、§2.4](https://www.rfc-editor.org/rfc/rfc5227.html#section-2.1.1)——ARP Probe、Announcement 和地址使用期间的冲突检测与防御。

[^slaac]: 〔RFC〕[RFC 4862 §5.4、§5.5.3、§5.5.4](https://www.rfc-editor.org/rfc/rfc4862.html#section-5.4)——SLAAC 候选地址、DAD 及地址首选/有效期限。

[^rdnss]: 〔RFC〕[RFC 8106 §5、§6.1](https://www.rfc-editor.org/rfc/rfc8106.html#section-5)——RA 中的 RDNSS/DNSSL 选项及其独立有效期。

[^ra]: 〔RFC〕[RFC 4861 §4.2、§4.6.2、§6](https://www.rfc-editor.org/rfc/rfc4861.html#section-4.2)——RA 的链路本地源地址、Router Lifetime、M/O 标志、前缀 A/L 标志与路由器发现。

[^dhcpv6]: 〔RFC〕[RFC 9915 §1、§5、§18](https://www.rfc-editor.org/rfc/rfc9915.html#section-1)——DHCPv6 的地址及其他参数配置、消息类型与交互；2026 年 1 月取代 RFC 8415，默认路由发现仍由 NDP 负责。

[^privacy]: 〔RFC〕[RFC 8981 §3、§4](https://www.rfc-editor.org/rfc/rfc8981.html#section-3)——临时地址的生成、更换、生命周期和隐私限制。

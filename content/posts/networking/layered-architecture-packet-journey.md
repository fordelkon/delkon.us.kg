---
title: "计算机网络（一）：协议分层、封装与一次请求的路径"
description: "建立互联网四层协议模型、数据封装与解封装以及 Socket 抽象边界的坐标系，追踪一次 HTTPS 请求从应用进程到远端服务器再返回的完整路径，并区分观察现象与协议保证。"
publishDate: "18 Nov 2026"
tags: ["networking"]
---

在浏览器里打开一个网址，应用交给操作系统的是什么，路由器看到的又是什么？我们跟着一次 HTTPS 请求，看看数据怎样在应用、传输、网络和链路四层之间交付，再顺着一条具体路径追踪哪些字段会变、哪些会留到对端。这是[计算机网络系列](/series/networking/)的第一篇，实验以 macOS 和 Linux 为例。

读一次 HTTPS 通信，可以先问「现在是谁和谁交换什么报文？」，再问「这份报文由哪些下层协议承载？」。前一个问题用时序图回答，后一个问题要展开报文的头部与载荷。本篇先认识各层与沿途设备，再把这两个问题放到[同一次冷启动访问](#冷启动时客户端会发哪些报文)里。后续篇章按机制依赖展开，先解释链路、路由与传输，再讨论 DNS 和 Web 通信。

## 为什么需要分层模型

把数据从一台电脑上的浏览器送到另一台机器上的 Web 服务进程，至少要同时解决四类完全不同的问题：应用程序如何表达业务语义（请求哪个路径、返回什么状态码），端到端主机如何区分不同进程并处理丢包乱序，跨越多个中间网络时如何选择下一跳，以及电信号或无线电波如何在一段物理链路上把比特送到相邻设备。

如果把这四类逻辑揉进同一套协议，换一根网线、升级一种无线标准或调整路由算法，浏览器和服务器的代码就都要重写。互联网工程采用**分层**（layering）来隔离变化：每一层只向下层请求特定的传输服务，并向上层暴露相对稳定的抽象。

描述互联网协议体系时，RFC 1122 将主机的通信软件组织为四个层次，即 **TCP/IP 四层模型**（TCP/IP 为**传输控制协议/网际协议**，Transmission Control Protocol / Internet Protocol；RFC 1122 称为 Internet Protocol Suite）[^1]：

| 层次 | 核心职责 | 典型协议或接口 | 主要关注的标识 |
| --- | --- | --- | --- |
| 应用层（Application） | 规定业务消息语义与交互格式 | HTTP、DNS、SSH、SOCKS5 | 域名、URI、消息头 |
| 传输层（Transport） | 进程间复用、端到端可靠性或流量控制 | TCP、UDP、QUIC | **端口号**（Port）；QUIC 另用连接 ID 标识连接 |
| 网络层（Internet） | 跨网络的逻辑寻址与逐跳转发 | IPv4、IPv6、ICMP | IP 地址 |
| 链路层（Link） | 同一本地链路上的成帧、校验与介质访问 | 以太网（Ethernet）、Wi-Fi | **媒体访问控制地址**（Media Access Control Address，MAC 地址） |

教学与工程讨论中还会遇到**开放系统互连七层参考模型**（Open Systems Interconnection Reference Model，简称 OSI 七层模型：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层）[^osi]。与互联网四层模型相比，OSI 把链路与物理介质拆成两层，并在传输层之上额外划分出会话层与表示层；而在实际互联网协议栈中，会话管理与数据编码加密（例如 TLS 与 HTTP 压缩）通常由应用层协议或库自行承担，内核协议栈并没有独立的第 5、6 层数据结构。入门阶段先以四层模型作为主地图即可，排查双工协商或网线故障时再补入物理层视角。

物理层负责双绞线、光纤或无线信道上的编码、调制和信号恢复。五层教学模型将这部分从链路层的讨论范围中单独拆出。以太网和 Wi-Fi 都包含链路控制与物理传输规范；表中的 MAC 适用于这类链路（macOS 在普通非监听模式下对物理无线接口 `en0` 也以以太网帧格式暴露给抓包工具），PPP、回环和 TUN 等接口则有各自的数据格式。

后文的“二层”“三层”沿用 OSI 的层号：二层是数据链路层，三层是网络层，四层是传输层。因此，“二层交换机”按 MAC 转发帧，“三层路由”按 IP 选择下一跳；这里的编号不是把上面的 TCP/IP 四层表从第一行依次编号。

:::note[协议职责与代码运行位置]
四层模型划定协议职责与数据边界，不规定源码必须分成四个目录。常见应用通过用户态 TLS 库完成握手与记录层处理；部分实现也会把记录层的加解密移入内核或硬件，例如 Linux kTLS，握手仍由用户态处理[^ktls]。QUIC 则常在用户态借助 UDP 实现可靠传输、多路复用与拥塞控制。判断某一层的职责，要看它解释什么数据、提供什么保证；运行位置需要另查具体实现。
:::

## 封装、解封装与数据单元

发送端通过**封装**（encapsulation）把数据交给承载它的协议。承载协议把收到的数据放入自己的**载荷**（payload），加上本层头部，必要时再加帧尾或填充。接收端通过**解封装**（decapsulation）检查外层头部，再把载荷交给对应的协议处理。

**逐层封装从产生报文的协议开始，沿实际承载路径向下**。HTTP 请求可以经 TLS、TCP、IP 和以太网发送，而 TCP 自己生成的 SYN 可以从 TCP 开始。ARP 和 ICMP 则各有自己的承载路径。
不同层次的**协议数据单元**（Protocol Data Unit，PDU）有各自的名称，RFC 9293 在描述 TCP 时就明确区分了应用看到的字节流、网络上传输的 TCP 报文段以及承载它的 IP 数据报[^2]：

| 所在层次 | 数据单元名称 | 携带的关键控制信息 |
| --- | --- | --- |
| 应用层 | 消息（Message），例如 HTTP 请求或 DNS 查询 | HTTP 方法、路径、Host、状态码；DNS 事务 ID |
| TLS（使用时） | 记录（Record） | 记录类型与长度，受保护的载荷 |
| 传输层 | **报文段**（Segment，TCP）或**数据报**（Datagram，UDP） | 源端口、目的端口、序号、确认号、校验和 |
| 网络层 | **IP 数据报**（Packet / Datagram） | 源 IP、目的 IP、协议号（IPv4 `Protocol` / IPv6 `Next Header`）、**生存时间**（Time to Live，TTL）/ **跳数限制**（Hop Limit） |
| 链路层 | **帧**（Frame） | 源 MAC、目的 MAC、**以太网类型**（EtherType）、**帧校验序列**（Frame Check Sequence，FCS） |

### 以太网帧的封装与结构

**以太网帧**（Ethernet Frame）是以太网在数据链路层的传输单位。以基于 TCP 的 HTTPS 为例，TCP 报文段承载 TLS 编码后的部分字节，IP 数据报封装 TCP 报文段，以太网帧再把这一跳要发送的 IP 数据报装进载荷。物理层把数据编码为链路上的信号。以太网帧也可以直接承载 ARP，接收端通过 EtherType 区分载荷协议[^4]。

从帧首到帧尾依次是以太网头、IPv4 包和帧尾。IP 包与 TCP 段的外框标出各自的封装边界。

```mermaid title="一个以太网帧怎样包含 IPv4 与 TCP" description="未加 VLAN 标签的 Ethernet II 承载 IPv4/TCP。外框包含帧头、IPv4 包与 FCS，IPv4 包内再包含 TCP 段；外框内各块从上到下按线上出现顺序排列。省略部分字段、选项和必要的以太网填充，宽度不代表字节数。"
flowchart TB
 subgraph frame[Ethernet II 帧]
  eth["帧头 · 14 字节<br/>目的 MAC · 源 MAC · EtherType"]
  subgraph ip[IPv4 包]
   ip_header["IPv4 头 · 至少 20 字节<br/>TTL · Protocol · 校验和 · 源与目的 IP"]
   subgraph tcp[TCP 段]
    tcp_header["TCP 头 · 至少 20 字节<br/>源与目的端口 · Seq · Ack · Flags 等"]
    tcp_data["TCP 载荷 · 可为空<br/>例如 TLS 编码后的字节"]
    tcp_header --- tcp_data
   end
   ip_header --- tcp_header
  end
  fcs["帧尾 · FCS · 4 字节"]
  eth --- ip_header
  tcp_data --- fcs
 end
 linkStyle default stroke:none
```

这张图展开的是未分片时的协议布局。帧的载荷包含整个 IP 数据报，IP 的载荷又包含整个 TCP 报文段；以太网头与 FCS 都在 IP 包之外。路由器换掉外层帧，不代表它同时换掉了内层的目的 IP。

常见的未加 VLAN 标签的 Ethernet II 帧由以下字段组成[^ethernet-frame]：

| 字段 | 大小 | 作用 |
| --- | --- | --- |
| 目的 MAC 地址 | 6 字节 | 标识当前二层链路上的接收方或接收范围 |
| 源 MAC 地址 | 6 字节 | 标识当前二层链路上的发送接口 |
| EtherType | 2 字节 | 指明载荷协议，例如 IPv4 |
| 载荷与必要的填充 | 46 至 1500 字节 | 承载上层数据，过短时补足最小帧长 |
| FCS | 4 字节 | 位于帧尾，用于检测传输错误 |

从目的 MAC 到 FCS，14 字节帧头、46 至 1500 字节的载荷与填充、4 字节帧尾合计 64 至 1518 字节。前导码、帧起始定界符与帧间间隔均在这个计数范围之外。单个 802.1Q VLAN 标签增加 4 字节的头部开销，带单标签的标准帧上限为 1522 字节[^ethernet-frame]。

**最大传输单元**（Maximum Transmission Unit，MTU）在这里指接口可在一个帧内承载的最大 IP 数据报大小，常见以太网 IP MTU 为 1500 字节，包含 IP 头。1518 字节则是计入未加标签的以太网头和 FCS 后的帧长上限。支持**巨型帧**（Jumbo Frame）的链路可以配置更大的 MTU[^ethernet-frame]。

图中的包含关系描述一次封装。通过 TCP 传输一个 10 MB 文件时，TCP 会把字节流分成多个报文段，经多个 IP 数据报和链路帧完成传输。每个帧只负责当前链路的交付，路由器如何为下一跳重新封装见[主机、交换机与路由器的分工](#端到端与逐跳主机交换机与路由器的分工)。

### 从字节缓冲区读取以太网头

下例用 C 保存从 Ethernet II 帧头解码出的三个字段。输入从目的 MAC 开始，函数仅检查头部是否完整、类型字段是否属于示例支持的范围。EtherType 按网络字节序读取，例如 `08 00` 解码为 `0x0800`。网络字节序与主机字节序的关系可参照 Beej 的说明[^beej-byte-order]。

```c
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

struct EthernetHeader {
    uint8_t destination[6];
    uint8_t source[6];
    uint16_t ether_type;
};

// Preconditions: bytes (at least 14 bytes) and header are non-null.
// Accepts untagged Ethernet II headers only; skips 802.3 length and VLAN frames.
bool decode_ethernet_header(const uint8_t *bytes, size_t size,
                            struct EthernetHeader *header) {
    if (bytes == NULL || header == NULL || size < 14) {
        return false;
    }

    // Decode big-endian bytes explicitly to avoid alignment and host-endian assumptions.
    uint16_t type = (uint16_t)(((unsigned)bytes[12] << 8) | bytes[13]);

    // Values < 0x0600 denote IEEE 802.3 length (<= 1500) or unassigned space;
    // 0x8100 (802.1Q) and 0x88a8 (802.1ad) insert VLAN tags that shift inner EtherType.
    if (type < 0x0600 || type == 0x8100 || type == 0x88a8) {
        return false;
    }

    memcpy(header->destination, bytes, 6);
    memcpy(header->source, bytes + 6, 6);
    header->ether_type = type;
    return true;
}
```

`EthernetHeader` 存放已经解码的字段，可供程序分派 IPv4、IPv6 或 ARP。线上头部固定占 14 字节，C 对象的布局由编译器确定。逐字段读取可以处理未对齐的缓冲区，也无需依赖结构体填充或宿主机字节序。IEEE 802.3 将长度字段上限规定在 `1500`（`0x05DC`），Ethernet II 的 EtherType 则从 `1536`（`0x0600`）起分配；示例还跳过了常见的 `0x8100`（802.1Q）和 `0x88a8`（802.1ad QinQ）VLAN 标签，调用方仍须检查载荷和帧尾。

### 同一条链路上的不同封装路径

下面并排看同一以太网接口可能发送的五类数据。沿箭头向下读，箭头指向负责承载该数据的协议。

```mermaid title="HTTPS、TCP SYN、DNS、ICMP 与 ARP 的封装路径" description="每条路径从产生数据的协议开始。汇合只表示使用同一种承载协议，每次发送仍各自成帧。以太网使用 IPv4 或 ARP 的 EtherType；TCP、UDP 和 ICMP 对应 IPv4 Protocol 的 6、17 和 1。"
flowchart TB
 http["HTTP 请求"] --> tls["TLS 记录"]
 tls --> tcp["TCP 段"]
 syn["TCP SYN<br/>载荷 0 字节"] --> ip["IPv4 包"]
 tcp --> ip
 dns["DNS 查询"] --> udp["UDP 数据报"]
 udp --> ip
 icmp["ICMP Echo"] --> ip
 ip --> eth["以太网帧"]
 arp["ARP 请求"] --> eth
 class http,syn,dns,icmp,arp actor
 class tls,tcp,udp,ip resource
 class eth result
```

- **TCP SYN** 由 TCP 自己生成，标志和初始序号都写在头部。没有 TCP 选项和 IPv4 选项时，一个零载荷 SYN 段的 TCP 头占 20 字节，连同 IPv4 头共 40 字节。以太网另加帧头、填充和帧尾。SYN 若携带 MSS 等选项，TCP 头会更长。[初始 SYN 的报文布局和 MSS 选项](/posts/networking/transport-tcp-udp-socket-quic/#初始-syn-的报文布局)与[三次握手的时序图](/posts/networking/transport-tcp-udp-socket-quic/#连接建立三次握手)分别展示段里装了什么、何时发送[^2][^ethernet-frame]。
- **ICMP Echo** 是由 IPv4 直接承载的诊断报文，自己的 ICMP 头部下面可以有探测数据。这里没有 TCP 或 UDP 头，见 [ICMP Echo Request 的报文布局](/posts/networking/routing-forwarding-nat-virtual-interfaces/#icmp-echo-request-的报文布局)[^icmp-echo]。
- **ARP 请求**由以太网直接承载，以本地链路上的下一跳 IPv4 地址为查询目标。[ARP 请求的帧布局](/posts/networking/ip-addressing-subnet-lan-delivery/#arp-请求的帧布局)展示了以太网广播地址与 ARP 消息中的目标 IPv4 各在什么位置。IPv6 邻居解析使用 [ICMPv6 邻居发现](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv6-的邻居发现ndp)[^arp]。
- **DNS 查询**在图中由 UDP 承载，见 [UDP DNS 查询的报文布局](/posts/networking/dns-resolution-caching-encrypted-queries/#udp-dns-查询的报文布局)。[传统 DNS 也支持 TCP](/posts/networking/dns-resolution-caching-encrypted-queries/#dns-的-udp-大小限制与-tcp-回退)，采用加密 DNS 时则要看实际选用的传输方式。

### 接收端怎样选择上层协议

先顺着外层到内层看接收过程。接收端知道该把载荷交给哪一个上层协议模块，靠的是头部预留的**复用标识字段**（multiplexing identifier）：

1. 以太网帧头中的 `EtherType` 指明载荷类型，例如 `0x0800` 代表 IPv4、`0x86DD` 代表 IPv6、`0x0806` 代表 ARP[^4]。
2. IPv4 的 `Protocol` 字段指明后续协议，例如 `6` 为 TCP、`17` 为 UDP、`1` 为 ICMP[^3]。IPv6 的 `Next Header` 可以指向扩展头或上层协议；ICMPv6 使用协议号 `58`，不能直接套用 IPv4 的 `1`[^ipv6]。
3. TCP/UDP 头部的端口号参与选择主机内的通信端点。具体选择还可能结合本地地址、远端地址与端口；已建立的 TCP 连接不能只靠目的端口区分[^2]。应用如何操作这些端点，见后文的 [Socket 接口](#操作系统边界socket-与网络接口)。

一旦弄清这三步解复用链条，很多入门时容易混淆的问题就能直接分清：**域名**只出现在应用层消息（如 HTTP `Host` 头、DNS 查询载荷）或 TLS 握手的 `server_name` 扩展中，内核的 IP 层和 TCP 层并不认识域名；**IP 地址**负责定位网络中的主机接口，**端口**负责定位主机内部的通信端点。

### TLS 记录与 TCP 报文段：两套独立的边界

头部能标识载荷类型，并不意味着相邻协议的数据单元必须一一对应。以 HTTPS over TCP 为例，逻辑栈是 HTTP → **传输层安全**（Transport Layer Security，TLS）→ TCP → IP → 当前链路。HTTP 生成消息或 HTTP/2 帧，TLS 将应用数据封装成**记录**（TLS Record），再把编码后的字节交给 TCP。TLS 如何协商密钥、验证身份并保护数据，见第六篇的 [TLS 1.3 握手](/posts/networking/http-evolution-tls-handshake-https/#tls-13-握手密钥协商证书校验与-sni--alpn)。这里关注封装边界：TCP 不解释 TLS 记录格式，也不保证分段时保留记录边界[^2][^tls-record]。

**TLS 记录边界与 TCP 报文段边界相互独立**：一条记录可以跨多个段，一个段也可以同时承载不同记录的字节。

假设 TLS 连续生成两条记录：A 编码后共 1000 字节，B 编码后共 800 字节。把这段连续的 1800 字节从 `0` 开始编号，则 A 占 `0…999`，B 占 `1000…1799`。这里使用的是示例字节偏移，包含 TLS 记录头和受保护载荷，不是 HTTP 正文编号，也不是连接实际使用的 TCP 初始序号。

下面按 TLS 和 TCP 的边界切出四段偏移，逐列对齐同一批字节。

| 字节偏移 | 0–599 | 600–999 | 1000–1399 | 1400–1799 |
| --- | --- | --- | --- | --- |
| TLS 记录 | A | A | B | B |
| TCP 载荷 | 段 1 | **段 2** | **段 2** | 段 3 |

同一列表示同一段字节，相邻的同名格合起来是一条记录或一个 TCP 段的载荷。列宽只为对齐偏移范围。

记录 A 的前 600 字节进入段 1，后 400 字节进入段 2。段 2 的另一半来自 B，因此 TLS 的记录边界落在段 2 的载荷内部。TCP 无须知道这里换了一条记录。

这只是用于说明边界独立的一种切分，实际分段还受 MSS、发送时机及可用发送窗口等因素影响[^2]。HTTP 的边界也独立于它们：一条 HTTP 消息可以跨多个 TLS 记录，一条 TLS 记录也可以容纳多个 HTTP 消息或 HTTP/2 帧的字节[^tls-record]。

也可以从长度预算看分段。假设已经有 10,000 字节待交给 TCP，IPv4 路径 MTU 为 1500 字节，IPv4 与 TCP 头均无选项、各占 20 字节，且对端通告的 [MSS](/posts/networking/transport-tcp-udp-socket-quic/#初始-syn-的报文布局) 没有进一步限制。在这个例子里，一个段最多承载 1460 字节。若尽量装满，前六段合计装 8760 字节，第七段装剩下的 1240 字节。这里计算的是 TCP 字节流，HTTPS 要先把 TLS 编码后的字节算进去。TCP 分段在发送端组织字节流，IPv4 分片处理的则是已形成的 IPv4 数据报。这个例子中每个 IP 包都符合 MTU，可以直接在链路上发送[^2][^3][^mss]。路径变化时怎样调整这个预算，见第八篇的 [MTU 与 MSS](/posts/networking/network-diagnostics-performance-troubleshooting/#mtumss-与-pmtud-黑洞)。

**接收端怎样恢复 TLS 记录**？

TCP 向上交付有序字节流，TLS 则依据记录头中的 `length` 字段收齐一条记录，再认证、解密并把应用数据交给 HTTP；字节不足时就等待更多数据[^tls-record]。在上表的例子里，段 1、段 2 的字节按序交付后才能收齐 A，B 还要等待段 3。因此，**并非每收到一个 TCP 段就能解密一条 TLS 记录**，HTTP 也仍需按自身格式识别消息或帧。

## 操作系统边界：Socket 与网络接口

**套接字**（socket）是应用读写网络数据的操作系统接口。Unix-like 系统常用文件描述符访问它，再调用 `connect`、`send` 或 `recv`。常见的 Internet `SOCK_STREAM` 套接字使用 TCP，`SOCK_DGRAM` 套接字使用 UDP，具体仍取决于地址族与协议。Unix 域套接字则不经过 IP 网络[^6]。

前面介绍的是协议数据格式，现在看应用如何把数据交给本机发送路径。Linux、macOS 和 Windows 都有套接字、协议栈和网络接口的抽象，钩子位置与驱动接口各有不同；下图对照回环、TUN 和物理接口三种出口。

```mermaid title="从套接字到物理介质的发送路径" description="应用调用 write 或 send，把数据交给内核。路由和策略选出一条出口：回环回到本机协议栈，TUN 将 IP 包交给读取接口的用户态程序，物理接口则经驱动和网卡在链路上发送信号。箭头表示交付方向，不规定内核钩子的顺序。"
flowchart TB
 app["用户态应用"]
 subgraph kernel[内核态]
  socket["Socket 发送缓冲"] --> route["TCP/IP 处理<br/>路由与过滤策略"]
  route --> loop["回环<br/>本机"]
  route --> tun["TUN"]
  route --> driver["驱动"]
 end
 app -->|write / send| socket
 tun -->|IP 包| reader["用户态<br/>程序"]
 driver --> nic["网卡"]
 nic --> wire["链路"]
 class app,reader actor
 class socket,nic resource
 class route state
 class loop,tun,driver,wire result
```

协议图描述的是线上字节的排列，不要求包在内核内存中连续存放。例如 Linux 的包缓冲可以关联线性数据区与分散的页片段[^skb]；网卡通常通过**直接内存访问**（direct memory access，DMA）交换数据。Linux 的**网络事件处理机制**（NAPI，早期称 New API，即“新接口”）通常在设备中断通知后调度轮询，批量处理收发事件；硬件中断合并则是减少中断频率的另一项机制[^napi]。驱动、卸载与虚拟接口会改变主机抓包所见，参见第八篇的[捕获位置说明](/posts/networking/network-diagnostics-performance-troubleshooting/#https-与代理路径需要另一次捕获)。

:::important[本地写入成功与远端处理完成]
普通 TCP Socket 的 `write`/`send` 成功，只说明返回值所计的字节被本地发送路径接受，既不证明已经发出，也不证明远端业务处理完成。一次调用还可能只接受部分数据，详见第四篇的 [Socket 读写契约](/posts/networking/transport-tcp-udp-socket-quic/#socket-接口与内核缓冲区契约)。这与并发系列的[消息交付与处理完成](/posts/concurrency/message-passing-workers-backpressure/#消息交付与处理完成)是相似的责任边界，具体保证仍由各自接口规定。
:::

再看流量怎样进入代理；这里只标出入口，具体流程留在第七篇：

- **[显式代理](/posts/networking/proxies-tunnels-transparent-interception/#显式代理http-connect-与-socks5-的工作边界)**：应用主动连接代理监听端口，用 HTTP CONNECT 或 SOCKS5 告诉它目标，由代理创建出站连接。HTTP CONNECT 与 SOCKS5 是不同协议，目标表达和解析位置需分别理解[^connect][^socks]。
- **[三层虚拟隧道接口](/posts/networking/proxies-tunnels-transparent-interception/#透明接管tun-提供-ip-包域名需要额外关联)**（Network Tunnel，TUN）：程序从这个接口读写 IP 包[^tun-name]，路由和策略把选中的流量导向该接口。能否覆盖某个应用、IPv4 或 IPv6，取决于实际选路与排除规则；TUN 本身也不规定后续是直连、代理重建连接还是 IP 隧道封装。

## 端到端与逐跳：主机、交换机与路由器的分工

沿着上一节的发送路径离开本机网卡后，数据还要经过家用路由器、运营商网络与骨干路由器等多段接力。现在从单台主机内部转向整条网络路径，区分沿途设备各自解释哪一层的头部。

- **二层交换机**（Switch）在普通二层转发中读取目的 MAC，查询转发表并选择出端口，既不改写帧中的源与目的 MAC，通常也不改写 IP 头。具备三层转发、过滤等功能的设备还会执行额外处理，不能只凭设备名称判断能力。
- **路由器**（Router）检查目的 IP 并选择下一跳，转发时递减 IPv4 TTL 或 IPv6 Hop Limit，再按出接口的链路类型重新封装[^forward-ttl][^ipv6]。
- **终端主机**（Host）把交给本机的数据继续解复用到传输端点和应用。透明代理、NAT、防火墙等中间功能可能检查更高层；这里描述的是普通交换与路由的基本职责。

因此，**链路层封装只服务于当前一跳**（hop-by-hop），每次路由转发都要按出接口重新封装。普通 IP 转发则保留端到端（end-to-end）的源与目的 IP 和传输层端口，但并不保留整个 IP 头。另有**网络地址转换**（Network Address Translation，NAT）按配置转换地址，或**应用代理**（Proxy）在应用层或传输层终结连接，再向目标建立一条新的连接。

拿第三篇的[全以太网示例](/posts/networking/routing-forwarding-nat-virtual-interfaces/#同一个-ip-包经过三段以太网链路)作对照：假设只把 R1 与 R2 之间换成一条**点对点协议**（Point-to-Point Protocol，PPP）链路，仍无 NAT、代理或 IP 分片。A 发出初始 TTL 为 `64` 的 IPv4 包，两台路由器各递减 `1`：

| 路段 | 外层封装 | IPv4 TTL |
| --- | --- | --- |
| A → R1 | 以太网，源 MAC 为 A 的接口，目的 MAC 为 R1 的入口 | `64` |
| R1 → R2 | PPP，`Protocol=0x0021` 表示 IPv4，没有以太网的源 / 目的 MAC | `63` |
| R2 → B | 以太网，源 MAC 为 R2 的出口，目的 MAC 为 B 的接口 | `62` |

PPP 链路的另一端就是 R2，R1 无需在这一跳通过 ARP 查询 MAC。没有 MAC 字段并不意味着没有链路封装，也不影响路由器递减 TTL。三段链路上的源 / 目的 IP 与 TCP 端口仍相同，IPv4 头部校验和则随 TTL 更新[^ppp][^forward-ttl]。

家庭路由器常用的是 NAT 中的**网络地址端口转换**（Network Address Port Translation，NAPT）：除转换 IP 地址外，还维护 TCP/UDP 端口的映射，让多台内网设备共用一个公网 IP 地址，并同步更新 IP 与传输层伪头部校验和[^napt]。具体的地址端口映射、回包转换与校验和调整，见第三篇的 [NAT 与 NAPT 示例](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip)。

下面把这些职责放回同一条路径。为方便比较，图中每段链路都按以太网表示；节点标注的是本例的处理职责，不是设备能力的上限。

```mermaid mobile-direction="TB" title="交换、路由与 NAPT 各自改动什么" description="限定普通 IPv4/TCP、以太网链路与家庭 NAPT，无应用代理。交换机不重写 MAC 或 IP；路由器在各自出口重新封装二层头并递减 TTL。家庭 NAPT 额外改写源 IP 和源端口，之后普通公网路由不再改写这对地址端口；不是整个 IP/TCP 头逐字节保持不变。箭头表示经过顺序，不按距离或耗时比例绘制。"
flowchart LR
 client["客户端<br/>生成请求<br/>并封装"] -->|本链路帧| switch["二层交换机<br/>按目的 MAC<br/>转发"]
 switch -->|原帧进网关| nat["家庭 NAPT 路由器<br/>查目的 IP · 减 TTL<br/>改写源地址和端口"]
 nat -->|换帧并改写<br/>源地址端口| router["公网路由器<br/>查目的 IP<br/>递减 TTL"]
 router -->|再次换帧<br/>保持转换后<br/>地址和端口| server["服务端<br/>按连接交付<br/>进程处理"]
 class client,server actor
 class switch,router state
 class nat resource
```

## 一次 HTTPS 请求：冷启动与状态复用

### 冷启动时客户端会发哪些报文

假设浏览器首次访问 `https://example.com/`，本机已经接入 IPv4 以太网，地址为 `192.168.1.10/24`。递归解析器 `192.168.1.53` 与本机同网段，网站 `198.51.100.20:443` 经默认网关 `192.168.1.1` 可达。两个下一跳的 MAC 均未缓存，浏览器也没有可用的 DNS 结果、连接或 TLS 恢复状态。本例采用 UDP DNS、新建 TCP 连接、TLS 1.3 完整握手与 HTTP/1.1，使用无 ECH、无代理或 TUN 的路径。网站地址和下文的网关公网侧地址均为文档示例[^example-ip]。真实家庭网络常由网关设备兼任本地递归解析器（仅需一次 ARP），双栈浏览器也会并发查询 `AAAA` 与 `HTTPS` 记录；这里把两台设备拆开，是为了看清不同下一跳怎样各自触发本地解析。

浏览器先从 URL 取得主机名与默认端口 `443`[^7]。系统准备发送 DNS 查询时，先按路由选出直连解析器，再补齐它的 MAC。得到网站地址后，系统为网站连接重新选路，这次选出的下一跳是网关，又需要一次 ARP。**ARP 的时机取决于下一跳和邻居缓存**，已有可用映射时，主机可以直接发出相应的帧[^arp]。

```mermaid title="从解析下一跳到收到 HTTPS 响应" description="自上而下读交换顺序。两次 ARP 请求都在本地链路广播，箭头指向应答者。DNS 在本地链路交付，网站流量经网关转发。虚线标示受 TLS 保护的消息。箭头按协议消息或交换标示，不对应固定的包数或耗时。省略 DNS 上游查询、额外的 TCP 确认、重传与连接关闭。"
sequenceDiagram
 participant C as 客户端<br/>192.168.1.10
 participant D as 递归解析器<br/>192.168.1.53
 participant G as 默认网关<br/>192.168.1.1
 participant S as 网站<br/>198.51.100.20
 C->>D: 广播 ARP：<br/>查解析器 MAC
 D->>C: ARP 应答：<br/>解析器 MAC
 C->>D: DNS 查询：<br/>example.com A
 D->>C: DNS 应答：<br/>198.51.100.20
 C->>G: 广播 ARP：<br/>查网关 MAC
 G->>C: ARP 应答：<br/>网关 MAC
 C->>S: TCP SYN
 S->>C: TCP SYN-ACK
 C->>S: TCP ACK
 C->>S: TLS ClientHello
 S->>C: TLS ServerHello
 S-->>C: 证书与服务端<br/>Finished 等
 C-->>S: 客户端 Finished
 C-->>S: HTTP 请求
 S-->>C: HTTP 响应
```

### 按阶段对照报文与封装

按时序图从上到下找当前的交换，再沿同一行从内到外读承载关系。每行对应一组独立的协议交换，上一行留下的地址、连接或密钥会被后续阶段使用。

| 本次交换 | 得到什么 | 客户端链路上的封装（从内到外） |
| --- | --- | --- |
| [为 DNS 解析下一跳](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv4-的地址解析arp) | 解析器的 MAC | ARP → 以太网 |
| [查询 DNS](/posts/networking/dns-resolution-caching-encrypted-queries/#udp-dns-查询的报文布局) | 网站的 IPv4 地址 | DNS → UDP → IPv4 → 以太网 |
| 为网站连接解析下一跳 | 网关的 MAC | ARP → 以太网 |
| [TCP 三次握手](/posts/networking/transport-tcp-udp-socket-quic/#连接建立三次握手) | 同步初始序号并建立连接 | TCP → IPv4 → 以太网 |
| [TLS 1.3 握手](/posts/networking/http-evolution-tls-handshake-https/#tls-13-握手密钥协商证书校验与-sni--alpn) | 验证服务身份并派生流量密钥 | TLS 握手消息 → TLS 记录 → TCP → IPv4 → 以太网 |
| [HTTP 请求与响应](/posts/networking/http-evolution-tls-handshake-https/#http-请求响应与消息语义) | 服务器处理 GET 并返回响应 | HTTP 字节 → 受保护的 TLS 记录 → TCP → IPv4 → 以太网 |

DNS 应答为后续连接提供地址。TCP 自己生成以该地址为目的 IP 的 SYN，控制信息写在 TCP 头内，本例的 SYN 载荷为零[^2]。递归解析器可从缓存回答，也可继续向上游查询，详见第五篇的[递归与迭代](/posts/networking/dns-resolution-caching-encrypted-queries/#递归与迭代一次查询如何穿越层级)[^dns-resolver]。

**在客户端链路上，DNS 查询的目的 MAC 属于解析器，SYN 的目的 MAC 属于网关**。SYN 的目的 IP 仍是网站地址。网关收到 SYN 就开始转发，本例同时用 [NAPT](/posts/networking/routing-forwarding-nat-virtual-interfaces/#napt地址端口映射与回包转换) 将客户端源 `192.168.1.10:50001` 映射为 `203.0.113.5:61001`，并更新对应校验和。回包按映射还原目的地址和端口；后续网站流量也使用这条映射。

握手里的 `ClientHello` 和之后的 HTTP 应用数据都经过 TLS 记录层，占用同一条 TCP 连接上的不同字节范围[^5]。一行封装路径可以对应多个 TCP 段，一段 TCP 载荷也可能跨记录边界，抓包时应先[重组字节流](#tls-记录与-tcp-报文段两套独立的边界)再判断其中的消息。服务器收到数据后，依次恢复 TCP 字节流、验证并解密 TLS 记录，再按 HTTP 格式读取请求。响应沿相同的协议关系封装，回程路由可以与去程不同。

在本例中，浏览器与 TLS 终止端能读取 HTTP 路径和内容。终止端也可能是**内容分发网络**（Content Delivery Network，CDN）节点或反向代理。途中观察者能看到所在链路上的地址、端口和流量特征，还可能从重组后的 `ClientHello` 读取 [SNI](/posts/networking/http-evolution-tls-handshake-https/#握手消息与协议协商) 中的目标服务名。使用 [ECH](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello) 时，真实的 SNI 则位于加密的内层 `ClientHello`。

### 状态复用：缓存与已有连接会跳过哪些阶段

冷启动时要准备下一跳地址、解析域名并建连。已经访问过的服务可能留下缓存、连接或 TLS 恢复状态，下一次请求需要完成的网络工作也会随之变化：

| 本次状态 | 还需要的网络工作 |
| --- | --- |
| 本地 HTTP 缓存可直接满足请求 | 可能完全不发网络请求；需要验证缓存时则仍会访问服务端 |
| 同一来源已有可用 HTTP/2 连接 | 在已有 TLS 连接上创建 HTTP 流，不重新执行 TCP/TLS 握手 |
| 连接已关闭，但 DNS 和 TLS 恢复状态仍有效 | 可以复用地址和恢复材料，仍需新建传输连接并执行恢复握手 |
| 只剩可用的 DNS 解析结果 | 直接用已有地址建连并执行完整握手，仍按路由和邻居缓存决定是否发 ARP |

连接复用继续使用已有连接，TLS 会话恢复则利用保存的状态完成新握手。HTTP/2 还允许部分不同来源共用连接，前提是服务端对相应来源具有权威性、证书身份匹配且其他连接条件满足[^reuse]。改用 HTTP/3 时，[TLS 握手在 QUIC 建连过程中进行](/posts/networking/http-evolution-tls-handshake-https/#http3-怎样把-tls-放进-quic)。

下面从最先能省掉的网络工作开始，依次检查 HTTP 缓存、已有连接和解析结果。TLS 恢复材料只参与新握手，不等同于复用已有连接。

```mermaid title="一次 HTTPS 请求可能跳过哪些阶段" description="从上往下检查。本地 HTTP 缓存能直接满足时，不发网络请求；有满足本次服务身份和协议要求的连接时，直接在原连接上发请求。否则先取得地址，再按 HTTP 版本新建安全连接。省略地址族竞速、协议回退与重定向。"
flowchart TB
 cached["1. 检查本地 HTTP 缓存<br/>能直接满足：返回缓存响应"]
 reuse["2. 检查已有连接<br/>可复用：在原连接上发请求"]
 dns["3. 取得地址<br/>有可用解析结果：直接用<br/>没有结果：做 DNS 解析"]
 connect["4. 新建安全连接<br/>HTTP/1.1、HTTP/2：TCP + TLS<br/>HTTP/3：QUIC 集成 TLS"]
 send["在新连接上发送请求"]
 cached -->|不能直接满足| reuse
 reuse -->|无可用连接| dns
 dns --> connect --> send
 class cached,reuse,dns state
 class connect actor
 class send result
```

本例的客户端网段采用 IPv4 以太网。若在以太网上发送 IPv6，帧仍有源与目的 MAC，但解析下一跳用的是第二篇的 [ICMPv6 邻居发现](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv6-的邻居发现ndp)，不是 ARP。

## 观察一次请求：应用日志与接口抓包

先记录 `curl --version`，再完成应用日志与接口视图的对照。不同 TLS 后端会采用不同日志文字，不要求逐行与本文一致。以下请求会访问真实网络，抓包还依赖本机接口与捕获权限，应在自己的终端运行；在线 Playground 的网络、代理与接口环境不能代表本机。只想先观察 Socket 的读写机制，可以运行第四篇不访问外网的[回环半关闭程序](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)。

### 实验一：观察应用连接、TLS 与 HTTP 阶段

```bash frame="code"
curl -q -4 --noproxy '*' --http1.1 \
  --connect-timeout 5 --max-time 15 \
  -v https://example.com/ -o /dev/null
```

`-q` 放在首个选项位置以忽略默认 curl 配置文件；`-4` 固定本次为 IPv4；`--noproxy '*'` 排除 curl 的显式代理选择。后者不会绕过 TUN 路由或网关上的透明处理[^curl]。

成功请求通常能找到解析地址、`Connected to`、TLS 版本与证书验证结果，以及以 `>`、`<` 标出的 HTTP 请求和响应。它们分别说明这个进程连接了什么端点、协商了什么协议、收到了什么响应，不能单独证明真实出口或路由器上的 NAT 改写。

不需要启用代理就能做本实验。若本机已启用 [TUN 与 Fake-IP](/posts/networking/proxies-tunnels-transparent-interception/#fake-ip在-dns-阶段建立映射)，`Connected to example.com (198.18.0.79)` 中的地址可能只是代理维护的映射；握手和请求成功本身不能证明直连了网站的公网地址。

### 实验二：先确定地址与接口，再抓取协议头部

先在同一个终端取得一次成功请求的连接地址，记下输出的 `remote_ip`。如果请求失败或地址为空，先处理错误，再查询选路：

```bash frame="code"
if target_ip=$(curl -q -4 --noproxy '*' --http1.1 \
  --connect-timeout 5 --max-time 15 -sS -o /dev/null \
  -w '%{remote_ip}' https://example.com/) && [ -n "$target_ip" ]; then
  printf 'remote_ip: %s\n' "$target_ip"
else
  unset target_ip
  printf '%s\n' 'No usable remote_ip. Check the curl error before looking up a route.' >&2
fi
```

取得非空地址后，macOS 执行 `route -n get "$target_ip"`，Linux 执行 `ip route get "$target_ip"`。从输出的 `interface`（macOS）或 `dev`（Linux）读出接口名。普通 Wi-Fi 可能是 `en0`，已接管的 macOS 上可能是 `utun4`；以这次查询为准。在同一终端执行下面的命令，按提示输入接口名：

```bash frame="code"
printf 'Interface from route lookup: '
if IFS= read -r interface && [ -n "$interface" ] && [ -n "${target_ip:-}" ]; then
  sudo tcpdump -i "$interface" -nn -c 10 "host $target_ip and tcp port 443"
else
  printf '%s\n' 'A route interface and a recorded remote_ip are required.' >&2
fi
```

保持捕获运行，在另一终端按提示输入刚才记录的 `remote_ip`。`--resolve` 让这次请求连接同一个地址，同时保留 URL 的主机名以供 HTTP、SNI 和证书验证使用[^curl]：

```bash frame="code"
printf 'Recorded remote_ip: '
if IFS= read -r target_ip && [ -n "$target_ip" ]; then
  curl -q -4 --noproxy '*' --http1.1 \
    --resolve "example.com:443:$target_ip" \
    --connect-timeout 5 --max-time 15 https://example.com/ -o /dev/null
else
  printf '%s\n' 'Enter the remote_ip reported by curl.' >&2
fi
```

如果记录的是 Fake-IP，重试时还需要原映射有效。`-c 10` 只限制匹配包的捕获数量；需要观察后续交换时可调大上限，也可按 Ctrl+C 停止。在新建连接开始前启动捕获，通常能按 SYN、SYN-ACK、ACK 识别三次握手。第三次握手也可能携带数据。

:::caution[抓包位置决定可解释的范围]
普通客户端出口捕获不到上游 NAT 改写后的地址。以太网接口上加 `-e` 可观察链路头，TUN 接口没有普通以太网 MAC 头；物理接口上可能只看到代理出站或外层隧道。若权限不足或过滤后没有包，先核对接口、连接端点与捕获时机，不能直接推断网络没有发包。
:::

上面的捕获条件只保留目标网站的 TCP 流量。若要对照其他封装，可在有权限的以太网接口上另做一次捕获，保留 ARP 和 IPv4 ICMP，再用 Wireshark 的显示过滤器检查协议树[^encapsulation-filters]：

| 显示过滤器 | 展开后看什么 |
| --- | --- |
| `ip && tcp.flags.syn == 1 && tcp.flags.ack == 0 && tcp.len == 0` | 以太网帧承载 IPv4 和 TCP。TCP 头有 SYN，载荷长度为零 |
| `tcp.len == 0` | 所有零载荷 TCP 段，包含 SYN、FIN 和纯 ACK 等，需结合标志区分 |
| `arp` | 以太网下直接是 ARP；在 ARP 字段中仍能看到 IPv4 地址 |
| `icmp.type == 8` | 在 IPv4 头下面直接展开 ICMP Echo Request |

抓包位置和分段卸载也会改变工具呈现的分段边界，见第八篇的[捕获步骤与判读](/posts/networking/network-diagnostics-performance-troubleshooting/#wireshark-实验从一条连接验证阶段边界)。

## 总结

- 互联网四层模型（应用、传输、网络、链路）按职责隔离变化；实际软件实现不必机械对应四段独立代码，但每一层的头部边界必须清晰。
- 每次发送从产生报文的协议开始，沿其承载路径逐层封装。TCP 能独立发控制段，IPv4 能直接承载 ICMP，以太网能直接承载 ARP。
- 路由器为每一跳重新做链路封装；以太网有源与目的 MAC，点对点 PPP 没有这对字段。普通转发递减 TTL，但不改写 IP 地址和端口；NAT 按配置转换地址或端口，代理则终结并重建连接。
- Socket 是操作系统向应用暴露的编程接口而非网络协议；应用写入 Socket 成功只代表本地发送路径接受了相应字节。

下一篇[《计算机网络（二）：IP 寻址、子网划分与局域网通信》](/posts/networking/ip-addressing-subnet-lan-delivery/)把镜头移到客户端的第一跳：主机怎样取得网络配置、选中同链路的目标或网关，并找到它的 MAC？网关收到包后的[选路转发与地址转换](/posts/networking/routing-forwarding-nat-virtual-interfaces/)，则由第三篇展开。

## 延伸阅读

- [System Design：一个请求的旅程](https://designed-to-scale.vercel.app/#/request-lifecycle/1)——交互式图解，逐步串起 DNS、建连、请求、服务端查询与响应，适合从整体路径和耗时角度回顾一次页面加载
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/)——通过 C 语言 Socket 接口直观理解应用程序与内核网络边界的交互
- [Kurose & Ross: Wireshark Labs](https://gaia.cs.umass.edu/kurose_ross/wireshark.php)——配合《计算机网络：自顶向下方法》的配套抓包实验，适合对照观察各层协议字段

[^1]: 〔RFC〕[RFC 1122: Requirements for Internet Hosts — Communication Layers](https://www.rfc-editor.org/rfc/rfc1122.html)——定义互联网主机的应用层、传输层、网络层与链路层四层通信模型。

[^2]: 〔RFC〕[RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293.html)——区分应用字节流、TCP 报文段与承载它的 IP 数据报；§3.1 描述 TCP 头部与四元组，§3.3 描述传输控制块与状态机，§3.5 给出基本三次握手，§3.7.1 定义 MSS，§3.8.6 说明窗口与发送控制。

[^3]: 〔RFC〕[RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791.html)——定义 IPv4 数据报格式、Protocol 协议号复用字段、TTL 与跨网络转发机制。

[^forward-ttl]: 〔RFC〕[RFC 1812 §5.3.1](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.3.1)规定转发时 TTL 至少减一；[§4.2.2.5](https://www.rfc-editor.org/rfc/rfc1812.html#section-4.2.2.5)说明首部校验和更新，[§5.2.1.2](https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2.1.2)说明单播包按出接口进行链路层封装。

[^ppp]: 〔RFC〕[RFC 1661 §1–2](https://www.rfc-editor.org/rfc/rfc1661.html#section-1)——PPP 在两个直接相连的对端之间传输，封装不含以太网的源 / 目的 MAC；[RFC 1332 §2.1](https://www.rfc-editor.org/rfc/rfc1332.html#section-2.1)指定 IPv4 数据报对应的 PPP 协议号 `0x0021`。

[^dns-resolver]: 〔RFC〕[RFC 1034 §4.3.1、§4.3.2、§5.3.1](https://www.rfc-editor.org/rfc/rfc1034.html#section-5.3.1)——客户端可将递归查询交给配置的解析服务；解析服务可使用缓存或继续查询。

[^example-ip]: 〔RFC〕[RFC 5737 §3](https://www.rfc-editor.org/rfc/rfc5737.html#section-3)——`198.51.100.0/24` 与 `203.0.113.0/24` 是文档示例网段。

[^4]: 〔编号表〕[IANA: IEEE 802 Numbers — Ethertypes](https://www.iana.org/assignments/ieee-802-numbers/ieee-802-numbers.xhtml#ieee-802-numbers-1)——列出 IPv4、ARP 与 IPv6 的 EtherType。

[^ethernet-frame]: 〔RFC 与设备文档〕[RFC 894（含勘误）](https://www.rfc-editor.org/rfc/inline-errata/rfc894.html)说明 IPv4 在以太网上的载荷上限和填充规则。[Cisco 的以太网帧格式](https://www.cisco.com/en/US/docs/internetworking/troubleshooting/guide/tr1904.pdf)说明帧字段、最小帧长和前导码，[802.1Q 帧格式](https://www.cisco.com/c/en/us/support/docs/lan-switching/8021q/17056-741-4.html)说明单标签增加的 4 字节与 1522 字节的帧长上限，[接口 MTU 文档](https://www.cisco.com/c/en/us/td/docs/iosxr/cisco8000/interfaces-and-hardware-component/configuration-guide/interfaces-and-hardware-component-config-cisco8000/mtu-overview/ethernet-mtu.html)给出巨型帧支持示例。

[^5]: 〔RFC〕[RFC 9846 §2、§4、§5](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)——TLS 1.3 握手与记录层边界；2026 年 7 月取代 RFC 8446。SNI 的扩展格式另见 [RFC 6066 §3](https://www.rfc-editor.org/rfc/rfc6066.html#section-3)，ECH 另见第六篇。

[^tls-record]: 〔RFC〕[RFC 9846 §5.1–5.2](https://www.rfc-editor.org/rfc/rfc9846.html#section-5.1)——TLS 1.3 应用数据可跨记录拆分或在记录内合并，受保护记录的外层头部带有密文长度。

[^reuse]: 〔RFC〕[RFC 9113 §9.1.1](https://www.rfc-editor.org/rfc/rfc9113.html#section-9.1.1)——HTTP/2 连接复用及不同来源共用连接时的权威性和证书要求；[RFC 9111 §4](https://www.rfc-editor.org/rfc/rfc9111.html#section-4)说明直接使用缓存响应与重新验证的条件。

[^6]: 〔教学资料〕[Beej's Guide to Network Programming: What is a socket?](https://beej.us/guide/bgnet/html/split/what-is-a-socket.html)——解释 Socket 作为操作系统文件描述符与网络编程接口的抽象定位。

[^7]: 〔RFC〕[RFC 9110 §4.2: HTTP-Related URI Schemes](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2)——HTTP/HTTPS URI 方案与默认端口。

[^ktls]: 〔平台与实现〕[Linux Kernel: Kernel TLS](https://docs.kernel.org/networking/tls.html)——用户态握手与内核记录层加解密的职责划分。

[^ipv6]: 〔RFC〕[RFC 8200 §3、§4、§8.1](https://www.rfc-editor.org/rfc/rfc8200.html#section-3)——IPv6 基本头、扩展头、Hop Limit 与 ICMPv6 上层协议号。

[^connect]: 〔RFC〕[RFC 9110 §9.3.6: CONNECT](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)——HTTP CONNECT 的目标 authority 与隧道建立语义。

[^tun-name]: 〔平台与实现〕[OpenBSD tun(4)](https://man.openbsd.org/tun.4)——`tun` 是三层网络隧道接口。

[^socks]: 〔RFC〕[RFC 1928 §3–§6](https://www.rfc-editor.org/rfc/rfc1928.html#section-3)——SOCKS5 协商、请求、地址类型与代理回复。

[^curl]: 〔工具文档〕[curl 官方手册](https://curl.se/docs/manpage.html)——`--disable`、`--ipv4`、`--noproxy`、`--resolve` 与 `--write-out`；禁用 curl 配置文件不影响系统路由。

[^osi]: 〔标准〕[ISO/IEC 7498-1: Open Systems Interconnection — Basic Reference Model](https://standards.iso.org/ittf/PubliclyAvailableStandards/s020269_ISO_IEC_7498-1_1994(E).zip)——OSI 七层参考模型的标准定义，用于对照互联网四层模型中的会话层与表示层分工。

[^napt]: 〔RFC〕[RFC 3022 §2.2、§4.1](https://www.rfc-editor.org/rfc/rfc3022.html#section-2.2)——NAPT 的全称、地址与端口映射，以及多台内网设备共用外部地址的机制。

[^napi]: 〔平台与实现〕[Linux 内核文档：NAPI](https://docs.kernel.org/networking/napi.html)——中断通知与轮询处理的关系；名称在 Linux 2.4 时称 New API，现已不再对应特定全称。

[^skb]: 〔平台与实现〕[Linux 内核文档：struct sk_buff](https://docs.kernel.org/networking/skbuff.html)——包的元数据与数据缓冲分离，数据可以由线性区、页片段及关联缓冲组成；协议封装顺序不等于物理内存连续布局。

[^icmp-echo]: 〔RFC〕[RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792.html#page-14)——IPv4 直接承载 ICMP Echo，ICMP 头后可以有探测数据。

[^arp]: 〔RFC〕[RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.html)——定义以太网承载 ARP 的方法与消息中的协议地址字段。

[^mss]: 〔RFC〕[RFC 6691 §2](https://www.rfc-editor.org/rfc/rfc6691.html#section-2)——TCP 最大段大小及发送时对 IP/TCP 选项开销的处理。

[^encapsulation-filters]: 〔工具文档〕Wireshark 显示过滤字段参考：[TCP](https://www.wireshark.org/docs/dfref/t/tcp.html)、[ARP](https://www.wireshark.org/docs/dfref/a/arp.html)和[ICMP](https://www.wireshark.org/docs/dfref/i/icmp.html)。

[^beej-byte-order]: 〔编程指南〕[Beej’s Guide to Network Programming §3.2](https://beej.us/guide/bgnet/html/split/ip-addresses-structs-and-data-munging.html#byte-order)及[对应中文译文](https://beej-zhcn.netdpi.net/ipaddress_struct/byte_orderff08_wei_yuan_zu_shun_xu_ff09)——多字节字段的网络字节序与本机转换。

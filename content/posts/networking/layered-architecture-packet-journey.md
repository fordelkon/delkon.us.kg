---
title: "计算机网络（一）：协议分层、封装与一次请求的路径"
description: "建立互联网四层协议模型、数据封装与解封装以及 Socket 抽象边界的坐标系，追踪一次 HTTPS 请求从应用进程到远端服务器再返回的完整路径，并区分观察现象与协议保证。"
publishDate: "18 Nov 2026"
tags: ["networking"]
---

在浏览器里打开一个网址，应用交给操作系统的是什么，路由器看到的又是什么？我们跟着一次 HTTPS 请求，看看数据怎样在应用、传输、网络和链路四层之间交付，再顺着一条具体路径追踪哪些字段会变、哪些会留到对端。这是[计算机网络系列](/series/networking/)的第一篇，实验以 macOS 和 Linux 为例。

先建立分层与封装的概念，再看主机通过什么接口发包、沿途设备怎样转发，最后按 DNS、TCP、TLS、HTTP 的实际阶段走通一次请求。前半篇按概念依赖展开，完整请求一节再把它们放回运行顺序，也会对照缓存命中和连接复用时哪些步骤可以省去。

## 为什么需要分层模型

把数据从一台电脑上的浏览器送到另一台机器上的 Web 服务进程，至少要同时解决四类完全不同的问题：应用程序如何表达业务语义（请求哪个路径、返回什么状态码），端到端主机如何区分不同进程并处理丢包乱序，跨越多个中间网络时如何选择下一跳，以及电信号或无线电波如何在一段物理链路上把比特送到相邻设备。

如果把这四类逻辑揉进同一套协议，换一根网线、升级一种无线标准或调整路由算法，浏览器和服务器的代码就都要重写。互联网工程采用**分层**（layering）来隔离变化：每一层只向下层请求特定的传输服务，并向上层暴露相对稳定的抽象。

描述互联网协议体系时，RFC 1122 将主机的通信软件组织为四个层次（**传输控制协议/网际协议**，Transmission Control Protocol / Internet Protocol，简称 TCP/IP 四层模型）[^1]：

| 层次 | 核心职责 | 典型协议或接口 | 主要关注的标识 |
| --- | --- | --- | --- |
| 应用层（Application） | 规定业务消息语义与交互格式 | HTTP、DNS、SSH、SOCKS5 | 域名、URI、消息头 |
| 传输层（Transport） | 进程间复用、端到端可靠性或流量控制 | TCP、UDP、QUIC | **端口号**（Port） |
| 网络层（Internet） | 跨网络的逻辑寻址与逐跳转发 | IPv4、IPv6、ICMP | IP 地址 |
| 链路层（Link） | 同一本地链路上的成帧、校验与介质访问 | 以太网（Ethernet）、Wi-Fi | **媒体访问控制地址**（Media Access Control Address，MAC 地址） |

教学与工程讨论中还会遇到**开放系统互连七层参考模型**（Open Systems Interconnection Reference Model，简称 OSI 七层模型：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层）[^osi]。与互联网四层模型相比，OSI 把链路与物理介质拆成两层，并在传输层之上额外划分出会话层与表示层；而在实际互联网协议栈中，会话管理与数据编码加密（例如 TLS 与 HTTP 压缩）通常由应用层协议或库自行承担，内核协议栈并没有独立的第 5、6 层数据结构。入门阶段先以四层模型作为主地图即可，排查双工协商或网线故障时再补入物理层视角。

物理层负责双绞线、光纤或无线信道上的编码、调制和信号恢复。五层教学模型将这部分从链路层的讨论范围中单独拆出。以太网和 Wi-Fi 都包含链路控制与物理传输规范；表中的 MAC 适用于这类链路，PPP、回环和 TUN 等接口则有各自的数据格式。

后文的“二层”“三层”沿用 OSI 的层号：二层是数据链路层，三层是网络层，四层是传输层。因此，“二层交换机”按 MAC 转发帧，“三层路由”按 IP 选择下一跳；这里的编号不是把上面的 TCP/IP 四层表从第一行依次编号。

:::note[协议职责与代码运行位置]
四层模型划定协议职责与数据边界，不规定源码必须分成四个目录。常见应用通过用户态 TLS 库完成握手与记录层处理；部分实现也会把记录层的加解密移入内核或硬件，例如 Linux kTLS，握手仍由用户态处理[^ktls]。QUIC 则常在用户态借助 UDP 实现可靠传输、多路复用与拥塞控制。判断某一层的职责，要看它解释什么数据、提供什么保证；运行位置需要另查具体实现。
:::

## 封装、解封装与数据单元

分层概念落地到线上跑的数据，就是**封装**（encapsulation）与**解封装**（decapsulation）。数据从发送方应用向下穿过协议栈时，每一层都会把上一层交付的数据整体视为不透明的**载荷**（payload），并在其前方加上本层的控制头部（有时还包括链路层尾部校验）；接收方收到信号后，则自底向上逐层校验、剥离本层头部，最终把还原出的字节流或数据报交还给目标进程。

不同层次的**协议数据单元**（Protocol Data Unit，PDU）有各自的名称，RFC 9293 在描述 TCP 时就明确区分了应用看到的字节流、网络上传输的 TCP 报文段以及承载它的 IP 数据报[^2]：

| 所在层次 | 数据单元名称 | 携带的关键控制信息 |
| --- | --- | --- |
| 应用层 | 消息（Message）或字节流（Byte Stream） | HTTP 方法、路径、Host、状态码；TLS 记录头与密文载荷 |
| 传输层 | **报文段**（Segment，TCP）或**数据报**（Datagram，UDP） | 源端口、目的端口、序号、确认号、校验和 |
| 网络层 | **IP 数据报**（Packet / Datagram） | 源 IP、目的 IP、协议号（Protocol / Next Header）、**生存时间**（Time to Live，TTL）/ **跳数限制**（Hop Limit） |
| 链路层 | **帧**（Frame） | 源 MAC、目的 MAC、**以太网类型**（EtherType）、**帧校验序列**（Frame Check Sequence，FCS） |

### 以太网帧的封装与结构

**以太网帧**（Ethernet Frame）是以太网在数据链路层的传输单位。以基于 TCP 的 HTTPS 为例，TCP 报文段承载 TLS 编码后的部分字节，IP 数据报封装 TCP 报文段，以太网帧再把这一跳要发送的 IP 数据报装进载荷。物理层把数据编码为链路上的信号。以太网帧也可以直接承载 ARP，接收端通过 EtherType 区分载荷协议[^4]。

```mermaid mobile-direction="TB" title="以太网承载 TCP/IP 的封装结构" description="外层容器包含内层载荷：帧头与 FCS 在 IP 包之外，IP 头在 TCP 段之外。常见路径中，应用处理 TLS/HTTP，内核处理 TCP/IP，驱动与硬件处理链路成帧。图不按字节比例，也不表示消息、TLS 记录和 TCP 报文段一一对应。"
flowchart LR
 subgraph ethernet[以太网帧]
  eth["帧头"]
  subgraph ip_packet[IP 数据报]
   ip["IP 头"]
   subgraph tcp_segment[TCP 报文段]
    tcp["TCP 头"]
    payload["载荷"]
    tcp --- payload
   end
   ip --- tcp
  end
  fcs["FCS"]
  eth --- ip
  payload --- fcs
 end
 linkStyle default stroke:none
```

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

### 接收端怎样选择上层协议

先顺着外层到内层看接收过程。接收端知道该把载荷交给哪一个上层协议模块，靠的是头部预留的**复用标识字段**（multiplexing identifier）：

1. 以太网帧头中的 `EtherType` 指明载荷类型，例如 `0x0800` 代表 IPv4、`0x86DD` 代表 IPv6、`0x0806` 代表 ARP[^4]。
2. IPv4 的 `Protocol` 字段指明后续协议，例如 `6` 为 TCP、`17` 为 UDP、`1` 为 ICMP[^3]。IPv6 的 `Next Header` 可以指向扩展头或上层协议；ICMPv6 使用协议号 `58`，不能直接套用 IPv4 的 `1`[^ipv6]。
3. TCP/UDP 头部的端口号参与选择主机内的通信端点。具体选择还可能结合本地地址、远端地址与端口；已建立的 TCP 连接不能只靠目的端口区分[^2]。应用如何操作这些端点，见后文的 [Socket 接口](#操作系统边界socket-与网络接口)。

一旦弄清这三步解复用链条，很多入门时容易混淆的问题就能直接分清：**域名**只出现在应用层消息（如 HTTP `Host` 头、DNS 查询载荷或 TLS `Server Name Indication` 扩展）中，内核的 IP 层和 TCP 层并不认识域名；**IP 地址**负责定位网络中的主机接口，**端口**负责定位主机内部的通信端点。

### TLS 记录与 TCP 报文段：两套独立的边界

头部能标识载荷类型，并不意味着相邻协议的数据单元必须一一对应。以 HTTPS over TCP 为例，逻辑栈是 HTTP → **传输层安全**（Transport Layer Security，TLS）→ TCP → IP → 当前链路。HTTP 生成消息或 HTTP/2 帧，TLS 将应用数据封装成**记录**（TLS Record），再把编码后的字节交给 TCP。TLS 如何协商密钥、验证身份并保护数据，见[第六篇的 TLS 1.3 握手](/posts/networking/http-evolution-tls-handshake-https/#tls-13-握手密钥协商证书校验与-sni--alpn)。这里关注封装边界：TCP 不解释 TLS 记录格式，也不保证分段时保留记录边界[^2][^tls-record]。

**TLS 记录边界与 TCP 报文段边界相互独立**：一条记录可以跨多个段，一个段也可以同时承载不同记录的字节。

假设 TLS 连续生成两条记录：A 编码后共 1000 字节，B 编码后共 800 字节。把这段连续的 1800 字节从 `0` 开始编号，则 A 占 `0…999`，B 占 `1000…1799`。这里使用的是示例字节偏移，包含 TLS 记录头和受保护载荷，不是 HTTP 正文编号，也不是连接实际使用的 TCP 初始序号。

下面把同一批字节按两套边界分别画出。箭头上的范围表示：上方记录的哪些字节被放进了下方报文段的载荷。

```mermaid title="两条 TLS 记录怎样装进三个 TCP 报文段" description="上排按 TLS 记录分组，下排按一种可能的 TCP 分段分组。A 分到段 1 和段 2，B 分到段 2 和段 3；段 2 同时包含 A 的尾部与 B 的开头。箭头表示字节归属，不表示多发了一份数据；框的宽度不代表字节长度，TCP 头部未画出。"
flowchart TB
 a["TLS 记录 A<br/>0…999 · 共 1000 字节"]
 b["TLS 记录 B<br/>1000…1799 · 共 800 字节"]
 s1["TCP 段 1<br/>0…599 · 600 字节<br/>仅含 A 的开头"]
 s2["TCP 段 2<br/>600…1399 · 800 字节<br/>A 的尾部 + B 的开头"]
 s3["TCP 段 3<br/>1400…1799 · 400 字节<br/>仅含 B 的尾部"]
 a -->|0…599：600 字节| s1
 a -->|600…999：400 字节| s2
 b -->|1000…1399：400 字节| s2
 b -->|1400…1799：400 字节| s3
 class a,b resource
 class s1,s2,s3 state
```

顺着记录 A 的两条箭头看，它的 1000 字节分成了 600 和 400 字节，分别进入段 1、段 2。再看段 2 的两条入箭头，它装着 A 的最后 400 字节和 B 的最初 400 字节，TLS 的记录边界恰好落在这个段的载荷内部。TCP 无须知道这里换了一条记录。

这只是用于说明边界独立的一种切分，实际分段还受 MSS、发送时机及可用发送窗口等因素影响[^2]。HTTP 的边界也独立于它们：一条 HTTP 消息可以跨多个 TLS 记录，一条 TLS 记录也可以容纳多个 HTTP 消息或 HTTP/2 帧的字节[^tls-record]。

**接收端怎样恢复 TLS 记录？**

TCP 向上交付有序字节流，TLS 则依据记录头中的 `length` 字段收齐一条记录，再认证、解密并把应用数据交给 HTTP；字节不足时就等待更多数据[^tls-record]。在上图中，段 1、段 2 的字节按序交付后才能收齐 A，B 还要等待段 3。因此，**并非每收到一个 TCP 段就能解密一条 TLS 记录**，HTTP 也仍需按自身格式识别消息或帧。

## 操作系统边界：Socket 与网络接口

**套接字**（socket）是应用读写网络数据的操作系统接口。Unix-like 系统常用文件描述符访问它，再调用 `connect`、`send` 或 `recv`。常见的 Internet `SOCK_STREAM` 套接字使用 TCP，`SOCK_DGRAM` 套接字使用 UDP，具体仍取决于地址族与协议。Unix 域套接字则不经过 IP 网络[^6]。

前面介绍的是协议数据格式，现在看应用如何把数据交给本机发送路径。Linux、macOS 和 Windows 都有套接字、协议栈和网络接口的抽象，钩子位置与驱动接口各有不同；下图采用普通主机的物理接口路径。

```mermaid title="从套接字到物理介质的发送路径" description="普通 TCP/IP 套接字经物理接口发送的概念图。箭头表示数据沿实现边界交付，不描述任何内核的固定钩子顺序。回环接口在本机折返；路由若选择 TUN，则把 IP 包交给对应程序。"
flowchart TB
 app["用户态应用"] -->|write / send| socket["套接字和发送缓冲"]
 socket --> stack["内核传输与 IP 处理"]
 stack --> route["路由与适用的过滤策略"]
 route -->|物理接口| device["接口与驱动"]
 device -->|网卡读取发送数据| nic["网卡与物理层"]
 nic -->|介质相关的信号| wire["双绞线、光纤或无线链路"]
 route -->|本机路径| loop["回环接口"]
 route -->|虚拟出口| tun["TUN：IP 包交给程序"]
```

网卡通常通过**直接内存访问**（direct memory access，DMA）交换数据。Linux 的**网络事件处理机制**（NAPI，早期称 New API，即“新接口”）通常在设备中断通知后调度轮询，批量处理收发事件；硬件中断合并则是减少中断频率的另一项机制[^napi]。驱动、卸载与虚拟接口会改变主机抓包所见，参见[第八篇的捕获位置说明](/posts/networking/network-diagnostics-performance-troubleshooting/#https-与代理路径需要另一次捕获)。

:::important[本地写入成功与远端处理完成]
普通 TCP Socket 的 `write`/`send` 成功，只说明返回值所计的字节被本地发送路径接受，既不证明已经发出，也不证明远端业务处理完成。一次调用还可能只接受部分数据，详见第四篇的[Socket 读写契约](/posts/networking/transport-tcp-udp-socket-quic/)。这与并发系列的[消息交付与处理完成](/posts/concurrency/message-passing-workers-backpressure/)是相似的责任边界，具体保证仍由各自接口规定。
:::

再看流量怎样进入代理；这里只标出入口，具体流程留在第七篇：

- **显式代理**：应用主动连接代理监听端口，用 HTTP CONNECT 或 SOCKS5 告诉它目标，由代理创建出站连接。HTTP CONNECT 与 SOCKS5 是不同协议，目标表达和解析位置需分别理解[^connect][^socks]。
- **TUN 虚拟接口**：程序从三层接口读写 IP 包，路由和策略把选中的流量导向该接口。能否覆盖某个应用、IPv4 或 IPv6，取决于实际选路与排除规则；TUN 本身也不规定后续是直连、代理重建连接还是 IP 隧道封装。

## 端到端与逐跳：主机、交换机与路由器的分工

沿着上一节的发送路径离开本机网卡后，数据还要经过家用路由器、运营商网络与骨干路由器等多段接力。现在从单台主机内部转向整条网络路径，区分沿途设备各自解释哪一层的头部。

- **二层交换机**（Switch）在普通二层转发中读取目的 MAC，查询转发表并选择出端口，通常不改写 IP 头。具备三层转发、过滤等功能的设备还会执行额外处理，不能只凭设备名称判断能力。
- **路由器**（Router）检查目的 IP 并选择下一跳，转发时递减 IPv4 TTL 或 IPv6 Hop Limit，再为下一段链路重新封装。若下一段仍为以太网，就使用这一跳的源/目的 MAC；其他链路未必使用以太网帧头[^3][^ipv6]。
- **终端主机**（Host）把交给本机的数据继续解复用到传输端点和应用。透明代理、NAT、防火墙等中间功能可能检查更高层；这里描述的是普通交换与路由的基本职责。

因此，一次跨网通信中存在两条边界截然不同的生命周期：

1. **链路层帧头是逐跳重写的**（hop-by-hop）：同一份 IP 数据报从你的电脑到家用路由器、再到运营商接入设备，每经过一次三层路由转发，外层的源/目的 MAC 地址都会被替换成当前这段链路的收发双方。
2. **网络层 IP 与传输层端口在常规直连中是端到端保持的**（end-to-end）：直到遇到**网络地址转换**（Network Address Translation，NAT）设备或**应用代理**（Proxy）。NAT 按配置转换地址，而代理服务器在应用层或传输层终结客户端连接，再以自己的网络身份向目标发起一条新连接——这也是第三篇与第七篇要重点拆解的区别。

家庭路由器常用的是 NAT 中的**网络地址端口转换**（Network Address Port Translation，NAPT）：除转换 IP 地址外，还维护 TCP/UDP 端口的映射，让多台内网设备共用一个公网 IP 地址[^napt]。具体的地址端口映射与回包转换，见[第三篇的 NAT 与 NAPT 示例](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip)。

下面把这些职责放回同一条路径。为方便比较，图中每段链路都按以太网表示；节点标注的是本例的处理职责，不是设备能力的上限。

```mermaid mobile-direction="TB" title="交换、路由与 NAPT 各自改动什么" description="限定普通 IPv4/TCP、以太网链路与家庭 NAPT，无应用代理。交换机不重写 MAC 或 IP；路由器在各自出口重新封装二层头并递减 TTL。家庭 NAPT 额外改写源 IP 和源端口，之后普通公网路由不再改写这对地址端口；不是整个 IP/TCP 头逐字节保持不变。箭头表示经过顺序，不按距离或耗时比例绘制。"
flowchart LR
 client["客户端<br/>生成请求并封装"] -->|本链路帧| switch["二层交换机<br/>按目的 MAC 转发"]
 switch -->|原帧交给网关| nat["家庭 NAPT 路由器<br/>查目的 IP<br/>改写源地址和端口"]
 nat -->|新链路帧，已转换的包| router["公网路由器<br/>查目的 IP<br/>递减 TTL"]
 router -->|再次换帧，地址端口保持| server["服务端<br/>按连接交付数据<br/>服务进程处理请求"]
```

## 走通一次 HTTPS 请求的完整路径

下面固定一个便于追踪的模型：本机 IPv4 为 `192.168.1.10`，使用普通局域网、默认网关和家庭 NAT；浏览器访问 `https://example.com/`，需要解析地址并新建 TCP 连接，使用 TLS 1.3 且未启用 ECH，不经过显式代理或 TUN 接管。下文的 `198.51.100.20` 只是远端地址示意，实验必须使用当次解析或连接的实际地址。HTTP/3、缓存命中和连接复用会改变阶段顺序，分别在第五、六篇展开。

### 1. 准备目标地址（应用层触发 DNS）

浏览器从 URL 取得协议、服务名和端口。需要新连接且没有可用地址时，由系统解析服务或应用内置解析器取得目标地址。解析器角色、缓存和加密方式见[第五篇](/posts/networking/dns-resolution-caching-encrypted-queries/)[^7]。

### 2. 建立传输连接（TCP 三次握手）

浏览器按目标 IP 和端口建立 TCP 连接。本机按路由和邻居映射把数据送给网关，家庭路由器在本例改写出站源地址与端口。握手建立两端的传输状态，具体报文、序号和关闭状态见[第四篇](/posts/networking/transport-tcp-udp-socket-quic/#建立与关闭三次握手和-time-wait)[^2]。

### 3. 建立加密信道（TLS 握手）

TCP 提供可靠、有序的字节流。浏览器在其上执行 TLS 1.3 握手，验证服务身份并建立加密密钥。未使用 ECH 时，ClientHello 中的 SNI 通常可被观察到。证书验证、加密起点和 ECH 见[第六篇](/posts/networking/http-evolution-tls-handshake-https/#tls-13-握手密钥协商证书校验与-sni--alpn)[^5]。

### 4. 发送 HTTP 请求与接收响应

浏览器将 HTTP/1.1 请求或 HTTP/2 帧交给 TLS 记录层加密，再写入 Socket。普通内核 TCP/IP 发送路径将其分段、封装并送往下一跳；TLS 终止端收到密文后解密、解析请求，再将响应经回程路径送回浏览器。回程未必与去程相同。

在本例的信任与连接模型下，浏览器和 TLS 终止端能读取 HTTP 路径与内容；这个终止端也可能是**内容分发网络**（Content Delivery Network，CDN）节点或反向代理。途中观察者能看到所在链路上的地址、端口和流量特征，未启用 ECH 时还可能重组 `ClientHello` 读取 SNI；它不一定恰好装在一个包中。可见性取决于观察位置，不能仅凭“经过代理”判断内容是否被解密。

### 已有连接和缓存时，请求怎样变化

前面的四步描述一次冷启动访问。已经访问过的服务可能留下缓存、连接或 TLS 恢复状态，下一次请求的路径也会随之变化：

| 本次状态 | 还需要的网络工作 |
| --- | --- |
| 本地 HTTP 缓存可直接满足请求 | 可能完全不发网络请求；需要验证缓存时则仍会访问服务端 |
| 同一来源已有可用 HTTP/2 连接 | 在已有 TLS 连接上创建 HTTP 流，不重新执行 TCP/TLS 握手 |
| 连接已关闭，但 DNS 和 TLS 恢复状态仍有效 | 可以复用地址和恢复材料，仍需新建传输连接并执行恢复握手 |
| 首次访问且没有可用状态 | 按前面的 DNS、TCP、TLS、HTTP 模型展开 |

连接复用继续使用已有连接，TLS 会话恢复则利用保存的状态完成新握手。HTTP/2 还允许部分不同来源共用连接，前提是服务端对相应来源具有权威性、证书身份匹配且其他连接条件满足[^reuse]。HTTP/3 的传输建立方式另见[第六篇](/posts/networking/http-evolution-tls-handshake-https/)。

下面把运行时的选择画成分支。已有连接是否可用由客户端判断，DNS 缓存只提供仍可用的解析结果，TLS 恢复材料则只参与一次新握手。

```mermaid title="一次 HTTPS 请求可能跳过哪些阶段" description="一次访问的决策示意，省略地址族竞速、协议回退与重定向。已建立连接或新建立的连接均须满足本次服务身份与协议的要求。TLS 会话恢复用于建立新的安全连接。"
flowchart TB
 start["应用请求"] -.-> cached{"本地 HTTP 缓存可直接满足？"}
 cached -->|是| local["返回缓存响应"]
 cached -.->|否| reuse{"有可用于本次来源的连接？"}
 reuse -->|是| send["发送请求"]
 reuse -.->|否| dns{"有可用的解析结果？"}
 dns -.->|有| protocol{"本次使用哪种传输？"}
 dns -.->|无，先查询| lookup["DNS 解析"]
 lookup -.-> protocol
 protocol -->|HTTP/1.1 或 HTTP/2| tcp["新建 TCP，再执行 TLS"]
 protocol -->|HTTP/3| quic["新建 QUIC，集成 TLS"]
 tcp --> send
 quic --> send
```

本篇逐跳示例采用 IPv4 以太网。IPv6 在以太网上仍可使用源和目的 MAC，下一跳地址通过 ICMPv6 邻居发现解析。点对点和 TUN 等接口的交付方式另计，详见[第二篇的邻居发现](/posts/networking/ip-addressing-subnet-lan-delivery/#ipv6-的邻居发现ndp)。

## 观察一次请求：实验能证明什么，不能证明什么

先记录 `curl --version`，再完成应用日志与接口视图的对照。不同 TLS 后端会采用不同日志文字，不要求逐行与本文一致。以下请求会访问真实网络，抓包还依赖本机接口与捕获权限，应在自己的终端运行；在线 Playground 的网络、代理与接口环境不能代表本机。只想先观察 Socket 的读写机制，可以运行第四篇不访问外网的[回环半关闭程序](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)。

### 实验一：观察应用连接、TLS 与 HTTP 阶段

```bash frame="code"
curl -q -4 --noproxy '*' --http1.1 \
  --connect-timeout 5 --max-time 15 \
  -v https://example.com/ -o /dev/null
```

`-q` 放在首个选项位置以忽略默认 curl 配置文件；`-4` 固定本次为 IPv4；`--noproxy '*'` 排除 curl 的显式代理选择。后者不会绕过 TUN 路由或网关上的透明处理[^curl]。

成功请求通常能找到解析地址、`Connected to`、TLS 版本与证书验证结果，以及以 `>`、`<` 标出的 HTTP 请求和响应。它们分别说明这个进程连接了什么端点、协商了什么协议、收到了什么响应，不能单独证明真实出口或路由器上的 NAT 改写。

启用 TUN/Fake-IP 时，即使日志显示 `Connected to example.com (198.18.0.79)`、TLS 1.3 和 `HTTP/1.1 200 OK`，连接地址也可能只是代理维护的映射地址。“请求成功”不等于“直接连接了网站公网地址”，还需结合选路结果确认实际路径。

### 实验二：先确定地址与接口，再抓取协议头部

先取得一次成功请求的连接地址，再查询本机对该地址的选路。以下变量和命令放在同一终端运行；如果第一条请求失败，先处理错误，不要拿空变量继续：

```bash frame="code"
target_ip=$(curl -q -4 --noproxy '*' --http1.1 \
  --connect-timeout 5 --max-time 15 -sS -o /dev/null \
  -w '%{remote_ip}' https://example.com/)
# macOS
route -n get "$target_ip"
# Linux uses: ip route get "$target_ip"
```

从选路输出找到接口名，例如普通 Wi-Fi 环境的 `en0` 或透明接管环境的 `utun4`。把下面变量改为这次输出中的值，不能直接假定物理网卡就是出口：

```bash frame="code"
interface=utun4
sudo tcpdump -i "$interface" -nn -c 10 "host $target_ip and tcp port 443"
```

保持捕获运行，在另一终端把刚才的地址赋给 `target_ip`，用 `--resolve` 固定下一次请求连接这个地址，同时保留 URL 的主机名以供 HTTP、SNI 和证书验证使用[^curl]：

```bash frame="code"
# Replace with the remote_ip recorded in the first terminal.
target_ip=198.18.0.79
curl -q -4 --noproxy '*' --http1.1 \
  --resolve "example.com:443:$target_ip" \
  --connect-timeout 5 --max-time 15 https://example.com/ -o /dev/null
```

本例中的 Fake-IP 仅在对应映射仍有效时可用；其他机器必须使用自己的观察结果。捕获数量未达到 10 时可按 Ctrl+C 停止。普通新建 TCP 连接通常能看到 `[S]`、`[S.]`、`[.]`；第三次握手也可能携带数据，不能把三条 `length 0` 当作所有握手的必要格式。

:::caution[抓包位置决定可解释的范围]
普通客户端出口捕获不到上游 NAT 改写后的地址。以太网接口上加 `-e` 可观察链路头，TUN 接口没有普通以太网 MAC 头；物理接口上可能只看到代理出站或外层隧道。若权限不足或过滤后没有包，先核对接口、连接端点与捕获时机，不能直接推断网络没有发包。
:::

接口抓包通常需要额外捕获权限。获得权限并捕获到流量后，再结合实际报文验证握手过程与接口选择。

## 总结

- 互联网四层模型（应用、传输、网络、链路）按职责隔离变化；实际软件实现不必机械对应四段独立代码，但每一层的头部边界必须清晰。
- 发送端自顶向下逐层封装、接收端逐层解封装，并通过链路层 EtherType、IP 协议号与传输层端口号完成解复用。
- 链路层 MAC 帧头逐跳重写，IP 与端口在常规直连中端到端保持；NAT 按配置改写包头中的地址或端口，而代理则在应用或传输边界终结并重建连接。
- Socket 是操作系统向应用暴露的编程接口而非网络协议；应用写入 Socket 成功只代表本地发送路径接受了相应字节。

下一篇[《计算机网络（二）：IP 寻址、子网划分与局域网通信》](/posts/networking/ip-addressing-subnet-lan-delivery/)将深入最底层与网络层的交界：当本机已经拿到目标 IP 后，如何获取自己的网络配置，又如何判断该直接把帧交给同一局域网里的另一台设备，还是交给默认网关？

## 延伸阅读

- [System Design：一个请求的旅程](https://designed-to-scale.vercel.app/#/request-lifecycle/1)——交互式图解，逐步串起 DNS、建连、请求、服务端查询与响应，适合从整体路径和耗时角度回顾一次页面加载
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/)——通过 C 语言 Socket 接口直观理解应用程序与内核网络边界的交互
- [Kurose & Ross: Wireshark Labs](https://gaia.cs.umass.edu/kurose_ross/wireshark.php)——配合《计算机网络：自顶向下方法》的配套抓包实验，适合对照观察各层协议字段

[^1]: 〔RFC〕[RFC 1122: Requirements for Internet Hosts — Communication Layers](https://www.rfc-editor.org/rfc/rfc1122.html)——定义互联网主机的应用层、传输层、网络层与链路层四层通信模型

[^2]: 〔RFC〕[RFC 9293: Transmission Control Protocol (TCP), §2.2 & §3.3](https://www.rfc-editor.org/info/rfc9293/)——区分应用字节流、TCP 报文段与承载它的 IP 数据报，并定义内核维护连接的传输控制块（TCB）与状态机

[^3]: 〔RFC〕[RFC 791: Internet Protocol](https://www.rfc-editor.org/info/rfc791/)——定义 IPv4 数据报格式、Protocol 协议号复用字段、TTL 与跨网络转发机制

[^4]: 〔RFC〕[IANA: IEEE 802 Numbers — Ether Types](https://www.iana.org/assignments/ieee-802-numbers/ieee-802-numbers.xhtml#ieee-802-numbers-1)——分别登记 IPv4、ARP 与 IPv6 的 EtherType；IPv4 在以太网上的封装另见 [RFC 894](https://www.rfc-editor.org/rfc/rfc894.html)

[^ethernet-frame]: 〔RFC 与设备文档〕[RFC 894](https://www.rfc-editor.org/rfc/rfc894.html)——IPv4 在以太网上的载荷大小和填充规则；[Cisco 的以太网帧格式](https://www.cisco.com/en/US/docs/internetworking/troubleshooting/guide/tr1904.pdf)说明帧字段、最小帧长和前导码，[802.1Q 帧格式](https://www.cisco.com/c/en/us/support/docs/lan-switching/8021q/17056-741-4.html)说明标签开销，[接口 MTU 文档](https://www.cisco.com/c/en/us/td/docs/iosxr/cisco8000/interfaces-and-hardware-component/configuration-guide/interfaces-and-hardware-component-config-cisco8000/mtu-overview/ethernet-mtu.html)给出巨型帧支持示例。

[^5]: 〔RFC〕[RFC 9846 §2、§4、§5](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)——TLS 1.3 握手与记录层边界；2026 年 7 月取代 RFC 8446。SNI 的扩展格式另见 [RFC 6066 §3](https://www.rfc-editor.org/rfc/rfc6066.html#section-3)，ECH 另见第六篇。

[^tls-record]: 〔RFC〕[RFC 8446 §5、§5.2](https://www.rfc-editor.org/rfc/rfc8446.html#section-5)——TLS 1.3 应用数据可跨记录拆分或在记录内合并；受保护记录的外层头部字段与密文长度定义。

[^reuse]: 〔RFC〕[RFC 9113 §9.1.1](https://www.rfc-editor.org/rfc/rfc9113.html#section-9.1.1)——HTTP/2 连接复用及不同来源共用连接时的权威性和证书要求；[RFC 9111 §4](https://www.rfc-editor.org/rfc/rfc9111.html#section-4)说明直接使用缓存响应与重新验证的条件。

[^6]: 〔教学资料〕[Beej's Guide to Network Programming: What is a socket?](https://beej.us/guide/bgnet/html/split/what-is-a-socket.html)——解释 Socket 作为操作系统文件描述符与网络编程接口的抽象定位

[^7]: 〔RFC〕[RFC 9110 §4.2: HTTP-Related URI Schemes](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2)——HTTP/HTTPS URI 方案与默认端口

[^ktls]: 〔平台与实现〕[Linux Kernel: Kernel TLS](https://docs.kernel.org/networking/tls.html)——用户态握手与内核记录层加解密的职责划分

[^ipv6]: 〔RFC〕[RFC 8200 §3、§4、§8.1](https://www.rfc-editor.org/rfc/rfc8200.html#section-3)——IPv6 基本头、扩展头、Hop Limit 与 ICMPv6 上层协议号

[^connect]: 〔RFC〕[RFC 9110 §9.3.6: CONNECT](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)——HTTP CONNECT 的目标 authority 与隧道建立语义

[^socks]: 〔RFC〕[RFC 1928 §3–§5](https://www.rfc-editor.org/rfc/rfc1928.html#section-3)——SOCKS5 协商、请求地址类型与代理回复

[^curl]: 〔工具文档〕[curl 官方手册](https://curl.se/docs/manpage.html)——`--disable`、`--ipv4`、`--noproxy`、`--resolve` 与 `--write-out`；禁用 curl 配置文件不影响系统路由

[^osi]: 〔标准〕[ISO/IEC 7498-1: Open Systems Interconnection — Basic Reference Model](https://standards.iso.org/ittf/PubliclyAvailableStandards/s020269_ISO_IEC_7498-1_1994(E).zip)——OSI 七层参考模型的标准定义，用于对照互联网四层模型中的会话层与表示层分工

[^napt]: 〔RFC〕[RFC 3022 §2.2、§4.1](https://www.rfc-editor.org/rfc/rfc3022.html#section-2.2)——NAPT 的全称、地址与端口映射，以及多台内网设备共用外部地址的机制。

[^napi]: 〔平台与实现〕[Linux 内核文档：NAPI](https://docs.kernel.org/networking/napi.html)——中断通知与轮询处理的关系；名称在 Linux 2.4 时称 New API，现已不再对应特定全称。

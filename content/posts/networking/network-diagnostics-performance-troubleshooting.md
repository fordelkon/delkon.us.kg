---
title: "计算机网络（八）：网络诊断、性能指标与分层排障"
description: "按 DNS、TCP 或 QUIC、TLS 与 HTTP 的实际阶段选取观测点，区分常用性能指标，解释 TCP 单流吞吐与 PMTUD 黑洞，并用 curl 计时和 Wireshark 回环实验对照证据。"
publishDate: "24 Nov 2026"
tags: ["networking"]
---

遇到“能连上却打不开网页”“测速很快但页面慢”时，先用[直连 HTTPS 的报文与封装对照](/posts/networking/layered-architecture-packet-journey/#按阶段对照报文与封装)定位症状所处的阶段。若流量由代理处理，再按[应用侧与出站的实际连接](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)选观测点。一次成功、一次超时或一个偏高的指标，都不足以独立确定根因。

本篇先按请求阶段选观测点，再按症状设计对照。接着用性能指标、TCP 窗口和路径 MTU 解释两种现象：单连接为什么跑不满，以及为什么小包能通过，大包却可能卡住。后面的实验先用 curl 计时，再用 Wireshark 把时间差与报文对应起来。

## 从症状到观测点

### 按请求阶段选择观测点

沿接口与选路、DNS、传输、服务身份与 HTTP 逐步收集证据。已有连接或缓存时，从实际发生的阶段开始。先区分基于 TCP 的 HTTP 与[在 UDP 上运行 QUIC 的 HTTP/3](/posts/networking/http-evolution-tls-handshake-https/#http3-怎样把-tls-放进-quic)，再选对应的握手证据[^tcp-handshake][^quic-setup]。

```mermaid title="按证据选择下一项网络诊断" description="判断只针对本次请求和实际地址族、端点、接口；否分支表示要补查的证据，不是根因。HTTP/3 的 TLS 身份验证属于 QUIC 握手，不是建连后再跑一次 TLS。若有代理，还须区分入站和出站；复用连接时不必看到新的握手。"
flowchart TB
 start["记录 URL、地址族、时间<br/>显式代理与 TUN 状态"] --> local{"本次接口与选路符合预期？"}
 local -->|否或不明| route["查地址、下一跳、邻居<br/>及策略路由"]
 local -->|是| dns{"需要解析时得到可用结果？"}
 dns -->|否或不明| resolver["对照系统与独立 DNS 查询<br/>核对缓存与实际解析路径"]
 dns -->|是或已知地址| transport{"本次尝试哪种传输？"}
 transport -->|TCP| tcp{"本段三次握手完成？"}
 tcp -->|否或不明| tcpTrace["对照 SYN、SYN-ACK、ACK<br/>查是否有 RST 或只见重试"]
 transport -->|QUIC| quic{"端点报告的 QUIC 握手结果？"}
 quic -->|其他失败或不明| quicTrace["查 Initial 与对应的 UDP 回包<br/>对照端点握手或失败日志"]
 tcp -->|是，HTTPS| tls{"目标 TLS 身份验证通过？"}
 tls -->|否或不明| secure["核对证书、服务名与握手<br/>检查代理出站"]
 quic -->|身份验证失败| secure
 tls -->|是| http{"收到预期 HTTP 响应？"}
 quic -->|握手与身份验证都成功| http
 tcp -->|是，明文 HTTP| http
 http -->|否| service["核对状态码、重定向、请求<br/>服务端及代理日志"]
 http -->|是但慢| performance["重复测量阶段耗时、吞吐<br/>再查重传、流控与应用供数"]
```

先把“打不开”改写成可验证的问题，例如“哪个端点在哪个接口上发了握手，哪里没有看到对应回应？” 如果 DNS 返回的是 [Fake-IP](/posts/networking/proxies-tunnels-transparent-interception/#fake-ip在-dns-阶段建立映射)，先核对应用是否实际连向这个地址，再用选路和代理日志关联到出站。应用侧握手成功不等于出站成功。

| 阶段 | 核心问题 | macOS / Linux 常见工具 | 解释结果时的边界 |
| --- | --- | --- | --- |
| 本地配置与邻居 | 接口地址、前缀与下一跳是否符合预期？ | `ifconfig` / `ip addr`，`arp -a`、`ndp -a` / `ip neigh` | 邻居表只记录本机已知的映射，见[ARP 与 NDP 邻居表实验](/posts/networking/ip-addressing-subnet-lan-delivery/#实验二观察-arp-与-ndp-邻居表) |
| 选路与接管 | 对实际目标地址，选中了哪个接口和下一跳？ | `route -n get <IP>` / `ip route get <IP>` | 按实际地址族[核对本机的路由与出口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果) |
| 名称解析 | 系统接口与独立 DNS 查询为何不同？ | `dscacheutil` / `resolvectl`，`dig` | 对照[默认 DNS、指定解析器与系统解析](/posts/networking/dns-resolution-caching-encrypted-queries/#实验一对照默认-dns指定解析器与系统解析)，再核对[查询接管范围](/posts/networking/dns-resolution-caching-encrypted-queries/#判读边界tun-与-dns-接管) |
| TCP | 本段建连失败，还是建连后读写停顿？ | `nc -zv -w 3 <IP> <Port>`、抓包、端点 TCP 状态 | 相关 RST 表示在观察点收到复位，要核实来源；只见 SYN 重试则不能区分去程、回程和对端未应答。已建连只说明本段传输可用[^tcp-handshake] |
| QUIC | 有本次尝试对应的 UDP 回包吗？端点的握手结果是什么？ | 抓包看 QUIC Initial 和回包；对照客户端或服务端日志 | 对应的 Initial 或 Retry 回包支持该次探测有往返；仅见回包不代表身份验证通过或已经协商 HTTP/3[^quic-setup] |
| TLS、HTTP 与代理 | 身份校验、状态码和出站选择分别是什么结果？ | `openssl s_client`（这里仅用于 TCP 上的 TLS）、`curl -v`、代理连接日志 | [SNI 与服务名校验不同](/posts/networking/http-evolution-tls-handshake-https/#证书链可信还要检查名字)；[目标 TLS 与代理传输不同](/posts/networking/proxies-tunnels-transparent-interception/#两段-tcp-与目标-tls) |

### 按症状设计下一次对照

选定观测点后，先写下当前证据支持什么，再问怎样区分剩下的解释。每次对照尽量只改变一个条件；下表的判断仅适用于本次有效样本。

| 症状 | 观测点与工具 | 能支持的判断 | 下一次对照 |
| --- | --- | --- | --- |
| 同一名字在两个程序结果不同 | 实际解析器、系统缓存、应用 DNS 设置，辅以 `dig` | 解析结果或路径不同 | 固定同一名称、类型和解析服务再做对照 |
| TCP 超时或立即失败 | 实际出口与接收端，用 `tcpdump` 或 Wireshark 看 SYN、回应及 RST | 两端对照可缩小握手停在哪一侧的范围 | 匹配同一条 TCP 连接的端点与时间；经过代理时分开核对两段 |
| HTTP/3 失败而 HTTP/2 成功 | 实际协商版本、QUIC Initial 与端点日志 | 仅说明样本中的 TCP 请求可用，不能据此判定 UDP 被阻断 | 在已知同时支持两种协议的同一服务上固定地址、端口和代理条件，分别比较协议结果 |
| 小传输成功，大传输停顿 | 两端捕获、ICMP 差错与实际 IP 包长 | 包长依赖只是 PMTU 线索 | 核对同一流在不同包长时的送达情况，以及反馈是否抵达发送端 |
| 建连与握手快，首字节或正文慢 | curl 时间戳、应用日志、RTT 与 TCP 窗口 | 延迟落在可定位的阶段 | 固定连接配置，只改变应用等待或传输大小 |

应用回退到 HTTP/2 后拿到 `200`，不等于 HTTP/3 成功。按第六篇的 [HTTP 协商观察](/posts/networking/http-evolution-tls-handshake-https/#实验二用-curl-观察-http-协商与响应)核对构建功能和实际版本。用支持 HTTP/3 的 curl 直接测试目标时，`--http3` 允许回退，`--http3-only` 不回退；curl 的 HTTP/3 不支持经显式代理发起。先排除工具能力限制，再用结果判断传输路径[^quic-setup][^curl-http3]。

## 性能指标与单连接吞吐

### 性能诊断的五个常用指标

这些指标描述不同方面，但会相互影响。例如路由器或网关瓶颈处队列过长引发的**缓冲膨胀**（Bufferbloat），既可能显著推高[RTT](/posts/networking/transport-tcp-udp-socket-quic/#tcp-的序号确认与重传)和时延抖动，也可能导致丢包和吞吐剧烈波动[^bufferbloat]。

| 指标 | 含义与单位 | 测量时需要说明什么 |
| --- | --- | --- |
| **带宽**（Bandwidth） | 某段链路或路径瓶颈的传输能力，通常用 bit/s | 接入套餐速率不等于端到端可用带宽，路径还受竞争流量影响 |
| **吞吐量**（Throughput） | 某层在单位时间内传输的数据量，通常用 bit/s 或 byte/s | 链路吞吐、TCP 载荷和应用有效数据率（goodput）含义不同；下载工具常显示后者 |
| **时延**（Latency）与 **RTT** | 单向时延是一个方向的送达时间；RTT 是一次往返耗时 | ping 的 ICMP RTT 不能直接当成 TCP、TLS 或应用请求时延，RTT 也未必等于单向时延的两倍 |
| **时延抖动**（Jitter） | 包时延随时间的变化 | 应说明采用的统计定义与分位数；平均 RTT 相同的路径，尾部延迟可以很不一样 |
| **丢包率**（Packet Loss） | 指定观测范围内未送达的数据包比例 | 区分业务包、ICMP 探测与本地捕获丢包；对吞吐的影响取决于算法、RTT 和丢失形态 |

例如测速工具可能以多条连接和较长传输时间测量吞吐；页面加载还受 DNS、握手、资源依赖、缓存和服务端处理影响。前者表现好，不能证明后者的每一阶段都快。实时通话则还受尾延迟、抖动、接收缓冲和解码期限约束。

### BDP 与单条 TCP 连接的吞吐边界

如果慢在正文传输，而且同一路径上的多连接测速明显快于单连接下载，可以先用窗口模型估算单流的吞吐上限。

**带宽时延积**（Bandwidth-Delay Product，BDP）是瓶颈带宽与 RTT 的乘积。带宽用 bit/s、RTT 用秒时，乘积是 bit；除以 8 才得到 byte。用同一路径的瓶颈带宽估计和没有明显排队时的基准 RTT，可以估算填满路径大致需要多少在途数据。BDP 是路径容量的估算，不是某条连接的窗口值[^throughput]。

第四篇区分了[流量控制与拥塞控制](/posts/networking/transport-tcp-udp-socket-quic/#tcp-的流量控制与拥塞控制)。在简化的稳定传输模型中，发送方的拥塞窗口 `cwnd` 与接收方通告的接收窗口 `rwnd` 共同限制未确认数据量。若将二者中的较小值记为 $W$（byte），路径瓶颈带宽记为 $B$（bit/s），RTT 取正在测量的同一连接的往返时延，则有估算上界[^tcp-windows]：

$$
\text{TCP 载荷吞吐率} \lesssim \min\left(B, \frac{8W}{\text{RTT}}\right)
$$

这是分析窗口约束的近似模型，忽略了头部开销、发送节奏和应用供数不足等因素，并非任意瞬间的测速预测。假设 RTT 为 150 ms，有效窗口约为 64 KiB，则窗口项约为：

$$
\frac{65,536 \times 8}{0.15} \approx 3.5\text{ Mbit/s}
$$

若同一路径的瓶颈带宽为 100 Mbit/s，基准 RTT 也是 150 ms，路径 BDP 约为 1.875 MB。这个量比 64 KiB 的连接窗口大得多；3.5 Mbit/s 是示例中的窗口上限，不是路径带宽。

验证时，按同一条 TCP 连接、同一发送方向及同一时间段取数：

- `rwnd` 看对端通告的 TCP 窗口，需结合握手中协商的缩放因子解释。未启用窗口缩放时，16 位字段最多表示 65,535 byte；上例用 64 KiB 作近似[^window]。
- `cwnd` 是发送端状态，不在 TCP 首部里。用发送端的 TCP 统计取数，和 `rwnd` 都换算成字节后，再与实际未确认在途量比较。套接字队列长度不能当作 `cwnd` 或在途量，见[第四篇的队列观测](/posts/networking/transport-tcp-udp-socket-quic/#实验一分清队列与累计统计)[^tcp-windows]。
- RTT 用该连接的传输统计或相应的报文时序，记录是空闲基线还是负载下的样本。ping 的 RTT 可用作对照，不能直接替代这条连接的 RTT；遇到[代理拆成两段 TCP](/posts/networking/proxies-tunnels-transparent-interception/#两段-tcp-与目标-tls)时更不能把两侧的数据混算。

在应用持续供数时，若未确认数据长期贴近较小的窗口，才有证据追查相应限制。若瓶颈是 `rwnd`，检查窗口缩放、接收缓冲和应用消费速度；更换拥塞控制算法不能越过对端通告。若在途数据远少于两个窗口，先检查应用供数或发送节奏，不要仅凭 BDP 就判定该增大窗口。

## MTU、MSS 与 PMTUD 黑洞

窗口约束限制的是在途数据总量，路径 MTU 限制的则是单个 IP 包的大小。若小包正常而较大传输反复停顿，应检查路径 MTU，同时保留内容过滤、应用错误或其他传输问题的可能性。

### 包长预算与 TCP 载荷

先区分两个量。

- [接口 MTU](/posts/networking/layered-architecture-packet-journey/#以太网帧的封装与结构)限制整个 IP 包的长度。以太网常见 MTU 为 1500 byte，[路径 MTU](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由器怎样报告差错)取各链路约束中的最小值。
- [MSS](/posts/networking/transport-tcp-udp-socket-quic/#初始-syn-的报文布局)只计 TCP 数据。以 MTU 1500、基本 IPv4/TCP 头各 20 byte 估算，得到 1460 byte；IPv6 基本头为 40 byte，对应 1440 byte。实际发送还要考虑选项、扩展头与路径限制[^mss]。

PPPoE 和 IP 隧道可能减少可用于内层 IP 包的空间。第三篇已经[区分 TUN、代理重建连接与 IP 隧道](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun代理与-ip-隧道的处理区别)：TUN 只是一种接口，不能从“启用了 TUN”推出每个原包都被完整加上外层头。若代理终结本地 TCP 后创建出站 TCP，两段连接各有自己的 MSS 与路径 MTU；若 VPN 承载完整内层包，才要进一步计算内外层封装开销。

先用两份具体包看“变小”的含义。假定 IPv4 与 TCP 都不带选项，路径允许的 IP 包长从 1500 降到 1400 字节；发送端获知这个限制后，对后续发送或重传重新分段：

| IPv4 包内的字段 | 路径 MTU 1500 | 路径 MTU 1400 |
| --- | ---: | ---: |
| IPv4 头 | 20 字节 | 20 字节 |
| TCP 头 | 20 字节 | 20 字节 |
| **TCP 数据** | **1460 字节** | **1360 字节** |
| IPv4 总长度 | 1500 字节 | 1400 字节 |

发送端在较小的包里少放 100 字节 TCP 数据，剩余字节可交给其他段。链路层头尾和填充在 IP 包之外。

这里 `20 + 20 + 1360 = 1400`，所以新的单包 TCP 数据预算为 1360 字节。若还有 TCP 时间戳选项、IPv6 扩展头或 VPN 外层封装，就要扣除相应的实际头部开销；不能把表中的 1360 当作所有连接都应设置的 MSS。

### IPv4 与 IPv6 的路径 MTU 反馈

IP 分片在 NAT、防火墙等环境中有脆弱性，协议设计常尽量控制包长[^fragmentation]。经典**路径 MTU 发现**（Path MTU Discovery，PMTUD）依赖第三篇介绍的 [ICMP 差错反馈](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由器怎样报告差错)，在两个地址族中使用不同报文：

| 场景 | 路由器遇到超大包时 | 发送端依据 |
| --- | --- | --- |
| IPv4，`DF=1` | 不分片，丢包并返回 ICMP Type 3 Code 4；按 RFC 1191 填入下一跳 MTU，旧路由器可能填零 | RFC 1191 的 IPv4 PMTUD[^pmtu4] |
| IPv6 | 路由器不为转发包分片，丢包并返回 ICMPv6 Packet Too Big | RFC 8201 的 IPv6 PMTUD[^pmtu6] |

### 反馈丢失与 PMTUD 黑洞

如果反馈在路径中被过滤，发送端可能反复发送过大的包，而小包仍能通过。黑洞能否自行恢复取决于发送端的探测或回退机制。

```mermaid title="PMTUD 黑洞：数据和反馈分别在哪里丢失" description="IPv4 小包先成功通过。路径上的瓶颈接口 MTU 为 1400 字节，路由器丢弃 1500 字节的 DF 包。返回的 ICMP 在过滤点终止。发送端未获知较小的 MTU，若没有有效回退，重传仍可能超限。箭头表示交换顺序，间距不表示耗时。"
sequenceDiagram
 participant S as 发送端
 participant F as 过滤点
 participant R as 瓶颈路由器
 participant D as 接收端
 S->>R: 小包，符合路径 MTU
 R->>D: 转发小包
 S->>R: 大包，1500 字节 · DF=1
 Note over R: 出口 MTU 1400<br/>丢弃大包
 R-->>F: ICMP Type 3 Code 4 · MTU=1400
 Note over F: 丢弃反馈
 Note over S: 未收到 MTU 反馈
 S->>R: 重传，仍为 1500 字节
 Note over R: 再次超限，丢弃
```

### 对照包长、反馈与重传

先确认受影响的是 TCP 还是 UDP/QUIC，记录实际出接口、接口 MTU 与封装。对自己管理的端点，可在许可的捕获位置对照同一流，先看哪种 IP 包长发出却没到，再看 ICMP 引用的原包是否就是该流、报告了什么 MTU。若反馈抵达发送端，还要观察后续包长是否随之调整。只有发送端的捕获时，没看到反馈不能证明路由器发过反馈并被过滤[^pmtu4][^pmtu6]。

做只读对照时，比较同一地址族、同一路径下不同的实际 IP 包长，不修改网络配置。应用正文变大不等于单个 IP 包变大；单独增大 ping 载荷也不能测得业务连接的 PMTU，因为协议待遇、DF 设置和头部预算可能不同。**MSS 钳制**（MSS Clamping）改变的是 TCP SYN 中通告的 MSS，不是路径 MTU，也不适用于 UDP/QUIC[^mss-clamp]。

**分组层路径 MTU 发现**（Packetization Layer Path MTU Discovery，PLPMTUD）不以收到 ICMP 为前提，而是用特定大小的探测包和可关联的送达确认来验证预算。一个探测得到确认，说明那个尺寸在该次探测中可通过；一次探测丢失不能区分包长超限和普通丢包。RFC 4821 描述 TCP 等协议的探测框架；RFC 8899 定义了**数据报分组层路径 MTU 发现**（Datagram Packetization Layer Path MTU Discovery，DPLPMTUD）。实现可以把有效的 ICMP 反馈作为进一步探测的线索，但应区分“路由器报告了尺寸”和“端点证实该尺寸能送达”[^plpmtu][^dplpmtu]。

## 用 curl 记录请求耗时

窗口和包长都是需要证据验证的假设。先用 curl 定位请求耗时集中在哪一段，再决定应该检查建连、握手，还是数据传输。

### 先限定本次计时模型

以下命令访问真实网络，需要在本机终端运行；后面的回环对照实验则不需要外网。每次启动新的 curl 进程，强制 IPv4 与 HTTP/1.1，请求一个 HTTPS URL，不跟随重定向、不复用上一次进程的连接，便于解释 TCP/TLS 阶段。`--noproxy '*'` 只排除 curl 显式代理；系统中的 TUN 和透明处理仍可能存在。

```bash frame="code"
curl -q -4 --noproxy '*' --http1.1 \
  --connect-timeout 5 --max-time 15 -sS -o /dev/null \
  -w 'remote=%{remote_ip} status=%{http_code} http=%{http_version}\ndns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} first=%{time_starttransfer} total=%{time_total}\n' \
  https://example.com/
```

同时检查命令退出状态和 HTTP 状态。curl 默认不会把 HTTP 4xx/5xx 都作为传输失败；未完成的阶段还可能显示零，不能照样相减后解释为“零耗时”。

这些计时值是从本次传输开始到相应里程碑的累计秒数，而不是从 shell 启动命令的时刻起计时。在上述单次成功连接模型中，可近似用相邻里程碑之差划分等待阶段[^curl]：

```mermaid mobile-direction="TB" title="curl 的累计计时点" description="适用于新建 TCP 连接、直连且无重定向的一次成功 HTTPS 传输。每个时间值都从同一起点计算。相邻时间相减得到下表的阶段耗时；图上的距离只表示顺序。请求至首字节包括请求发送、网络往返和服务端处理。"
flowchart LR
 start["传输开始<br/>计时起点 0"] -->|DNS| dns["解析完成<br/>time_namelookup"]
 dns -->|TCP 建连| tcp["连接完成<br/>time_connect"]
 tcp -->|TLS 握手| tls["TLS 完成<br/>time_appconnect"]
 tls -->|请求至首字节| first["客户端收到响应首字节<br/>time_starttransfer"]
 first -->|正文传输| total["传输完成<br/>time_total"]
```

| 计算 | 表示的阶段 | 仍可能包含什么 |
| --- | --- | --- |
| `time_namelookup` | 名称解析完成前 | 本地解析与缓存等路径，不只远端 DNS 往返 |
| `time_connect - time_namelookup` | 解析后到 TCP 建连完成 | 连接尝试、重传；显式代理下是到代理的 TCP 连接 |
| `time_appconnect - time_connect` | TCP 建连后到 TLS 握手完成 | 网络等待、证书处理；显式代理还可能包含 CONNECT 建隧道等待 |
| `time_starttransfer - time_appconnect` | TLS 完成后到首字节 | 请求发送、往返、排队、丢包恢复和应用处理 |
| `time_total - time_starttransfer` | 首字节后到传输结束 | 正文传输与停顿，不能单独区分限速、拥塞和接收方影响 |

明文 HTTP 的直连没有 TLS 阶段，不能把 `time_appconnect` 的零值当作握手完成的时间点。在同样是新建 TCP 连接且无重定向的条件下，改用 `time_starttransfer - time_connect` 估算建连完成后到首字节的等待；这个差值也不是纯服务端处理时间[^curl]。区分网络等待和服务端处理，还需日志、服务端指标或抓包。HTTP/3、连接复用、并行传输或 `-L` 跟随重定向时，不能直接套用这张表。

:::important[计时中的端点是谁]
普通网关做 IP 转发，不会因此成为 TCP 握手的终点；TUN 接口也不规定 TCP 在哪里终结。显式代理、用户态终结 TCP 的透明代理，以及承载完整 IP 包的 VPN，分别有不同连接关系。先核对第三篇的 [TUN、代理与 IP 隧道对照](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun代理与-ip-隧道的处理区别)和[代理入站与出站的连接端点](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)，再解释时间。
:::

### 阶段差值不等于根因

下面是一组启用 TUN/Fake-IP 时的计时输出，单位均为秒：

```text
remote=198.18.0.79 status=200 http=1.1
dns=0.023610 connect=0.026270 tls=0.256468 first=0.386691 total=0.386850
```

解析后的建连差值约 2.7 ms，TLS 阶段约 230 ms，之后到首字节约 130 ms。在 TUN/Fake-IP 环境中，如果代理终结了应用侧 TCP，这段较短的建连时间可能只反映到代理的连接，不能解释为跨公网到网站的 RTT。即使 `--noproxy '*'` 已排除显式代理，仍需要结合选路结果和代理日志解释路径。

### 控制变量实验：只改变服务端响应前的等待

公网测量同时受缓存、路径、负载等因素影响。先在回环接口做一个能够解释的对照：下面 Python 标准库服务仅监听 `127.0.0.1:18080`，两个路径返回相同正文，`/slow` 只在发送响应头之前多等 200 ms。此处选 Python 是为了把服务端完整放在一个终端里，不需要额外依赖；另一个终端运行 curl。程序需要本机 TCP 监听与两个终端，应在本机运行，不依赖外网，也不假定在线 Playground 能提供这些条件。

```bash frame="code"
python3 -u - <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import time

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path not in ("/fast", "/slow"):
            self.send_error(404)
            return
        if self.path == "/slow":
            time.sleep(0.2)
        body = b"hello\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

print("listening on http://127.0.0.1:18080", flush=True)
ThreadingHTTPServer(("127.0.0.1", 18080), Handler).serve_forever()
PY
```

在另一个终端交替运行两条命令数次，比较分布，避免把一次调度波动当成规律。每次均是新的 curl 进程，且排除回环地址上的显式代理：

```bash frame="code"
curl -q --noproxy '*' --http1.1 --max-time 3 -sS -o /dev/null \
  -w 'status=%{http_code} tcp=%{time_connect} first=%{time_starttransfer} total=%{time_total}\n' \
  http://127.0.0.1:18080/fast
curl -q --noproxy '*' --http1.1 --max-time 3 -sS -o /dev/null \
  -w 'status=%{http_code} tcp=%{time_connect} first=%{time_starttransfer} total=%{time_total}\n' \
  http://127.0.0.1:18080/slow
```

预期 `/slow` 的首字节时间比 `/fast` 多约 200 ms，TCP 建连时间接近；本实验使用明文 HTTP，不存在 TLS 阶段。结束时在服务端终端按 Ctrl+C。如果端口已被占用，可换一个空闲回环端口，并同步调整两条 URL。

这里能把差异归因于响应前等待，是因为我们控制了服务端代码和比较条件。把同一计时形态搬到公网，不会自动获得相同的因果结论。

:::tip[公网对照一次只改变一个条件]
先以相同 URL、HTTP 版本和地址族重复测量，再分别比较 IPv4/IPv6、系统解析与固定真实地址、显式代理与未指定显式代理。固定地址可用 `--resolve` 保留 URL 主机名、SNI 和证书校验；记录 `remote_ip` 和退出码，并核对 TUN 是否仍在接管。改变目标 IP 也可能改变 CDN 节点或网络路径，结论应停留在该组对照能支持的范围内。
:::

## Wireshark 实验：从一条连接验证阶段边界

curl 能测出 `/fast` 和 `/slow` 的时间差；抓包则能检查差异是否出现在 HTTP 请求与响应之间，而不是 TCP 握手时。这里沿用同一组回环请求，把计时与报文对齐。

### 实验条件与捕获步骤

需要本机 Wireshark、可用的捕获权限及前面的 Python 服务；不访问外网、不修改接口配置。记录 Wireshark 与 curl 版本。macOS 的回环接口为 `lo0`，Linux 为 `lo`；Windows 可使用 Npcap 提供的回环捕获接口，具体名字按接口列表确认[^capture]。

1. 启动前面的 Python HTTP 服务，在 Wireshark 选择回环接口，设置**捕获过滤器** `tcp port 18080` 后开始捕获。
2. 在另一终端交替执行前面的 `/fast` 与 `/slow` curl 命令，各运行三次。它们每次新建连接，便于分别观察握手和响应前等待。
3. 停止捕获，选择本次连接的一个包，读取其 `tcp.stream` 编号。通过 `Follow → TCP Stream` 查看重组后的明文 HTTP；不要把列表中一个包当作完整消息。
4. 以该编号设置显示过滤器，例如 `tcp.stream == 0`；`0` 必须替换为实际编号。在同一流内比较请求与响应时间，再与 curl 测得的首字节时间（Time to First Byte，TTFB）对照。

也可用下面的 macOS 命令保存原始捕获，再在 Wireshark 中打开；Linux 把 `lo0` 换成 `lo`。`sudo` 用于捕获权限，文件写入当前目录，结束时按 Ctrl+C：

```bash frame="code"
sudo tcpdump -i lo0 -nn -s 0 -w networking-lab.pcap 'tcp port 18080'
```

捕获过滤器决定哪些包进入文件；下表的**显示过滤器**只筛选已经捕获的包，两种语法不能互换[^wireshark-filter]。

### 显示过滤器与判断边界

| 观察目标 | Wireshark 显示过滤器 | 可以怎样解释 |
| --- | --- | --- |
| 本次回环 HTTP 实验 | `tcp.port == 18080` | 先确认端口及连接；其他进程也可能使用该端口 |
| 只看一条连接 | `tcp.stream == 0` | 将双向包归入同一捕获流；编号只对当前文件有效 |
| 初始 SYN | `tcp.flags.syn == 1 and tcp.flags.ack == 0` | 找到新建 TCP 的尝试，不等于握手已完成 |
| 正常结束或复位 | `tcp.flags.fin == 1 or tcp.flags.reset == 1` | 区分有序关闭与 RST，业务是否执行仍需应用证据 |
| 疑似重传 | `tcp.analysis.retransmission or tcp.analysis.fast_retransmission` | 是分析器根据所见序号推断，抓包缺失或乱序也会影响判断 |
| DNS 请求与响应 | `dns` | 仅在另行捕获 DNS 路径时有意义；本次数字回环地址实验预期不依赖 DNS |
| TLS ClientHello | `tls.handshake.type == 1` | 仅适用另行捕获 TLS 的连接；未启用 ECH 时可检查可见 SNI |
| IPv4 PMTU 反馈 | `icmp.type == 3 and icmp.code == 4` | 另行捕获时核对被引用原包及通告 MTU，不是本次回环实验必有事件 |
| IPv6 Packet Too Big | `icmpv6.type == 2` | 与 IPv6 连接和过大原包关联后再解释 |

这些字段以 Wireshark 官方显示过滤参考为依据[^wireshark-fields]。回环实验正常时应能重组 `GET /fast` 或 `GET /slow` 与相同正文；`/slow` 的响应前等待通常更长。TCP 包的数量、合并和 ACK 时机可以变化，不能要求每次恰好出现相同包序列。没有捕获到流量时先确认请求是否成功、接口与过滤器是否正确、捕获是否早于请求，再检查权限。

### HTTPS 与代理路径需要另一次捕获

观察公网 HTTPS 时，应使用第一篇的[实际目标选路与接口检查](/posts/networking/layered-architecture-packet-journey/#实验二先确定地址与接口再抓取协议头部)，不能继续在回环 `18080` 过滤器下寻找 TLS。普通 TLS 1.3 捕获没有会话密钥时，不能读取加密的 Certificate 或 HTTP 内容；ECH 还会保护内部 ClientHello。QUIC Initial 的保护本身不提供旁观者机密性，但 ECH 仍可独立保护其中的真实目标名，见[第六篇](/posts/networking/http-evolution-tls-handshake-https/#http3-怎样把-tls-放进-quic)。

若 TUN 代理终结本地 TCP，应分别捕获或记录应用侧与出站侧，两段连接的序号、ACK 和时间不能直接拼成同一条 TCP。若是真正承载完整 IP 包的隧道，则另按内外层观察。主机上的分段、聚合和校验和卸载还可能让捕获中的大段或校验和状态不同于物理线路，先核对捕获位置与卸载条件，不能直接认定线路发了坏包[^offload]。

对自己的测试连接，如果客户端 TLS 库或应用能导出会话密钥，可用它支持的密钥日志方式（例如部分客户端支持 `SSLKEYLOGFILE`），再在 Wireshark 的 TLS 协议首选项中指定同一份 key log 文件。捕获须覆盖对应连接和必要的握手数据。TLS 1.3 的临时密钥交换不能仅靠服务器证书私钥解密；密钥日志能解密相应会话，应与捕获文件一起控制访问，完成调试后移除[^tls-keylog]。

| 捕获位置 | 本位置通常说明什么 |
| --- | --- |
| 应用侧回环或本地代理入口 | 应用到本机服务或代理的连接，不能证明远端已经建连 |
| TUN 接口 | 被实际路由选中的内层 IP 流量，可能含 Fake-IP |
| 物理接口 | 此接口实际承载的直连、代理或隧道流量；区分外层 IP 的目的地址与链路层下一跳 |
| 代理出站侧 | 代理到目标或节点的连接；和应用侧对照时用时间、端点与代理日志关联，不能按两段 TCP 序号匹配 |

## 平台命令对照

要在另一台机器复查同一个判断，先固定诊断任务，不必照搬命令。例如，拿到应用实际连接的 IP 后，用表中「特定目标选路」一行检查它命中的接口与下一跳。各平台命令返回的字段以各自实现为准。Windows 一列使用 PowerShell；调用 curl 时写 `curl.exe`，避免旧版 PowerShell 将 `curl` 解释为其他命令。Unix 示例中的 `\` 续行和 `/dev/null` 也不能原样粘贴到 PowerShell，可把 curl 参数写在一行并以 `-o NUL` 丢弃正文。

| 目的 | macOS | Linux | Windows / PowerShell |
| --- | --- | --- | --- |
| 接口与地址 | `ifconfig` | `ip addr` | `ipconfig /all` |
| 路由表 | `netstat -rn` | `ip route`、`ip -6 route` | `route print`、`Get-NetRoute` |
| 特定目标选路 | `route -n get <IP>` | `ip route get <IP>` | `Find-NetRoute -RemoteIPAddress <IP>` |
| DNS 配置 | `scutil --dns` | `resolvectl status`，限 systemd-resolved 环境 | `Get-DnsClientServerAddress` |
| DNS 查询 | `dig example.com A` | `dig example.com A` | `Resolve-DnsName example.com -Type A` |
| 本地 DNS 缓存视图 | `dscacheutil` 查询名称服务，不是完整缓存转储 | 按实际缓存服务选择工具 | `ipconfig /displaydns` |
| TCP 连接 | `netstat -anv -p tcp` | `ss -tin` | `Get-NetTCPConnection` |
| 邻居表 | `arp -a`、`ndp -a` | `ip neigh` | `Get-NetNeighbor` |
| 抓包 | tcpdump / Wireshark | tcpdump / Wireshark | Wireshark 配合 Npcap |

`Get-DnsClientServerAddress` 显示接口配置的 DNS 服务器，`ipconfig /displaydns` 显示 Windows DNS 客户端解析缓存；两者都不能单独证明浏览器内置 DoH 或代理使用了哪条解析路径。各命令的权限和可用参数应按所用系统确认[^windows]。

## 总结：把排障结果写成可复查的判断

一个有用的结论包含三部分：观察到什么，这些证据排除了什么，还需要什么证据。例如：“连续三次 TCP 建连成功，但都在 TLS 完成前超时，故障不是发生在已观测到的这段 TCP 建连上。当前选路经过 TUN，尚不能确认代理是否连到远端，下一步查出站连接和握手日志。”附上测量时间、命令与工具版本、实际连接地址、代理方式、退出码和多次测量结果，便于在相同条件下复查。

回查证据时，可以先把它放回[第一篇的报文与封装对照](/posts/networking/layered-architecture-packet-journey/#按阶段对照报文与封装)。例如，看到网关 MAC，可以确定本地帧交给哪一跳。收到 SYN-ACK 时，则要确认它属于应用侧连接还是代理出站。各篇和实验的入口见[系列阅读路线](/series/networking/#阅读路线)。

## 延伸阅读

- [Everything curl: Write out](https://everything.curl.dev/usingcurl/verbose/writeout.html)——继续查阅 write-out 的版本差异与输出方式
- [Wireshark User's Guide](https://www.wireshark.org/docs/wsug_html_chunked/)——对照捕获位置、显示过滤和 TCP 分析字段；工具标记仍需结合协议上下文解释

[^tcp-handshake]: 〔RFC〕[RFC 9293 §3.5](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.5)与[§3.5.2](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.5.2)——TCP 三次握手和连接复位行为。

[^quic-setup]: 〔RFC〕[RFC 9000 §7](https://www.rfc-editor.org/rfc/rfc9000.html#section-7)与[§8.1.2](https://www.rfc-editor.org/rfc/rfc9000.html#section-8.1.2)说明 QUIC 建连与 Retry 地址验证；[RFC 9001 §4.1](https://www.rfc-editor.org/rfc/rfc9001.html#section-4.1)区分握手完成与确认；[RFC 9114 §3.1–§3.2](https://www.rfc-editor.org/rfc/rfc9114.html#section-3.1)定义 HTTP/3 协商与改用基于 TCP 的 HTTP 的情形。

[^curl-http3]: 〔工具文档〕[curl 官方手册：`--http3`](https://curl.se/docs/manpage.html#--http3)和[`--http3-only`](https://curl.se/docs/manpage.html#--http3-only)——允许回退与不尝试其他 HTTP 版本的区别。

[^bufferbloat]: 〔研究资料〕[ACM Queue: Bufferbloat: Dark Buffers in the Internet](https://queue.acm.org/detail.cfm?id=2071893)——瓶颈链路过大缓冲区导致排队延迟激增与抖动恶化的成因分析

[^throughput]: 〔RFC〕[RFC 6349 §3.2](https://www.rfc-editor.org/rfc/rfc6349.html#section-3.2)说明基准 RTT 和瓶颈带宽的估计；[§3.3.1](https://www.rfc-editor.org/rfc/rfc6349.html#section-3.3.1)给出 BDP 与 TCP 接收窗口限制吞吐的计算示例。

[^tcp-windows]: 〔RFC〕[RFC 5681 §2–§3.1](https://www.rfc-editor.org/rfc/rfc5681.html#section-2)——发送端拥塞窗口、接收端通告窗口和未确认在途量的定义，以及两个窗口如何共同约束发送。

[^window]: 〔RFC〕[RFC 7323 §2: TCP Window Scale Option](https://www.rfc-editor.org/rfc/rfc7323.html#section-2)——窗口字段的 16 位限制与建连时的窗口缩放协商

[^mss]: 〔RFC〕[RFC 9293 §3.7.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.7.1)及 [RFC 6691 §2](https://www.rfc-editor.org/rfc/rfc6691.html#section-2)——MSS 的含义、基本头部扣除与选项对实际发送长度的影响

[^mss-clamp]: 〔RFC〕[RFC 4459 §3.2](https://www.rfc-editor.org/rfc/rfc4459.html#section-3.2)——在隧道端点更改 TCP 通告 MSS 的作用及仅适用于 TCP 的限制。

[^fragmentation]: 〔RFC〕[RFC 8900: IP Fragmentation Considered Fragile](https://www.rfc-editor.org/rfc/rfc8900.html)——分片在中间设备等环境中的可靠性与运维问题

[^pmtu4]: 〔RFC〕[RFC 1191 §2–§4](https://www.rfc-editor.org/rfc/rfc1191.html#section-2)——IPv4 DF、ICMP Fragmentation Needed 与下一跳 MTU

[^pmtu6]: 〔RFC〕[RFC 8201 §3](https://www.rfc-editor.org/rfc/rfc8201.html#section-3)——IPv6 的 Packet Too Big 反馈与路径 MTU 更新

[^plpmtu]: 〔RFC〕[RFC 4821 §2](https://www.rfc-editor.org/rfc/rfc4821.html#section-2)概述分组层探测与 TCP 等协议的适用条件；[§7.6](https://www.rfc-editor.org/rfc/rfc4821.html#section-7.6)说明如何处理探测结果。

[^dplpmtu]: 〔RFC〕[RFC 8899 §1.2](https://www.rfc-editor.org/rfc/rfc8899.html#section-1.2)说明对 RFC 4821 数据报机制的更新；[§4.2](https://www.rfc-editor.org/rfc/rfc8899.html#section-4.2)定义探测送达的确认，[§4.6](https://www.rfc-editor.org/rfc/rfc8899.html#section-4.6)说明如何处理 ICMP 反馈，[§5.3.1](https://www.rfc-editor.org/rfc/rfc8899.html#section-5.3.1)描述探测超时与重试。

[^curl]: 〔工具文档〕[curl 官方手册：write-out](https://curl.se/docs/manpage.html#-w)及 [libcurl 时间指标](https://curl.se/libcurl/c/curl_easy_getinfo.html#TIMES)——累计计时、连接端点和重定向的解释边界；`time_appconnect` 的适用阶段见 [CURLINFO_APPCONNECT_TIME](https://curl.se/libcurl/c/CURLINFO_APPCONNECT_TIME.html)。

[^windows]: 〔平台文档〕Microsoft Learn：接口及缓存 [ipconfig](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig)，路由表 [route](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/route_ws2008)与 [Get-NetRoute](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-netroute)，特定目标选路 [Find-NetRoute](https://learn.microsoft.com/en-us/powershell/module/nettcpip/find-netroute)，接口 DNS 配置 [Get-DnsClientServerAddress](https://learn.microsoft.com/en-us/powershell/module/dnsclient/get-dnsclientserveraddress)，DNS 查询 [Resolve-DnsName](https://learn.microsoft.com/en-us/powershell/module/dnsclient/resolve-dnsname)，TCP 连接 [Get-NetTCPConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection)，邻居表 [Get-NetNeighbor](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-netneighbor)。

[^capture]: 〔工具文档〕[Wireshark User's Guide: Capturing Live Network Data](https://www.wireshark.org/docs/wsug_html_chunked/ChapterCapture.html)与[Npcap: Loopback Packet Capture](https://npcap.com/guide/npcap-users-guide.html#npcap-feature-loopback)——接口选择、捕获权限和 Windows 回环支持。

[^wireshark-filter]: 〔工具文档〕[Wireshark User's Guide: Filtering Packets While Viewing](https://www.wireshark.org/docs/wsug_html_chunked/ChWorkDisplayFilterSection.html)——显示过滤与捕获过滤的区别；[Follow Protocol Streams](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvFollowStreamSection.html)说明流重组视图。

[^wireshark-fields]: 〔工具文档〕Wireshark 官方字段参考：[TCP](https://www.wireshark.org/docs/dfref/t/tcp.html)、[TLS](https://www.wireshark.org/docs/dfref/t/tls.html)、[ICMP](https://www.wireshark.org/docs/dfref/i/icmp.html)与[ICMPv6](https://www.wireshark.org/docs/dfref/i/icmpv6.html)——本节显示过滤器的字段名称与版本范围；TCP 分析器的推断机制见[TCP Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvTCPAnalysis.html)。

[^offload]: 〔工具文档〕[Wireshark Wiki: CaptureSetup/Offloading](https://wiki.wireshark.org/CaptureSetup/Offloading)——校验和、分段与接收聚合卸载对主机抓包视图的影响。

[^tls-keylog]: 〔工具文档〕[Wireshark 官方 Wiki：TLS Decryption](https://wiki.wireshark.org/TLS#tls-decryption)——会话密钥日志、TLS 协议首选项和仅使用 RSA 私钥解密的局限。

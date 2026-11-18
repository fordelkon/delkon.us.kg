---
title: "计算机网络（八）：网络诊断、性能指标与分层排障"
description: "区分带宽、吞吐量、时延、抖动与丢包，用 BDP 和 TCP 窗口解释单流上限，分析 MTU 与 PMTUD 黑洞，并通过 curl 计时和控制变量实验定位请求阶段。"
publishDate: "24 Nov 2026"
tags: ["networking"]
---

前七篇从[封装与端点边界](/posts/networking/layered-architecture-packet-journey/)讲到[代理怎样接管连接](/posts/networking/proxies-tunnels-transparent-interception/)。遇到“能连上却打不开网页”“测速很快但页面慢”时，要先把症状对应到请求阶段，再用对照实验缩小范围。一次成功、一次超时或一个偏高的指标，都不足以独立确定根因。

本篇先解释性能指标及单流吞吐的约束，再分析“大传输失败”与路径 MTU 的关系，最后给出可重复的 curl 实验。排障记录应保留时间、命令版本、连接地址、代理方式、退出码与多次测量结果，让后续比较有共同条件。

## 从哪一步开始排查

排查网页访问，可以沿接口与选路、DNS、传输、TLS、HTTP 逐步收集证据。已有连接或缓存时，从实际发生的阶段开始；HTTP/3 的传输分支检查 QUIC。

```mermaid title="按证据选择下一项网络诊断" description="每个判断都针对本次请求和实际地址族，否分支是调查范围而不是根因结论。HTTP/3 使用 QUIC，不经过 TCP 建连；TUN 代理可能终结本地 TCP，所以传输成功仍需核对出站日志。已知状态可跳过相应步骤。"
flowchart TB
 start["记录 URL、地址族、时间<br/>显式代理与 TUN 状态"] --> local{"本次接口与选路符合预期？"}
 local -->|否或不明| route["查地址、下一跳、邻居<br/>及策略路由、TUN 排除项"]
 local -->|是| dns{"需要解析时得到可用结果？"}
 dns -->|否或不明| resolver["对照系统、独立 DNS 查询<br/>状态码、缓存与实际解析路径"]
 dns -->|是或已知地址| transport{"实际传输是否建立？"}
 transport -->|否或不明| connect["TCP：SYN、RST、超时<br/>QUIC：UDP 路径、Initial 与响应"]
 transport -->|是| tls{"目标 TLS 身份验证完成？"}
 tls -->|否或不明| secure["核对证书、服务名与握手<br/>并排查重传、MTU 与代理出站"]
 tls -->|是或明文 HTTP| http{"收到预期 HTTP 响应？"}
 http -->|否| service["核对状态码、重定向、请求<br/>服务端及代理日志"]
 http -->|是但慢| performance["重复测量阶段耗时、吞吐<br/>窗口、重传与应用供数"]
```

例如，DNS 返回 Fake-IP 时，后续连接需要本地映射；本地代理已经接受 TCP 连接时，还要查它是否连上远端。这些路径差异会直接影响后面的计时解释。

## 性能诊断的五个常用指标

这些指标描述不同方面，但会相互影响。例如路由器或网关瓶颈处队列过长引发的**缓冲膨胀**（Bufferbloat），既可能显著推高**往返时延**（Round-Trip Time，RTT）与**时延抖动**（Jitter），也可能导致丢包和吞吐剧烈波动[^bufferbloat]。

| 指标 | 含义与单位 | 测量时需要说明什么 |
| --- | --- | --- |
| **带宽**（Bandwidth） | 某段链路或路径瓶颈的传输能力，通常用 bit/s | 接入套餐速率不等于端到端可用带宽，路径还受竞争流量影响 |
| **吞吐量**（Throughput） | 某层在单位时间内传输的数据量，通常用 bit/s 或 byte/s | 链路吞吐、TCP 载荷和应用有效数据率（goodput）含义不同；下载工具常显示后者 |
| **时延**（Latency）与 **RTT** | 单向时延是一个方向的送达时间；RTT 是一次往返耗时 | ping 的 ICMP RTT 不能直接当成 TCP、TLS 或应用请求时延，RTT 也未必等于单向时延的两倍 |
| **时延抖动**（Jitter） | 包时延随时间的变化 | 应说明采用的统计定义与分位数；平均 RTT 相同的路径，尾部延迟可以很不一样 |
| **丢包率**（Packet Loss） | 指定观测范围内未送达的数据包比例 | 区分业务包、ICMP 探测与本地捕获丢包；对吞吐的影响取决于算法、RTT 和丢失形态 |

例如测速工具可能以多条连接和较长传输时间测量吞吐；页面加载还受 DNS、握手、资源依赖、缓存和服务端处理影响。前者表现好，不能证明后者的每一阶段都快。实时通话则还受尾延迟、抖动、接收缓冲和解码期限约束。

## BDP 与单条 TCP 连接的吞吐边界

**带宽时延积**（Bandwidth-Delay Product，BDP）是瓶颈带宽与 RTT 的乘积。带宽用 bit/s、RTT 用秒时，乘积是 bit；除以 8 才得到 byte。它可用于估算持续利用路径容量需要多少在途数据[^throughput]。

第四篇区分了[流量控制与拥塞控制](/posts/networking/transport-tcp-udp-socket-quic/#流量控制-vs-拥塞控制)。在简化的稳定传输模型中，未确认数据量受拥塞窗口 `cwnd` 和接收窗口 `rwnd` 共同约束。若将二者中的较小值记为 $W$（byte），路径瓶颈带宽记为 $B$（bit/s），则有估算上界：

$$
\text{TCP 载荷吞吐率} \lesssim \min\left(B, \frac{8W}{\text{RTT}}\right)
$$

这是分析窗口约束的近似模型，忽略了头部开销、发送节奏和应用供数不足等因素，并非任意瞬间的测速预测。假设 RTT 为 150 ms，有效窗口约为 64 KiB，则窗口项约为：

$$
\frac{65,536 \times 8}{0.15} \approx 3.5\text{ Mbit/s}
$$

未使用窗口缩放时，TCP 首部的 16 位窗口字段最多表示 65,535 byte，上式用 64 KiB 作近似；窗口缩放选项允许双方在建连时协商更大的接收窗口表示范围[^window]。

如果已确认瓶颈是 `rwnd`，就应检查窗口缩放、接收缓冲与应用消费速度。更换拥塞控制算法不能越过接收端通告的窗口限制；只有证据指向拥塞控制和路径反馈时，才进一步评估算法选择。并发连接可能提高总吞吐，也可能加剧竞争，不能代替查明单流约束。

## MTU、MSS 与 PMTUD 黑洞

“小包正常，较大传输停住”是优先排查路径 MTU 的一类症状，也可能来自内容过滤、应用错误或其他传输问题。先分清两个量：

- **最大传输单元**（Maximum Transmission Unit，MTU）是接口或链路能承载的最大 IP 包总长度，包含 IP 头，不包含外部以太网头。以太网常见 MTU 为 1500 byte，实际路径取各链路约束中的最小值。
- **最大报文段长度**（Maximum Segment Size，MSS）是 TCP 通告的最大 TCP 数据长度，不包含 IP 和 TCP 头。以 MTU 1500、基本 IPv4/TCP 头各 20 byte 估算，得到 1460 byte；IPv6 基本头为 40 byte，对应 1440 byte。实际发送还要考虑选项、扩展头与路径限制[^mss]。

PPPoE 和 IP 隧道可能减少可用于内层 IP 包的空间。第三篇已经[区分 TUN、代理重建连接与 IP 隧道](/posts/networking/routing-forwarding-nat-virtual-interfaces/)：TUN 只是一种接口，不能从“启用了 TUN”推出每个原包都被完整加上外层头。若代理终结本地 TCP 后创建出站 TCP，两段连接各有自己的 MSS 与路径 MTU；若 VPN 承载完整内层包，才要进一步计算内外层封装开销。

### IPv4 与 IPv6 的发现机制

IP 分片在 NAT、防火墙等环境中有脆弱性，协议设计常尽量控制包长[^fragmentation]。经典**路径 MTU 发现**（Path MTU Discovery，PMTUD）在两个地址族中使用不同反馈：

| 场景 | 路由器遇到超大包时 | 发送端依据 |
| --- | --- | --- |
| IPv4，包的 DF 位置位 | 不进行分片，丢包并返回 ICMP Type 3 Code 4，通常携带下一跳 MTU | RFC 1191 的 IPv4 PMTUD[^pmtu4] |
| IPv6 | 路由器不为转发包分片，丢包并返回 ICMPv6 Packet Too Big | RFC 8201 的 IPv6 PMTUD[^pmtu6] |

如果反馈在路径中被过滤，发送端可能持续发送过大的包并重传，而小包仍正常。这才构成经典 PMTUD 黑洞的机制；是否持续卡住还取决于实现有没有其他探测或回退。

```mermaid title="PMTUD 反馈被过滤时的黑洞与 TCP 对照" description="主流程限定 IPv4、DF=1、1500 字节 IP 包和可用内层 MTU 为 1400 的瓶颈，省略大部分握手与 ACK。ICMP 被过滤且发送端未有效回退时，超大包可持续重传；小包通过不证明大包能通过。IPv6 没有 DF 位，对应反馈是 ICMPv6 Packet Too Big。后半段是另一次 TCP 连接的独立对照，只画限制发送端发包方向的 SYN/ACK MSS 调整，必须依据已知路径和头部预算；不是 UDP/QUIC 的修复。箭头不按耗时绘制。"
sequenceDiagram
 participant Sender as 发送端
 participant Router as MTU 1400 瓶颈
 participant Filter as ICMP 过滤点
 participant Target as 接收端
 Sender->>Router: 小包握手
 Router->>Target: 小包符合 MTU，继续转发
 Target->>Sender: 握手应答，省略中间回程
 Sender->>Router: IPv4 包长 1500，DF=1
 Note over Router: 超过 MTU：丢弃，不能分片
 Router->>Filter: ICMP Type 3 Code 4<br/>报告下一跳 MTU 1400
 Note over Filter: 假设过滤，反馈没有到达发送端
 Sender->>Router: 未调整包长，继续重传
 Note over Sender,Router: 无有效回退时可能形成 PMTUD 黑洞
 Note over Router: IPv6 无 DF 位<br/>反馈改为 ICMPv6 Packet Too Big
 Note over Sender,Target: 独立 TCP 对照：已知路径预算，在建连时调整 MSS
 Target->>Router: SYN/ACK 中通告接收 MSS
 Router->>Sender: 按该方向预算降低通告 MSS
 Sender->>Router: 据对端通告发送较小 TCP 数据包
 Router->>Target: 符合路径 MTU，继续转发
```

### 怎样验证，而不是直接改一个 MSS 值

先确认受影响的是 TCP 还是 UDP/QUIC，并记录实际出接口、接口 MTU，以及是否存在完整 IP 封装。对自己管理的端点，可比较不同大小的传输，并在许可的捕获位置检查超大包、ICMP 错误和重传是否相关。单独增大 ping 载荷不等于测得业务连接的 PMTU：探测路径、协议待遇、DF 设置及 IP 头开销都需要核对。

若可控制隧道两端，可临时降低测试接口或连接的包长做对照，记录变化并恢复配置。**MSS 钳制**（MSS Clamping）通过调整 TCP SYN 中通告的 MSS 影响对端发包，应根据已知路径预算设置，并考虑方向；它不能作为 UDP/QUIC 的通用修复。

**分组层路径 MTU 发现**（Packetization Layer Path MTU Discovery，PLPMTUD）通过发送探测包、判断是否被确认来发现可用大小，减少对 ICMP 的依赖。TCP 等传输的框架见 RFC 4821，数据报传输的 DPLPMTUD 见 RFC 8899；是否启用仍需检查具体实现[^plpmtu][^dplpmtu]。

## 按请求阶段缩小范围

先把“打不开”改写成可以验证的问题：解析到了哪个地址？连接哪个端点超时？TLS 是否完成？首字节还是正文传输慢？下表可以往返使用，不要求每个问题都从第一行开始。

| 阶段 | 核心问题 | macOS / Linux 常见工具 | 解释结果时的边界 |
| --- | --- | --- | --- |
| 本地配置与邻居 | 接口地址、前缀与下一跳是否符合预期？ | `ifconfig` / `ip addr`，`arp -a`、`ndp -a` / `ip neigh` | 邻居表不是在线设备清单；见[第二篇](/posts/networking/ip-addressing-subnet-lan-delivery/) |
| 选路与接管 | 对实际目标地址，选中了哪个接口和下一跳？ | `route -n get <IP>` / `ip route get <IP>` | 只观察本机决策；更具体路由、策略和 IPv6 需分别检查，见[第三篇](/posts/networking/routing-forwarding-nat-virtual-interfaces/) |
| 名称解析 | 系统接口与独立 DNS 查询为何不同？ | `dscacheutil` / `resolvectl`，`dig` | `dig @服务器` 仍可能被接管；错误类型、Fake-IP 与真实公网地址应分开，见[第五篇](/posts/networking/dns-resolution-caching-encrypted-queries/) |
| 传输与队列 | 是连接拒绝、超时，还是读写迟迟不能推进？ | `nc -zv -w 3 <IP> <Port>`，`netstat -anv` / `ss -tnap` | `rxbytes`/`txbytes` 不能当作队列积压；`nc` 成功只证明所连端点接受连接，见[第四篇](/posts/networking/transport-tcp-udp-socket-quic/) |
| TLS、HTTP 与代理 | 身份校验、状态码和出站选择分别是什么结果？ | `openssl s_client`、`curl -v`、代理连接日志 | SNI 与主机名校验不同；目标 TLS 与代理传输不同，见[第六篇](/posts/networking/http-evolution-tls-handshake-https/)和[第七篇](/posts/networking/proxies-tunnels-transparent-interception/) |

把症状与观察位置配对，最好一次只改变一个条件。下表的“支持”仅适用于本次有效样本。

| 症状 | 观测点与工具 | 能支持的判断 | 下一次对照 |
| --- | --- | --- | --- |
| 同一名字在两个程序结果不同 | 实际解析器、系统缓存、应用 DNS 设置，辅以 `dig` | 解析结果或路径不同 | 固定同一名称、类型和解析服务再做对照 |
| TCP 超时或立即失败 | 实际出口与接收端，用 `tcpdump` 或 Wireshark 看 SYN、回应及 RST | 已返回 RST 时响应路径至少曾可用 | 确认 RST 来源；对照同一目标的地址族、端口和代理视角 |
| HTTP/3 失败而 HTTP/2 成功 | QUIC Initial、UDP 响应与端点日志 | 该样本中 TCP 路径可用，QUIC 仍待定位 | 在同一支持两种协议的服务上固定 HTTP 版本与地址 |
| 小传输成功，大传输停顿 | 两端捕获、ICMP 差错与包长 | 包长依赖只是 PMTU 线索 | 降低受控测试的包长，并检查反馈是否抵达发送端 |
| 建连与握手快，首字节或正文慢 | curl 时间戳、应用日志、RTT 与 TCP 窗口 | 延迟落在可定位的阶段 | 固定连接配置，只改变应用等待或传输大小 |

### 平台命令对照

下面是功能上的近似对应，不代表解析策略、字段或底层实现相同。Windows 一列使用 PowerShell；调用 curl 时写 `curl.exe`，避免旧版 PowerShell 将 `curl` 解释为其他命令。Unix 示例中的 `\` 续行和 `/dev/null` 也不能原样粘贴到 PowerShell，可把 curl 参数写在一行并以 `-o NUL` 丢弃正文。

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

Windows 的路由、DNS 与连接命令分别返回各自模块的状态，不代表浏览器内置 DoH 或代理连接路径；权限和可用参数应按所用系统确认[^windows]。前面各篇使用的 Rust、Go、Python 程序应保存成文件运行；回环验证不要求改系统路由。

## 用 curl 记录请求耗时

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

```mermaid mobile-direction="TB" title="curl 累积计时与相邻阶段差值" description="限定一次成功、全新、直连、无重定向的 HTTPS over TCP 传输。节点是从本次传输起点累计的时间戳，边对应相邻时间戳之差；首段 DNS 直接使用 time_namelookup。请求至首字节包含请求发送、网络往返和服务端处理，不是纯服务端耗时。图只表阶段先后，节点间距不是实测阶段长度；HTTP/3、复用和代理需另行解释。"
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

`time_starttransfer - time_appconnect` 包含请求传输与首个响应字节返回的等待，不能当作纯粹的服务端业务处理时间。首字节等待偏大，只能把关注范围缩到请求发送至首字节返回之间；区分网络等待和服务端处理，还需日志、服务端指标或抓包。使用 HTTP/3、连接复用、并行传输或 `-L` 跟随重定向时，应重新按对应语义解释，不能机械套用这张表。

:::important[计时中的端点是谁]
普通网关做 IP 转发，不会因此成为 TCP 握手的终点；TUN 接口也不规定 TCP 在哪里终结。显式代理、用户态终结 TCP 的透明代理，以及承载完整 IP 包的 VPN，分别有不同连接关系。先核对第三篇的接口模型和第七篇的接管实现，再解释时间。
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

### 实验条件与捕获步骤

目标是把前面的 `/fast`、`/slow` 回环对照与 TCP、HTTP 报文对齐。需要本机 Wireshark、可用的捕获权限及前面的 Python 服务；不访问外网、不修改接口配置。记录 Wireshark 与 curl 版本。macOS 的回环接口为 `lo0`，Linux 为 `lo`；Windows 可使用 Npcap 提供的回环捕获接口，具体名字按接口列表确认[^capture]。

1. 启动前面的 Python HTTP 服务，在 Wireshark 选择回环接口，设置**捕获过滤器** `tcp port 18080` 后开始捕获。
2. 在另一终端交替执行前面的 `/fast` 与 `/slow` curl 命令，各运行三次。它们每次新建连接，便于分别观察握手和响应前等待。
3. 停止捕获，选择本次连接的一个包，读取其 `tcp.stream` 编号。通过 `Follow → TCP Stream` 查看重组后的明文 HTTP；不要把列表中一个包当作完整消息。
4. 以该编号设置显示过滤器，例如 `tcp.stream == 0`；`0` 必须替换为实际编号。在同一流内比较请求与响应时间，再与 curl 的 TTFB 对照。

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
| 物理接口 | 发往实际下一跳的外层网络流量，可能是 UDP 隧道或代理连接 |
| 代理出站侧 | 核心到目标或节点的独立连接；有复用时需结合会话或连接日志关联 |

## 把排障结果写成可复查的判断

一个有用的结论包含三部分：已经观察到什么、它排除了什么、还需要什么证据。例如：“连续三次成功建连，但 TLS 完成前超时；当前选路经过 TUN，尚未取得远端节点握手日志。”它比“网不好”或“肯定是服务器慢”更便于下一步验证。

至此，本系列选取的客户端访问主线已经串联起来：从[协议分层与封装](/posts/networking/layered-architecture-packet-journey/)、[局域网交付](/posts/networking/ip-addressing-subnet-lan-delivery/)、[路由与虚拟接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/)到[传输层与 Socket](/posts/networking/transport-tcp-udp-socket-quic/)，再穿过[域名解析](/posts/networking/dns-resolution-caching-encrypted-queries/)、[HTTP 与 TLS 边界](/posts/networking/http-evolution-tls-handshake-https/)以及[代理与透明接管](/posts/networking/proxies-tunnels-transparent-interception/)。排障时沿这些边界回查，就能让每个推断都对应到具体连接、具体观察位置和下一项可证伪的实验。

## 延伸阅读

- [Everything curl: Write out](https://everything.curl.dev/usingcurl/verbose/writeout.html)——继续查阅 write-out 的版本差异与输出方式
- [Wireshark User's Guide](https://www.wireshark.org/docs/wsug_html_chunked/)——对照捕获位置、显示过滤和 TCP 分析字段；工具标记仍需结合协议上下文解释

[^bufferbloat]: 〔研究资料〕[ACM Queue: Bufferbloat: Dark Buffers in the Internet](https://queue.acm.org/detail.cfm?id=2071893)——瓶颈链路过大缓冲区导致排队延迟激增与抖动恶化的成因分析

[^throughput]: 〔RFC〕[RFC 6349 §3–§4](https://www.rfc-editor.org/rfc/rfc6349.html#section-3)——BDP、带宽、RTT、TCP 窗口与吞吐测试条件

[^window]: 〔RFC〕[RFC 7323 §2: TCP Window Scale Option](https://www.rfc-editor.org/rfc/rfc7323.html#section-2)——窗口字段的 16 位限制与建连时的窗口缩放协商

[^mss]: 〔RFC〕[RFC 9293 §3.7.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.7.1)及 [RFC 6691 §2](https://www.rfc-editor.org/rfc/rfc6691.html#section-2)——MSS 的含义、基本头部扣除与选项对实际发送长度的影响

[^fragmentation]: 〔RFC〕[RFC 8900: IP Fragmentation Considered Fragile](https://www.rfc-editor.org/rfc/rfc8900.html)——分片在中间设备等环境中的可靠性与运维问题

[^pmtu4]: 〔RFC〕[RFC 1191 §2–§4](https://www.rfc-editor.org/rfc/rfc1191.html#section-2)——IPv4 DF、ICMP Fragmentation Needed 与下一跳 MTU

[^pmtu6]: 〔RFC〕[RFC 8201 §3](https://www.rfc-editor.org/rfc/rfc8201.html#section-3)——IPv6 的 Packet Too Big 反馈与路径 MTU 更新

[^plpmtu]: 〔RFC〕[RFC 4821 §3–§4](https://www.rfc-editor.org/rfc/rfc4821.html#section-3)——分组层路径 MTU 探测与黑洞恢复框架

[^dplpmtu]: 〔RFC〕[RFC 8899 §4–§5](https://www.rfc-editor.org/rfc/rfc8899.html#section-4)——面向数据报传输的 DPLPMTUD 探测状态与确认机制

[^curl]: 〔工具文档〕[curl 官方手册：write-out](https://curl.se/docs/manpage.html#-w)及 [libcurl 时间指标](https://curl.se/libcurl/c/curl_easy_getinfo.html#TIMES)——里程碑计时、连接端点、重定向与连接复用的解释边界；本文命令以 curl 8.7.1 核对

[^windows]: 〔平台与实现〕Microsoft Learn：[Find-NetRoute](https://learn.microsoft.com/en-us/powershell/module/nettcpip/find-netroute)、[Get-NetTCPConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection)、[Resolve-DnsName](https://learn.microsoft.com/en-us/powershell/module/dnsclient/resolve-dnsname)与[ipconfig](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig)——Windows 选路、连接、DNS 查询及本地缓存视图。

[^capture]: 〔工具文档〕[Wireshark User's Guide: Capturing Live Network Data](https://www.wireshark.org/docs/wsug_html_chunked/ChapterCapture.html)与[Npcap: Loopback Packet Capture](https://npcap.com/guide/npcap-users-guide.html#npcap-feature-loopback)——接口选择、捕获权限和 Windows 回环支持。

[^wireshark-filter]: 〔工具文档〕[Wireshark User's Guide: Filtering Packets While Viewing](https://www.wireshark.org/docs/wsug_html_chunked/ChWorkDisplayFilterSection.html)——显示过滤与捕获过滤的区别；[Follow Protocol Streams](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvFollowStreamSection.html)说明流重组视图。

[^wireshark-fields]: 〔工具文档〕Wireshark 官方字段参考：[TCP](https://www.wireshark.org/docs/dfref/t/tcp.html)、[TLS](https://www.wireshark.org/docs/dfref/t/tls.html)、[ICMP](https://www.wireshark.org/docs/dfref/i/icmp.html)与[ICMPv6](https://www.wireshark.org/docs/dfref/i/icmpv6.html)——本节显示过滤器的字段名称与版本范围；TCP 分析器的推断机制见[TCP Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvTCPAnalysis.html)。

[^offload]: 〔工具文档〕[Wireshark Wiki: CaptureSetup/Offloading](https://wiki.wireshark.org/CaptureSetup/Offloading)——校验和、分段与接收聚合卸载对主机抓包视图的影响。

[^tls-keylog]: 〔工具文档〕[Wireshark 官方 Wiki：TLS Decryption](https://wiki.wireshark.org/TLS#tls-decryption)——会话密钥日志、TLS 协议首选项和仅使用 RSA 私钥解密的局限。

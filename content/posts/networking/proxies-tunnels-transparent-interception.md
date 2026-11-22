---
title: "计算机网络（七）：代理协议、透明接管与分流实现"
description: "以 Mihomo 为例区分显式代理、TUN 入站、运行模式、DNS 模式与出站协议，结合 Go CONNECT 示例和 curl 实验，解释域名关联、规则匹配及连接转发的边界。"
publishDate: "23 Nov 2026"
tags: ["networking", "go"]
---

前六篇沿客户端访问的主线介绍了寻址、路由、传输、DNS 与 Web 通信。代理把这些机制组合到新的连接路径中：应用先连接谁、域名由谁解析、代理选哪个出站，以及目标 TLS 在哪里终止，都取决于这条连接的实际路径。

本篇以 Mihomo 为配置参照，先说明代理的连接模型，再追踪 HTTP CONNECT、SOCKS5 和第三篇介绍的 [TUN 接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#虚拟网络接口tun-与-tap-如何接入协议栈)如何交付流量，以及代理如何识别目标、选择出站和交付响应。最后用 Go 标准库演示最小 CONNECT 代理，再用 `curl` 对照解析位置与连接路径。

## 代理的入站、出站与 TLS 终止

### 两段 TCP 与目标 TLS

以普通 TCP CONNECT 为例，客户端先与代理建立 TCP 连接，代理再与目标建立一条独立的 TCP 连接。两段连接各自维护序号、确认与关闭状态。代理终结 TCP 不等于终止目标 TLS；判断中间节点能否读出 HTTP，要看谁是 TLS 对端[^1][^tls-endpoints]。

| HTTPS 路径 | TLS 会话及端点 | 中间节点能看到什么 |
| --- | --- | --- |
| CONNECT 隧道，只转发字节 | 客户端 ↔ 源站，一条 TLS 会话跨过两段 TCP | 代理知道 CONNECT 指定的目标，转发目标 TLS 字节，但不因此看见加密的 HTTP 内容 |
| 有意终止 TLS，例如站点的反向代理，且回源也用 TLS | 客户端 ↔ 代理；代理 ↔ 源站，两条独立 TLS 会话 | 代理解密前一段，可在重新加密前读取 HTTP；客户端验证前一段服务身份，代理独立验证回源服务身份 |

即使客户端先用 TLS 连接显式代理，这层加密也只保护到代理，隧道内的目标 TLS 仍可端到端。证书校验与中间节点的可见范围，见第六篇的[服务名校验](/posts/networking/http-evolution-tls-handshake-https/#证书链可信还要检查名字)与[可见性矩阵](/posts/networking/http-evolution-tls-handshake-https/#端到端可见性边界谁能看到什么)。

### 入站、运行模式、DNS 与出站

以下字段对照 Mihomo v1.19.34 的配置类型与官方 Wiki（2026 年 11 月 18 日查阅）说明。排查本机时，用 `mihomo -v` 确认实际内核版本，再查看客户端最终生成的配置；GUI 对订阅的覆盖也会改变生效结果[^version]。

| 配置维度 | 决定什么 | 常见选项 |
| --- | --- | --- |
| 入站接入方式 | 流量怎样进入代理内核 | HTTP/SOCKS 监听端口、TUN |
| 运行模式 | 已进入内核的流量怎样选择出站 | `rule`、`global`、`direct` |
| DNS 模式与关联 | 返回真实还是映射地址，怎样保留域名关系 | `fake-ip`、`redir-host` 及过滤配置 |
| 出站协议 | 怎样连接远端、是否加密、保护哪段链路 | HTTP、SOCKS、Shadowsocks、Trojan 等 |

`global` 选择的是已进入内核的流量的出站策略，不会替未采用显式代理、也未被 TUN 接管的应用捕获流量。TUN 也可以把流量交给 DIRECT；接管方式与是否使用远端节点是不同选择[^mode][^4]。

## 流量怎样进入代理

### 显式代理：HTTP CONNECT 与 SOCKS5 的工作边界

**显式代理**（Explicit Proxy）要求客户端主动知晓并配置代理端点。程序采用代理设置后，先把 Socket 连接到代理监听地址，例如 `127.0.0.1:7890`，再告诉代理要连接的目标。不同程序是否读取系统设置、环境变量及哪些变量，取决于实现，不能把“设置了系统代理”当作每个进程都会采用代理的保证。

| 对比维度 | HTTP CONNECT | SOCKS5 |
| --- | --- | --- |
| 协商方式 | HTTP 方法，请求行为如 `CONNECT example.com:443 HTTP/1.1` | 二进制握手、认证方法协商与连接请求 |
| 目标地址 | authority 形式的主机与端口，可以传域名或 IP | IPv4、域名或 IPv6，类型分别为 `0x01`、`0x03`、`0x04` |
| 传输支持 | 此处讨论普通 CONNECT 的 TCP 字节流隧道 | `CONNECT` 用于 TCP，`UDP ASSOCIATE` 用于 UDP 中继 |
| 目标 DNS | 若传入域名，由代理处理；若传入 IP，代理不必再解析该目标名 | 客户端可以先解析并传 IP，也可以传域名交给代理处理 |

这两种协议的地址与协商格式分别见 RFC 9110 和 RFC 1928[^1][^2]。客户端把域名交给本地代理，也不等于域名一定在远端节点解析：本地代理的规则判断或出站协议仍可能要求先取得真实 IP。

使用 CONNECT 访问 HTTPS 时，客户端收到成功响应后才在隧道内发起目标 TLS 握手。[命令行实验](#实验一观察-http-connect)可以观察这两个阶段的先后顺序。

### 透明接管：TUN 提供 IP 包，域名需要额外关联

应用采用显式代理时会发出代理协议请求。透明接管则由系统把流量交给代理，交付的对象取决于入口。

| 入口 | 交给处理程序的对象 | 主要前提与限制 |
| --- | --- | --- |
| 系统代理 / 显式代理 | 应用发出的 HTTP 或 SOCKS 请求 | 应用须采用代理配置；不是系统路由强制接管 |
| TUN | 三层 IP 包 | 需要接口、路由和流处理；本身不提供域名 |
| TAP | 二层以太网帧 | 需要二层处理，可用于桥接；不是 Mihomo 的 TUN 选项 |
| REDIRECT | 经本地重定向后交给监听 Socket 的流量 | 常见 Linux TCP 方案会改写目的；恢复原目的信息需要平台接口 |
| TPROXY | 保留原目的地址的透明 Socket 流量 | Linux 需相应内核支持、策略路由及透明 Socket 配合，可用于 TCP/UDP |

表中 TUN/TAP 的包交付是接口层概念，第三篇的[平台接口对照](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun-与-tap用户态读写哪些数据)分别说明 Linux TUN/TAP 与 macOS `utun`、Network Extension 的交付方式。REDIRECT 和 TPROXY 是 Linux 的接管机制；下文的自动路由与 DNS 配置则是 Mihomo 自己的实现，平台支持应分别查阅对应文档[^transparent][^4]。

对不采用显式代理的应用，可以通过路由把匹配流量引向 TUN。Mihomo 的 `tun.enable` 与 `auto-route` 负责相应接口及自动路由配置，但实际范围仍受更具体路由、排除地址、策略路由与 IPv4/IPv6 配置影响。第三篇的[最长前缀匹配](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由表与最长前缀匹配)解释了为什么“已启用 TUN”不能直接证明所有连接都进入代理[^4]。

显式代理可以直接取得 CONNECT/SOCKS 请求中的域名；TUN 则向程序交付 IP 包。**IP 头本来就没有域名字段**，缺少额外关联时，代理只能从头部取得目标 IP，而不能反推出唯一域名。域名可能仍在 DNS、HTTP Host 或 TLS SNI 等应用层数据里，不能说它“离开进程时被 IP 层剥掉”。

代理内核需要把这些包转换为可处理的传输流或 UDP 会话。Mihomo 文档中，`system` 使用系统协议栈，`gvisor` 使用用户态协议栈，`mixed` 的 TCP 使用 system、UDP 使用 gvisor；文档还列有自研 `mips` 栈。因此 `system` 本身不是“混合栈”，可用选项和默认值应结合安装版本确认[^4]。

TUN 只是交付 IP 包的接口，并不规定后续必须把完整内层 IP 包封装成 VPN 隧道。代理可以终结传输流再建立出站连接；MTU 开销也应按实际出站封装计算，参见[第八篇的 MTU、MSS 与 PMTUD 排查](/posts/networking/network-diagnostics-performance-troubleshooting/#mtumss-与-pmtud-黑洞)。

## 接管后怎样补足目标域名

显式请求可能已经带有域名。目标只以 IP 地址交给代理时，域名规则还需要额外线索。代理可以在回答 DNS 查询时先建立地址映射，也可以在接到流量后从可识别的协议字段中取得域名。线索不足时，后续能用哪些规则取决于代理还掌握什么目标信息。

### Fake-IP：在 DNS 阶段建立映射

在匹配的 DNS 请求进入内部解析器后，**虚拟地址映射**（Fake-IP）可以先返回与域名关联的地址，而不必在这个响应阶段取得真实目标 IP。RFC 3089 描述的 SOCKS IPv6/IPv4 网关使用了类似的临时地址与域名映射，并未为 Fake-IP 分配地址段[^fakeip-rfc]。Mihomo 文档的 IPv4 地址池示例是 `fake-ip-range: 198.18.0.1/16`，其前缀位于 IANA 登记的 `198.18.0.0/15` 基准测试网段内。这个网段不是为 Fake-IP 分配的，也不是全球可达的地址空间[^3][^fakeip-benchmark]。

把 [DNS 回答与实际连接](/posts/networking/dns-resolution-caching-encrypted-queries/#dns-答案怎样影响连接目标)分开看。DNS 查询命中 Fake-IP 时，解析侧分配或复用虚拟地址并记录域名关联；**DNS 回答成功并不表示已经建立了目标连接。** 之后应用可能从缓存取到这个地址并发起连接。只有本次传输被路由到 TUN，且代理仍有对应映射时，下图的查表恢复才成立[^3][^4]。

```mermaid title="Fake-IP 的两次事件：DNS 建映射，连接查映射" description="DNS 和代理核心共享地址映射。缓存中的回答可以稍后用于连接。本图只展开命中域名规则且出站支持传域名的情形；箭头表示逻辑交付顺序，不按耗时绘制。"
sequenceDiagram
 participant App as 应用
 participant DNS as Mihomo DNS
 participant OS as 系统网络栈
 participant Core as 代理核心
 participant Node as 远端代理节点
 participant Target as 目标服务
 Note over App,DNS: DNS 事件：分配或复用虚拟地址
 App->>DNS: 查询 example.com 的 A 记录
 DNS->>DNS: 记录共享映射<br/>198.18.0.8 ↔ example.com
 DNS-->>App: A 记录：198.18.0.8
 Note over App,Core: 传输事件：路由交付后查映射
 App->>OS: 连接 198.18.0.8:443
 OS->>Core: 选中 TUN，交付 IP 包
 Core->>Core: 恢复 example.com<br/>域名规则选中远端节点
 Core->>Node: 通过出站会话提交 example.com:443
 Node->>Node: 解析真实目标地址
 Node->>Target: 建立目标连接
 Target-->>Node: 响应数据
 Node-->>Core: 按出站会话返回
 Core-->>OS: 按应用侧连接状态写回 IP 包
 OS-->>App: 交付响应字节
```

地址映射回答的是“这个虚拟 IP 对应哪个域名”；它既不记录最终出站，也不代替每条连接的转发状态。同一域名可以发起多条连接，每条流仍要按规则选出站。若规则或出站需要真实 IP，例如目标 IP 规则或 DIRECT，再按需取得真实地址[^3][^6]。

不启用 Fake-IP 时，TUN 也能接收被选路送入的 IP 包；应用拿到真实 IP 时，代理从包头得到的就是真实目标地址，不走虚拟地址查表。TUN 决定包如何交付，Fake-IP 决定匹配的 DNS 请求如何回答，二者不是同一个开关[^3][^4]。

#### 目标站点、代理节点与 DNS 服务的解析

这三类域名有各自的解析配置[^3]。

| 解析对象 | 相关配置职责 |
| --- | --- |
| 网站目标域名 | `nameserver-policy`、`nameserver`、`fallback`，DIRECT 可采用 `direct-nameserver` |
| 代理节点自身域名 | `proxy-server-nameserver`，未设置时按文档回退到其他解析配置 |
| DNS 服务自身域名 | `default-nameserver` 负责引导，避免解析器地址也依赖尚未建立的解析路径 |

`direct-nameserver` 未设置时也会有文档规定的回退路径，不能写成“DIRECT 只能使用这一项”。第五篇的[加密 DNS 与引导解析](/posts/networking/dns-resolution-caching-encrypted-queries/#dotdoh-与-doq-保护查询通道)说明了为什么加密 DNS 服务自身也需要先取得地址，以及加密保护哪一段查询链路。

#### DNS 接管的范围

`dns-hijack` 把匹配的 DNS 连接送进内部模块，不是所有名称解析的总开关：普通 `any:53` 写法默认匹配 UDP，TCP 需要相应配置；浏览器 DoH 等加密 DNS 也不能仅凭端口 53 的规则接管。macOS、Windows 的局域网 DNS 劫持还存在文档列出的限制[^4]。因此，`dig @某服务器` 只指定了请求的表面目的地址，不能单凭参数证明实际处理者。

会把解析结果上报给其他设备的应用，可能无法使用仅在本机代理内有意义的 Fake-IP。可按 `fake-ip-filter` 及其过滤模式让相关域名返回真实 IP，再按真实 IP 路径处理[^3]。

### 域名嗅探：读取可见的协议元数据

连接指向真实 IP 且缺少域名时，启用**域名嗅探**（domain sniffing）后，代理可以从部分协议数据取得目标名[^5]：

- 明文 HTTP 请求中的 `Host`。
- TLS ClientHello 中未被 ECH 隐藏的 SNI。
- QUIC Initial 中可解析的 ClientHello 信息。

这里的“首包”指读取连接开头的数据。TCP 分段、TLS 记录及 QUIC 数据可能需要重组才能得到完整字段。嗅探仅使用可见的协议元数据。在[第六篇的 ECH 场景](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello)下，外层公开名无法可靠地指向实际目标，已有的 DNS 映射仍可独立使用[^5]。

### 域名线索不足时如何处理

流量已经进入代理后，先区分目标是 Fake-IP 还是真实 IP。Fake-IP 失去映射时，虚拟地址本身无法指向目标服务。真实 IP 没有可用域名时，代理仍可用目标 IP、进程等已有信息匹配规则。`fake-ip-filter` 返回的真实地址也按这条路径处理[^3][^5]。

```mermaid title="目标域名关联的成功与失败分支" description="限定连接已进入代理。Fake-IP 必须有可用映射，不能作为普通公网地址连接；真实 IP 可以按配置尝试嗅探，但 ECH 或自定义协议可能不提供真实域名。图中的停止表示没有足够目标信息，具体报错和恢复由实现决定，不保证自动补回映射。"
flowchart TB
 inbound["入站已收到目标地址"] --> fake{"目标属于配置的 Fake-IP 池？"}
 fake -->|是| cache{"映射仍可用？"}
 cache -->|命中| domain["恢复域名<br/>进入规则与出站处理"]
 cache -->|未命中| repair["记录映射缺失<br/>检查 DNS 与持久化状态，重新解析"]
 fake -->|否，真实 IP| sniff{"允许且成功取得域名元数据？"}
 sniff -->|是| domain
 sniff -->|否| iponly["仅按已有 IP 与其他元数据处理<br/>或依配置拒绝"]
```

| 条件 | 缺少什么 | 下一步证据 |
| --- | --- | --- |
| 代理重启或映射被清理，应用仍缓存 Fake-IP | 虚拟地址到原域名的可用映射 | 对照 DNS 回答时间、映射持久化和连接日志 |
| 应用自行使用 DoH，绕过内部 DNS | DNS 阶段的 Fake-IP 关联 | 检查应用 DNS 设置与实际使用的目标地址 |
| 应用直接使用 IP 或自定义加密协议 | 原始域名或可识别元数据 | 核对代理收到的目标 IP 及命中的 IP 或进程规则 |
| TLS / QUIC 使用 ECH | 真实的内部 SNI | 核对代理是否另有可用的域名映射 |

持久化映射能减少部分重启导致的失配。若应用还在使用旧地址，需要对照它实际连入代理的地址和当前映射[^mapping-storage]。

## 分流规则与出站选择

代理先整理入站提供的目标地址、补足的域名以及可用的进程信息。在 `rule` 模式下，规则依次使用这些信息，选出直连、拒绝或节点出站。命中策略组时，还要由组内策略选定最终出站。

```mermaid title="规则匹配、出站选择与响应返回" description="规则按顺序检查，还需核对出站适用性；真实目标 IP 按规则和出站需要获取。REJECT 在此终止，策略组选择需落实到最终出站，非拒绝结果按实际选择建立直连或代理会话。响应通过对应的出站会话和入站转发状态返回原应用，不是把远端 TCP 包原样塞回原连接。"
flowchart TB
 app["应用"] --> explicit["显式入站<br/>HTTP / SOCKS5"]
 app --> transparent["透明入站<br/>TUN / REDIRECT / TPROXY"]
 explicit --> metadata["整理目标、域名映射<br/>嗅探与进程等元数据"]
 transparent --> metadata
 metadata --> rules["按规则顺序匹配<br/>检查出站适用性"]
 rules --> choice["确定最终出站<br/>DIRECT / REJECT / 节点"]
 choice -->|REJECT| reject["拒绝请求<br/>终止处理"]
 choice -->|DIRECT| direct["核心建立到目标的出站"]
 choice -->|代理节点| relay["核心连接节点<br/>节点另建到目标的连接"]
 direct --> response
 relay --> response["对应出站会话<br/>收到响应"]
 response --> inbound["入站转发状态"]
 inbound --> original["原应用"]
```

代理按书写顺序检查规则，每次命中后还要判断出站是否适用。例如，UDP 请求命中不支持 UDP 的节点时会继续检查后续规则[^6]。

当连接已有目标域名、尚无真实目标 IP 时，目标 IP 类规则可能触发 DNS 解析。给这条规则加 `no-resolve`，会阻止它发起解析。已有的 IP 仍可用于此次匹配，后续规则和出站阶段仍可按需查询 DNS[^6]。

`Proxy` 可以是用户给策略组起的名字。连接选中的节点时，代理使用该节点的出站协议和配置，例如 HTTP 出站可选用 TLS[^http-outbound]。判断实际保护范围时，要分别确认目标 TLS 的终止位置和代理传输所覆盖的链路。

## TUN 代理如何建立出站并交付回包

出站选定后，代理通过直连或节点会话发送数据，再按保存的入站状态把响应交回应用。以一个被 TUN 接管并由本地代理终结的 TCP 流为例，应用侧的 SYN、ACK 与 FIN 由本地连接状态处理，出站连接使用独立的序号空间。这两段 TCP 仍可搬运同一条端到端 TLS 字节流。

沿用前面的 Fake-IP `198.18.0.8 ↔ example.com`，设本机应用端点为 `192.168.1.10:50001`。本次规则选择 DIRECT，核心另行解析得到文档示例目标 `198.51.100.20:443`，并从物理接口 `192.168.1.10:53000` 建立独立出站。两段 TCP 均已建立。以下观察本机上游 NAT 之前的包，示例序号均为绝对值。

按 `① → ② → ③ → ④` 读取四个抓包位置。IPv4 地址和 TCP 端口合写在端点列中。

| 字段 | ① TUN 入站 | ② 物理出站 |
| --- | --- | --- |
| 源端点 | `192.168.1.10:50001` | `192.168.1.10:53000` |
| 目的端点 | `198.18.0.8:443` | `198.51.100.20:443` |
| `Seq` | 1001 | 9001 |
| `Ack` | 7001 | 3001 |
| TCP 载荷 | 100 字节 | 100 字节 |

| 字段 | ③ 物理接口收到响应 | ④ 写回 TUN |
| --- | --- | --- |
| 源端点 | `198.51.100.20:443` | `198.18.0.8:443` |
| 目的端点 | `192.168.1.10:53000` | `192.168.1.10:50001` |
| `Seq` | 3001 | 7001 |
| `Ack` | 9101 | 1101 |
| TCP 载荷 | 80 字节 | 80 字节 |

本例两侧各取一段请求与响应数据。实际分段、读写和确认时机可以各自变化。

应用侧收到的包仍以 Fake-IP 为源，才能匹配它原来的连接；核心自己的出站则使用真实目标与另一源端口。出站的 `Seq=9001` 不会原样成为应用侧的 `Seq=1001`，远端的 `Seq=3001` 也不能直接填进应用侧回包。核心在两份连接状态之间转交的是字节，各侧的确认、重传与流量控制分别进行。

这与[第三篇的 NAPT 包头改写](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip)不同：普通 NAPT 没有新建这两套 TCP 序号空间；也与[完整内层 IP 包的 VPN 封装](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun代理与-ip-隧道的处理区别)不同，表中的物理出站包不包含原来那份 Fake-IP 包。

:::important[代理的出站流量需要可用的绕行路径]
如果出站 Socket 产生的流量又被送回同一个 TUN 入口，可能形成回环。常见处理包括为远端端点配置更具体路由、使用 socket 标记配合策略路由，或按平台能力绑定接口、排除进程。它们的效果取决于平台和整套规则；“绑定物理网卡”不能脱离实际查表结果被当作统一的绕过保证。
:::

### 按地址族验证接管与出站

应用可能从系统 DNS 或自带 DoH 得到真实 AAAA，也可能从代理 DNS 得到配置支持的虚拟地址。要从应用实际尝试的目标地址查路由，因为双栈竞速可能改变最后使用的地址族。即便 IPv4 已进入 TUN，IPv6 仍需要自己的接管路由。进入代理后，核心再按出站策略单独选择地址族[^3][^4]。

```mermaid title="AAAA、IPv6 入站与出站的边界" description="限定应用尝试连接 IPv6 地址；本次选路决定是否进入 TUN。虚线是决策与关联，实线是包或连接数据的交付。代理处理入站后另选真实目标及出站地址族，代理节点本身的解析和选路另计。"
flowchart TB
 dns["应用取得 AAAA"] -.->|实际尝试该地址| route{"IPv6 实际选路"}
 route -->|TUN| tun["内核交付 IPv6 包"]
 route -->|物理接口| native["按系统路由出站"]
 route -.->|无有效路由| stop["本次尝试失败"]
 tun -.->|虚拟地址查映射；真实地址用已有线索| core["核心识别目标并匹配规则"]
 core -->|建立独立出站| out["按可达性与策略使用 IPv4 或 IPv6"]
```

排查意外绕行时，先核对 A、AAAA 回答，再对同一域名分别运行 `curl -4` 和 `curl -6`，记录 `remote_ip`。用[路由查询](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果)和[捕获位置对照](/posts/networking/network-diagnostics-performance-troubleshooting/#https-与代理路径需要另一次捕获)核实出接口，并用代理日志确认对应的入站与出站。经显式代理时，`remote_ip` 记录 curl 连到的代理地址。若目标域名也交给代理处理，另一段连接使用的地址族要在出站侧另行核实[^curl]。

## 实验：用 Go 实现最小 HTTP CONNECT 代理

### Go 示例：保留预读数据与两个方向的结束状态

下面的教学代理只监听回环地址，目标也只接受 `127.0.0.1:<port>`。程序校验请求行里的原始 CONNECT 目标，不用 `Host` 字段补齐，也不使用解析后的 URL 重建拨号地址。`net.SplitHostPort` 只拆分主机与端口，程序还检查主机的确切写法和端口范围（十进制 `1` 到 `65535`）。不符合本实验限制的目标返回 `400`。限制到 IPv4 回环是本实验的约束；CONNECT 协议本身也可以指定其他主机，但没有默认端口[^1][^go-net]。错误响应的状态行和字段以空行与后续内容分隔[^http-wire]。

隧道建立后，客户端到目标方向继续从原来的 `bufio.Reader` 读取，因为 HTTP 解析器可能已预读了后续字节；跳回原始连接会漏掉仍在缓冲区里的数据[^go-http]。某个方向正常读到 EOF 后，代理对另一连接执行 `CloseWrite`，继续等待反向复制。首次转发出错时记录错误并关闭两端，解除另一个方向可能阻塞的复制；随后只略过这次清理预期产生的 `net.ErrClosed`，其他错误仍记录。等待反向复制是为了演示第四篇的[半关闭契约](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)。完整的 HTTP CONNECT 实现还须遵循规范里的隧道关闭要求[^1][^go-net]。

头部读取与建连各有 5 秒期限。错误响应另有一秒写入期限，以便建连超时后仍能尝试返回 502。转发阶段采用 30 秒的绝对期限，期间的读写活动不会自动延长 `SetDeadline` 设置的时间[^go-net][^go-http]。

```go
package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"
)

func writeError(client *net.TCPConn, code int) {
	if err := client.SetWriteDeadline(time.Now().Add(time.Second)); err != nil {
		return
	}
	_, _ = fmt.Fprintf(client, "HTTP/1.1 %d %s\r\n"+
		"Content-Length: 0\r\n"+
		"Connection: close\r\n\r\n", code, http.StatusText(code))
}

func handleClient(client *net.TCPConn) {
	defer client.Close()
	if err := client.SetDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return
	}
	reader := bufio.NewReader(client)
	req, err := http.ReadRequest(reader)
	if err != nil {
		if !errors.Is(err, io.EOF) {
			writeError(client, http.StatusBadRequest)
		}
		return
	}
	if req.Method != http.MethodConnect {
		writeError(client, http.StatusMethodNotAllowed)
		return
	}
	host, port, err := net.SplitHostPort(req.RequestURI)
	portNumber, portErr := strconv.ParseUint(port, 10, 16)
	address := net.JoinHostPort("127.0.0.1", port)
	if err != nil || host != "127.0.0.1" || req.RequestURI != address ||
		portErr != nil || portNumber == 0 {
		writeError(client, http.StatusBadRequest)
		return
	}

	conn, err := net.DialTimeout("tcp4", address, 5*time.Second)
	if err != nil {
		writeError(client, http.StatusBadGateway)
		return
	}
	target := conn.(*net.TCPConn)
	defer target.Close()

	deadline := time.Now().Add(30 * time.Second)
	if err := client.SetDeadline(deadline); err != nil {
		return
	}
	if err := target.SetDeadline(deadline); err != nil {
		return
	}
	if _, err := io.WriteString(client, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		return
	}

	done := make(chan error, 2)
	copyTo := func(dst *net.TCPConn, src io.Reader) {
		_, err := io.Copy(dst, src)
		if err == nil {
			err = dst.CloseWrite()
		}
		done <- err
	}
	go copyTo(target, reader)
	go copyTo(client, target)

	aborted := false
	for range 2 {
		err := <-done
		if err == nil || (aborted && errors.Is(err, net.ErrClosed)) {
			continue
		}
		log.Printf("relay ended: %v", err)
		if !aborted {
			aborted = true
			_ = client.Close()
			_ = target.Close()
		}
	}
}

func main() {
	listener, err := net.ListenTCP("tcp", &net.TCPAddr{
		IP: net.ParseIP("127.0.0.1"), Port: 17890,
	})
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	fmt.Println("CONNECT proxy listening on 127.0.0.1:17890")
	for {
		conn, err := listener.AcceptTCP()
		if err != nil {
			log.Print(err)
			return
		}
		go handleClient(conn)
	}
}
```

:::warning[教学代理的使用范围]
只在受信任的本机环境运行。能访问监听端口的进程无需认证，就能通过它连接其他 IPv4 回环端口；回环监听不等于只有当前用户能访问。程序也未实现头部大小限制、并发配额或完整关停。不要对外监听，实验结束后停止代理。
:::

### 回环验证：预读载荷与半关闭

将上面的程序保存为 `connect_proxy.go`，在该文件所在目录打开终端，用 Go 1.22 或更新版本运行 `go run connect_proxy.go`。

保持代理运行。在另一终端把下面的程序保存为 `connect_local_check.py`，用 Python 3.8 或更新版本运行 `python3 connect_local_check.py`。程序先检查无效目标是否返回 `400`，再用标准库的一次性目标服务验证转发与半关闭。有效 CONNECT 直接使用目标服务在 `127.0.0.1` 上动态分配的端口，整个实验只走回环，无需 DNS 和外网。

```python
import socket
from concurrent.futures import ThreadPoolExecutor

PAYLOAD = b"first-frame|second-frame"
RESPONSE = b"response after EOF"


def check_bad_connects(host, port):
    authority = f"{host}:{port}"
    bad_targets = (
        f":{port}",
        host,
        f"{host}:",
        f"{host}:https",
        f"{host}:+{port}",
        f"{host}:0",
        f"{host}:65536",
        "/",
        f"{authority}/",
        f"{authority}?",
        f"user@{authority}",
        f"example.com:{port}",
        f"[::1]:{port}",
    )
    for target in bad_targets:
        request = f"CONNECT {target} HTTP/1.1\r\nHost: {authority}\r\n\r\n"
        with socket.create_connection(("127.0.0.1", 17890), timeout=5) as client:
            client.sendall(request.encode("ascii"))
            with client.makefile("rb") as reader:
                status = reader.readline().split(maxsplit=2)
            assert status[:2] == [b"HTTP/1.1", b"400"], (target, status)
    print(f"{len(bad_targets)} rejected CONNECT targets returned 400")


def serve_once(listener):
    conn, _ = listener.accept()
    with conn:
        conn.settimeout(5)
        received = bytearray()
        while chunk := conn.recv(4096):
            received.extend(chunk)
        assert received == PAYLOAD, received
        conn.sendall(RESPONSE)
        conn.shutdown(socket.SHUT_WR)
        return len(received)


def main():
    with socket.socket() as listener:
        listener.settimeout(5)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        host, port = listener.getsockname()
        check_bad_connects(host, port)
        with ThreadPoolExecutor(max_workers=1) as pool:
            target = pool.submit(serve_once, listener)
            with socket.create_connection(("127.0.0.1", 17890), timeout=5) as client:
                header = (
                    f"CONNECT {host}:{port} HTTP/1.1\r\n"
                    f"Host: {host}:{port}\r\n\r\n"
                ).encode("ascii")
                client.sendall(header + PAYLOAD)
                client.shutdown(socket.SHUT_WR)
                with client.makefile("rb") as reader:
                    status = reader.readline()
                    assert status == b"HTTP/1.1 200 Connection Established\r\n", status
                    assert reader.readline() == b"\r\n"
                    response = reader.read()
                assert response == RESPONSE, response
            print(f"target received {target.result(timeout=5)} bytes, then EOF")
            print(f"client received: {response.decode('ascii')}")


if __name__ == "__main__":
    main()
```

预期输出为：

```text
13 rejected CONNECT targets returned 400
target received 24 bytes, then EOF
client received: response after EOF
```

无效请求仍带有合法的 `Host` 字段，以确认它不能替代请求行里的目标。正常请求用一次 `sendall` 写入 CONNECT 头与首段载荷，随后关闭写方向。验证检查目标能否收到完整载荷，以及目标读到 EOF 后客户端能否继续收到响应。头部解析是否在本次运行中预读了载荷取决于实际读取时机，两段连接的 TCP 分段也各自决定。验证结束后，在代理终端按 Ctrl+C 停止监听。

在回环实验中，目标看到的对端是代理的出站 Socket。对照[第三篇的 NAT 映射](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip)，也可以从连接状态判断地址改写和代理重建连接各自发生在哪里。

## 命令行验证：先确认入站，再对照解析位置

前面的回环验证只检查本机字节流转发。下面的 curl 命令还会经代理访问真实网络，需在本机终端与已有代理环境中另行验证；前面的成功输出不能代替实际的分流与 DNS 检查。

### 实验一：观察 HTTP CONNECT

使用已配置、允许访问该目标的本机 HTTP 代理，把 `7890` 换成实际监听端口。不要使用前面的教学代理：它只接受 IPv4 回环目标，会对这里的 `CONNECT example.com:443` 返回 `400`，不会接着进行目标 TLS 握手。

```bash frame="code"
curl --noproxy '' --proxy http://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 \
  -v --http1.1 https://example.com/ -o /dev/null
```

`--noproxy ''` 避免环境中的绕过列表使本次实验跳过指定代理。日志先显示连接本地代理，再发送 `CONNECT example.com:443`，收到成功响应后才开始目标 TLS 握手。对照代理日志中的入站与出站，区分失败发生在代理 TCP、CONNECT 协商、目标 TLS 还是 HTTP 响应；只看到代理端口连接成功并不能证明整条访问成功[^curl]。

### 实验二：SOCKS5 的本地解析与代理解析

对自己已配置的 SOCKS5 代理，可分别运行以下两条命令；示例端口 `7890` 必须替换成实际端口：

```bash frame="code"
curl --noproxy '' --proxy socks5://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 -v https://example.com/ -o /dev/null
curl --noproxy '' --proxy socks5h://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 -v https://example.com/ -o /dev/null
```

在 curl 中，`socks5://` 先由客户端解析目标并向 SOCKS 代理传 IP；`socks5h://` 传域名让 SOCKS 代理处理。这里的“代理解析”仍不保证最终使用哪台上游 DNS；规则、Fake-IP 映射与节点协议可能继续影响路径[^curl]。

对照日志时，HTTP 代理应先出现 `CONNECT example.com:443` 与成功的隧道响应；SOCKS 本地解析会显示 IP 和 `locally resolved`，代理解析则显示域名和 `remotely resolved`。启用 Fake-IP 时，前者传入的可能是映射地址。这些日志可以区分 curl 向代理传 IP 还是域名；后续采用哪台真实 DNS、选择哪个远端节点，仍需查看代理日志。

:::tip[把三份证据对齐]
保留 curl 日志中的目标表示方式、代理日志中的域名/IP 元数据与所选出站，再对照 DNS 查询日志。若运行了 TUN，`--noproxy '*'` 仅绕过 curl 的显式代理选择，并不能撤销系统路由；比较实验时必须记录这一条件。
:::

## 总结

- 显式代理由客户端传递目标，TUN 借助接口与路由接收 IP 流量；两者提供的元数据不同。
- 入站方式、运行模式、DNS 模式与出站协议回答四个不同的问题，不能用一个“全局”开关代替。
- Fake-IP 延后的是特定阶段的真实目标解析，嗅探依赖可见协议字段；它们都不能保证每条流量都有域名。
- 规则顺序、`no-resolve`、出站能力与防回环需要一起检查，返回方向也有需要维护的会话状态。

最后一篇[《计算机网络（八）：网络诊断、性能指标与分层排障》](/posts/networking/network-diagnostics-performance-troubleshooting/)会把这些阶段转为对照实验：先确认请求实际经过哪些环节，再判断哪份证据能排除哪种解释。

## 延伸阅读

- [Mihomo 官方文档](https://wiki.metacubex.one/)——按安装版本对照完整配置，而不是把单段示意当成可直接部署的配置文件
- [Go `io.Copy`](https://pkg.go.dev/io#Copy)——复制直到 EOF 或错误的返回契约

[^1]: 〔RFC〕[RFC 9110 §3.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-3.7)区分代理、网关与隧道；[§9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)定义 CONNECT 目标、成功响应后的隧道语义与连接关闭要求。

[^tls-endpoints]: 〔RFC〕[RFC 9846 §2](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)与[§5.2](https://www.rfc-editor.org/rfc/rfc9846.html#section-5.2)——TLS 对端建立密钥并保护应用数据；中间转发 TCP 字节不会使中间节点成为 TLS 对端。

[^2]: 〔RFC〕[RFC 1928 §3–7](https://www.rfc-editor.org/rfc/rfc1928.html#section-3)——SOCKS5 方法协商、目标地址类型、TCP 连接与 UDP 中继。

[^go-net]: 〔软件实现〕[Go `SplitHostPort`](https://pkg.go.dev/net#SplitHostPort)、[`TCPConn.CloseWrite`](https://pkg.go.dev/net#TCPConn.CloseWrite)、[`ErrClosed`](https://pkg.go.dev/net#ErrClosed)、[`Conn.SetDeadline`](https://pkg.go.dev/net#Conn)、[`DialTimeout`](https://pkg.go.dev/net#DialTimeout)——地址拆分、关闭写方向、关闭后未完成 I/O 的错误、绝对读写期限及含 DNS 阶段的建连超时。

[^go-http]: 〔软件实现〕[Go `http.ReadRequest`](https://pkg.go.dev/net/http#ReadRequest)与[`bufio.Reader`](https://pkg.go.dev/bufio#Reader)——从缓冲 reader 解析 HTTP 请求及 reader 的预读边界。

[^mode]: 〔软件实现〕[Mihomo：Operation Mode](https://wiki.metacubex.one/en/config/general/#operation-mode)——`rule`、`global`、`direct` 的出站选择职责。

[^3]: 〔软件实现〕[Mihomo：DNS 配置](https://wiki.metacubex.one/config/dns/)——Fake-IP、过滤模式、目标解析、直连解析、节点解析与 DNS 服务的引导解析。

[^mapping-storage]: 〔软件实现〕[Mihomo：运行配置](https://wiki.metacubex.one/config/general/)中 `profile.store-fake-ip` 的说明——保存 Fake-IP 映射供后续启动复用。

[^fakeip-rfc]: 〔RFC〕[RFC 3089 §3, DNS Name Resolving Procedure](https://www.rfc-editor.org/rfc/rfc3089.html#section-3)——在 SOCKS IPv6/IPv4 网关中用临时地址恢复对应域名。

[^fakeip-benchmark]: 〔地址登记〕[IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)——`198.18.0.0/15` 对应 RFC 2544，登记用途为基准测试，标记为非全球可达。

[^4]: 〔软件实现〕[Mihomo：TUN 入站](https://wiki.metacubex.one/config/inbound/tun/)——协议栈选项、自动路由、排除地址及 DNS 劫持的平台边界。

[^5]: 〔软件实现〕[Mihomo：域名嗅探](https://wiki.metacubex.one/config/sniff/)——HTTP、TLS、QUIC 嗅探与目标覆盖配置。

[^6]: 〔软件实现〕[Mihomo：路由规则](https://wiki.metacubex.one/config/rules/)——顺序匹配、UDP 出站能力例外及 `no-resolve` 的作用范围。

[^http-outbound]: 〔软件实现〕[Mihomo：HTTP 出站](https://wiki.metacubex.one/config/proxies/http/)——HTTP 代理出站的 TLS 是独立可选配置。

[^curl]: 〔工具文档〕[curl 官方手册](https://curl.se/docs/manpage.html#--proxy)——HTTP 代理、SOCKS5/SOCKS5H 解析位置与 `--noproxy`；实验还需按本机 `curl --version` 确认功能。

[^version]: 〔软件实现〕[Mihomo v1.19.34 发布页](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.34)与[该版本配置类型](https://pkg.go.dev/github.com/metacubex/mihomo@v1.19.34/config)——固定本文配置字段的版本基线；平台行为另按各项官方文档及本机实际结果核对。

[^transparent]: 〔平台与实现〕[Linux Kernel: Transparent proxy support](https://docs.kernel.org/networking/tproxy.html)——REDIRECT 的目的地址改写局限、TPROXY 与策略路由及 IP_TRANSPARENT 的配合；Mihomo 的入口字段另见[官方监听器文档](https://wiki.metacubex.one/config/inbound/listeners/)。

[^http-wire]: 〔RFC〕[RFC 9112 §2.1、§5](https://www.rfc-editor.org/rfc/rfc9112.html#section-2.1)——HTTP/1.1 起始行、字段行与空行的消息定界。

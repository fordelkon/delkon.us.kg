---
title: "计算机网络（七）：代理协议、透明接管与分流实现"
description: "区分代理、VPN 与远端节点，以 Mihomo 为例追踪显式代理、TUN 接管、DNS、分流及出站会话，并用 curl 对照 CONNECT 建隧道和 SOCKS5 解析位置。"
publishDate: "23 Nov 2026"
tags: ["networking"]
---

第一篇的[直连 HTTPS 场景](/posts/networking/layered-architecture-packet-journey/#冷启动时客户端会发哪些报文)里，客户端向网站发起 TCP 握手，网关负责转发。引入代理后，应用侧和出站可能各自建立连接或发起解析。追踪请求时，要先确定应用连向哪一端、哪一端取得网站地址，再看目标 TLS 在哪里终止。

本篇以 Mihomo 为配置参照，先说明代理的连接模型，再追踪 HTTP CONNECT、SOCKS5 和第三篇介绍的 [TUN 接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#虚拟网络接口tun-与-tap-如何接入协议栈)如何交付流量，以及代理如何识别目标、选择出站和交付响应。最后用 `curl` 对照解析位置与连接路径。

## 代理模型、核心组件与出站协议

### 代理、VPN 和节点各自负责什么

讨论一次转发时，先问远端收到的是什么。**正向代理**（Forward Proxy）代表客户端连接指定目标，可以转发 HTTP 请求、搬运 TCP 字节流，或按协议中继 UDP 数据报；相对地，**反向代理**（Reverse Proxy）部署在服务端一侧，代表源站接收客户端请求，既可直接终止客户端 TLS 并回源，也能按路径或负载分发流量[^1]。HTTP 正向代理理解 HTTP 语义，SOCKS5 在应用和传输层之间提供目标连接与 UDP 中继服务。**虚拟专用网络**（Virtual Private Network，VPN）把一组主机或网段连进同一个逻辑网络。以 IP 隧道为例，对端解封后收到完整的内层 IP 包，再按路由交付或转发[^1][^2][^vpn-protocols]。

| 维度 | 正向代理 | 这里讨论的 VPN |
| --- | --- | --- |
| 远端收到什么 | 目标标识和流或数据报，可由协议携带或由本地流量推断 | 完整 IP 包，部分二层方案承载以太网帧 |
| 远端怎么交付 | 代理为目标建立连接或发送数据报 | VPN 对端解封后路由内层 IP 包，二层方案可以桥接以太网帧 |
| 哪些流量进入 | 应用采用显式代理，或系统通过 TUN 等机制引流 | 全隧道通常将默认路由引入 VPN；分流隧道可以只接管指定网段 |
| 哪段受保护 | 由代理协议及其传输配置决定；目标 HTTPS 可以另有端到端 TLS | WireGuard、OpenVPN、IPsec 可以保护隧道两端之间的流量，解封后的链路有自己的保护边界 |

例如，公司 VPN 可以只接管访问内网的前缀，访问公共网站仍走原出口。使用 WireGuard 时，系统路由决定哪些包交给隧道接口，`AllowedIPs` 还用于为出站包匹配对端，并约束该对端送入的内层源地址。OpenVPN 可以使用 TUN 承载 IP 包，也可以用 TAP 承载以太网帧；IPsec 的处理可由系统的安全策略决定。第三篇的 [TUN 接口、传输流代理与 IP 隧道对照](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun代理与-ip-隧道的处理区别)进一步展开了封装边界[^vpn-protocols]。

**节点**（Node）在这类客户端里通常指一条可选的远端代理配置，口语里也指运行服务的主机。配置包含服务地址、端口、代理协议，以及协议要求的认证或传输参数。比如 `edge.example.net:443` 是核心要连接的代理端点，`example.com:443` 则是代理要访问的网站目标。同一台机器可以监听多个端口或服务，同一个服务域名也可以解析到多个地址。VPN 文档里常用**对端**（Peer）描述隧道另一侧，例如 WireGuard 以公钥区分对端[^vpn-protocols]。

### 核心、图形客户端与订阅

**核心**（Core）负责接受入站、维护流状态、解析 DNS、执行规则以及使用出站协议。**图形客户端**（GUI Client）负责导入或编辑配置、展示连接与测速结果，以及操作系统代理开关。例如 Clash Verge Rev 使用 Mihomo 核心。这里的核心是代理软件的处理引擎；在 TUN 模式下，操作系统内核还负责系统选路和接口交付[^gui-client][^4]。

口语中的“机场”通常指提供代理服务和配置的服务商。**订阅链接**（Subscription URL）是用来拉取配置的地址，有些返回完整配置，有些只返回节点列表。以 Mihomo 为例，`proxy-providers` 可以加载节点列表，`rule-providers` 可以独立加载规则，策略组则引用可用节点。YAML 是配置表示格式，Base64 是编码，订阅 URL 中还可能带访问令牌。拿到链接的人可能获得相应配置，因此应按凭据处理含令牌的链接[^providers]。

### 两段 TCP 与目标 TLS

以普通 TCP CONNECT 为例，客户端先与代理建立 TCP 连接，代理再与目标建立一条独立的 TCP 连接。两段连接各自维护序号、确认与关闭状态。代理终结 TCP 不等于终止目标 TLS；若中间代理受客户端信任库认可，动态签发替代证书解密流量并另建上游连接，则属于**中间人 TLS 解密**（TLS Interception / Man-in-the-Middle，MitM），否则普通代理只做密文转发。判断中间节点能否读出 HTTP，要看谁是 TLS 对端[^1][^tls-endpoints]。

| HTTPS 路径 | TLS 会话及端点 | 中间节点能看到什么 |
| --- | --- | --- |
| CONNECT 隧道，只转发字节 | 客户端 ↔ 源站，一条 TLS 会话跨过两段 TCP | 代理知道 CONNECT 指定的目标，转发目标 TLS 字节，但不因此看见加密的 HTTP 内容 |
| 有意终止 TLS（反向代理或被信任的 MitM 调试代理） | 客户端 ↔ 代理；代理 ↔ 源站，两条独立 TLS 会话 | 代理解密前一段，可在重新加密前读取 HTTP；客户端验证前一段服务身份，代理独立验证回源服务身份 |

即使客户端先用 TLS 连接显式代理，这层加密也只保护到代理，隧道内的目标 TLS 仍可端到端。证书校验与中间节点的可见范围，见第六篇的[服务名校验](/posts/networking/http-evolution-tls-handshake-https/#证书链可信还要检查名字)与[各参与者的可见性对照](/posts/networking/http-evolution-tls-handshake-https/#各参与者能看到什么)。

### 入站、运行模式、DNS 与出站

以下字段对照 Mihomo v1.19.34 的配置类型与官方 Wiki 说明。排查本机时，用 `mihomo -v` 确认实际内核版本，再查看图形客户端最终生成的配置；客户端对订阅的覆盖也会改变生效结果[^version]。

| 配置维度 | 决定什么 | 常见选项 |
| --- | --- | --- |
| 入站接入方式 | 流量怎样进入代理内核 | HTTP/SOCKS 监听端口、TUN |
| 运行模式 | 已进入内核的流量怎样选择出站 | `rule`、`global`、`direct` |
| DNS 模式与关联 | 返回真实还是映射地址，怎样保留域名关系 | `fake-ip`、`redir-host` 及过滤配置 |
| 出站协议 | 怎样连接远端、是否加密、保护哪段链路 | HTTP、SOCKS、Shadowsocks、Trojan 等 |

`global` 选择的是已进入内核的流量的出站策略，不会替未采用显式代理、也未被 TUN 接管的应用捕获流量。TUN 也可以把流量交给 DIRECT；接管方式与是否使用远端节点是不同选择[^mode][^4]。至于 DNS 模式：`fake-ip` 先返回虚拟地址把真实解析延后到规则或直连出站；`redir-host` 则在 DNS 阶段直接把上游或本地解析到的真实 IP 返回给应用，连接进来后代理只拿到真实目的 IP，往往还要配合域名嗅探或 DNS 记录反向关联域名[^3]。

### 出站协议、承载与加密

选中一个节点后，本地核心要按配置与远端服务协商。代理协议决定怎样提交目标、认证会话及交付数据；承载决定这些数据怎样跨网络传送。监听端口是地址的一部分，例如端口 `443` 本身无法说明流量使用 TLS 还是其他协议。

| 出站协议 | 要核对的保护与承载 |
| --- | --- |
| HTTP / SOCKS5 | 可用于本机入口，也可连远端。明文 HTTP 或使用无认证方法的 SOCKS5 不为这段连接提供保密性；HTTP 代理可另外使用 TLS，SOCKS5 的认证方法也可定义额外保护[^1][^2][^http-outbound] |
| Shadowsocks | AEAD 变体对客户端到节点之间的数据做认证加密。TCP 流和 UDP 数据报使用各自的封装[^ss-aead] |
| VMess / VLESS | 分别看 VMess 的 `cipher`、VLESS 的 `encryption`，以及另行配置的 TLS 等传输安全参数。仅看到协议名或 UUID 无法推断数据是否受保护[^remote-config] |
| Trojan | 用 TLS 保护客户端到节点的连接，使用密码认证代理请求。目标网站的 TLS 仍可保留在隧道内[^trojan] |
| Hysteria 2 | 基于 QUIC，使用双向流承载 TCP 代理数据，并通过 QUIC DATAGRAM 中继 UDP 数据。实际延迟和吞吐取决于路径与拥塞控制[^hysteria] |

## 流量怎样进入代理

### 显式代理：HTTP CONNECT 与 SOCKS5 的工作边界

[显式代理](/posts/networking/layered-architecture-packet-journey/#操作系统边界socket-与网络接口)要求客户端主动知晓并配置代理端点。程序采用代理设置后，先把 Socket 连接到代理监听地址，例如 `127.0.0.1:7890`，再告诉代理要连接的目标。系统代理是一组供应用读取的设置。浏览器可采用系统的代理配置，也可用自身的覆盖设置。curl 另有 `--proxy` 和 `http_proxy`、`HTTPS_PROXY` 等环境变量。系统设置和 shell 环境变量属于不同配置入口，是否采用以及优先级由应用决定[^chromium-proxy][^curl]。

| 对比维度 | HTTP 代理（含 CONNECT） | SOCKS5 |
| --- | --- | --- |
| 协商方式 | 访问明文 HTTP 时直接发送 `absolute-form` 请求（如 `GET http://example.com/ HTTP/1.1`）；需要隧道时发送 `CONNECT example.com:443 HTTP/1.1` | 二进制握手、认证方法协商与连接请求 |
| 目标地址 | authority 形式的主机与端口，可以传域名或 IP | IPv4、域名或 IPv6，类型分别为 `0x01`、`0x03`、`0x04` |
| 传输支持 | 普通 `CONNECT` 只建立 TCP 字节流隧道；在 HTTP 上代理 UDP 需专用的 `CONNECT-UDP` 扩展[^connect-udp] | `CONNECT` 用于 TCP，`UDP ASSOCIATE` 先经 TCP 协商中继端点，再随包头转发 UDP 数据报[^2] |
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

TUN 只是交付 IP 包的接口，并不规定后续必须把完整内层 IP 包封装成 VPN 隧道。代理可以终结传输流再建立出站连接；MTU 开销也应按实际出站封装计算，参见第八篇的 [MTU、MSS 与 PMTUD 排查](/posts/networking/network-diagnostics-performance-troubleshooting/#mtumss-与-pmtud-黑洞)。

## 接管后怎样补足目标域名

显式请求可能已经带有域名。目标只以 IP 地址交给代理时，域名规则还需要额外线索。代理可以在回答 DNS 查询时先建立地址映射，也可以在接到流量后从可识别的协议字段中取得域名。线索不足时，后续能用哪些规则取决于代理还掌握什么目标信息。

### Fake-IP：在 DNS 阶段建立映射

在匹配的 DNS 请求进入内部解析器后，**虚拟地址映射**（Fake-IP）可以先返回与域名关联的地址，而不必在这个响应阶段取得真实目标 IP。RFC 3089 描述的 SOCKS IPv6/IPv4 网关使用了类似的临时地址与域名映射，并未为 Fake-IP 分配地址段[^fakeip-rfc]。Mihomo 文档的 IPv4 地址池示例是 `fake-ip-range: 198.18.0.1/16`，其前缀位于 IANA 登记的 `198.18.0.0/15` 基准测试网段内（非全球可达）；IPv6 侧可另配 `fake-ip-range6`（常位于 `fc00::/7` 唯一本地地址段，例如 `fc00::/18`），或通过 `dns.ipv6: false` 关闭对 `AAAA` 的响应。若应用从其他路径拿到真实 IPv6 而 TUN 或出站未支持 IPv6，也会出现部分流量绕行或失败[^3][^fakeip-benchmark]。

把 [DNS 回答与实际连接](/posts/networking/dns-resolution-caching-encrypted-queries/#dns-答案怎样影响连接目标)分开看。DNS 查询命中 Fake-IP 时，解析侧分配或复用虚拟地址并记录域名关联；Fake-IP 响应通常还会刻意返回极短 TTL（例如 `1` 秒）以减少系统长时缓存旧映射，但如果应用忽略 TTL 自建连接池、地址池写满触发旧条目回收替换、或未开启映射持久化时核心重启，后续连接就可能找不到映射。**DNS 回答成功并不表示已经建立了目标连接**。之后应用可能从缓存取到这个地址并发起连接；只有本次传输被路由到 TUN，且代理仍有对应映射时，下图的查表恢复才成立[^3][^4][^mapping-storage]。

```mermaid title="Fake-IP 的两次事件：DNS 建映射，连接查映射" description="DNS 和代理核心共享地址映射。缓存中的回答可以稍后用于连接。本图只展开命中域名规则且出站支持传域名的情形；箭头表示逻辑交付顺序，不按耗时绘制。"
sequenceDiagram
 participant App as 应用
 participant DNS as Mihomo DNS<br/>（Fake-IP 映射表）
 participant OS as 系统网络栈
 participant Core as 代理核心
 participant Node as 远端代理节点
 participant Target as 目标服务
 App->>DNS: [阶段 1 · DNS] 查询 example.com 的 A 记录
 DNS->>DNS: 记录共享映射<br/>198.18.0.8 ↔ example.com
 DNS-->>App: A 记录：198.18.0.8
 Note over App,OS: 阶段 2 · 传输：缓存生效，应用按虚拟地址发起连接
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

`dns-hijack` 把匹配的 DNS 连接送进内部模块，不是所有名称解析的总开关：普通 `any:53` 写法只匹配 UDP 53，TCP 53 需要显式加配（例如 `tcp://any:53`）；浏览器 DoH 等加密 DNS 也不能仅凭端口 53 的规则接管。macOS、Windows 的局域网 DNS 劫持还存在文档列出的限制[^4]。因此，`dig @某服务器` 只指定了请求的表面目的地址，不能单凭参数证明实际处理者。

会把解析结果上报给其他设备的应用，可能无法使用仅在本机代理内有意义的 Fake-IP。可按 `fake-ip-filter` 及其过滤模式让相关域名返回真实 IP，再按真实 IP 路径处理[^3]。

### 域名嗅探：读取可见的协议元数据

连接指向真实 IP 且缺少域名时，启用**域名嗅探**（domain sniffing）后，代理可以从部分协议数据取得目标名[^5]：

- 明文 HTTP 请求中的 `Host`。
- TLS ClientHello 中未被 ECH 隐藏的 SNI。
- QUIC Initial 中可解析的 ClientHello 信息。

这里的“首包”指读取连接开头的数据。TCP 分段、TLS 记录及 QUIC 数据可能需要重组才能得到完整字段。嗅探仅使用可见的协议元数据。尤其需要注意**与目的地址覆盖配合时的陷阱**：在第六篇描述的 [ECH 场景](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello)下，外层 `ClientHelloOuter` 暴露的是公开前置名 `public_name`，而不是受保护的真实域名；若对真实 IP 连接开启了用嗅探域名覆盖目的地址（例如 Mihomo 中的 `override-destination: true`），代理可能误将连接改指向公开名或破坏证书身份匹配[^5]。此时应优先依赖既有 DNS 映射或针对特定域名跳过嗅探。

### 域名线索不足时如何处理

流量已经进入代理后，先区分目标是 Fake-IP 还是真实 IP。Fake-IP 失去映射时，虚拟地址本身无法指向目标服务。真实 IP 没有可用域名时，代理仍可用目标 IP、进程等已有信息匹配规则。`fake-ip-filter` 返回的真实地址也按这条路径处理[^3][^5]。

```mermaid title="目标域名关联的成功与失败分支" description="限定连接已进入代理。Fake-IP 必须有可用映射，不能作为普通公网地址连接；真实 IP 可以按配置尝试嗅探，但 ECH 或自定义协议可能不提供真实域名。图中停止节点表示缺少继续直连或匹配所需的有效信息，具体报错与恢复由实现决定。"
flowchart TB
 inbound["入站已收到目标地址"] --> fake{"目标属于配置的<br/>Fake-IP 池？"}
 fake -->|是| cache{"映射仍可用？"}
 cache -->|命中| domain["恢复域名<br/>进入规则与出站处理"]
 cache -->|未命中| fail["映射缺失<br/>停止按虚拟 IP 直连"]
 fake -->|否，真实 IP| sniff{"允许且成功取得<br/>域名元数据？"}
 sniff -->|是| domain
 sniff -->|否| iponly["仅按已有 IP 与其他元数据处理<br/>（或依配置拒绝并停止）"]
 class inbound actor
 class fake,cache,sniff state
 class domain result
 class fail,iponly risk
```

遇到映射缺失或线索不足时，应结合下表对照 DNS 记录、持久化配置与连接日志重新核查，不把临时报错当成远端服务异常：

| 条件 | 缺少什么 | 下一步证据 |
| --- | --- | --- |
| 代理重启或映射被清理，应用仍缓存 Fake-IP | 虚拟地址到原域名的可用映射 | 对照 DNS 回答时间、映射持久化和连接日志 |
| 应用自行使用 DoH，绕过内部 DNS | DNS 阶段的 Fake-IP 关联 | 检查应用 DNS 设置与实际使用的目标地址 |
| 应用直接使用 IP 或自定义加密协议 | 原始域名或可识别元数据 | 核对代理收到的目标 IP 及命中的 IP 或进程规则 |
| TLS / QUIC 使用 ECH | 真实的内部 SNI | 核对代理是否另有可用的域名映射，排查嗅探覆盖配置 |

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
 direct --> response["对应出站会话<br/>收到响应"]
 relay --> response
 response --> inbound["入站转发状态"]
 inbound --> original["原应用"]
 class app actor
 class explicit,transparent,metadata,rules,choice,direct,relay,response,inbound state
 class reject risk
 class original result
```

代理按书写顺序自上而下检查规则，命中后还会核对所选出站是否支持当前传输（例如 UDP 流遇到不支持 UDP 中继的节点会继续检查后续规则）[^6]。常见规则类型按以下边界工作：

- **`DOMAIN` 与 `DOMAIN-SUFFIX`**：前者严格精确匹配完整域名；后者按点号边界做后缀匹配——例如 `DOMAIN-SUFFIX,example.com` 会匹配 `example.com` 与 `a.example.com`，但**不匹配** `notexample.com`。
- **`IP-CIDR` / `GEOIP` 与 `no-resolve`**：若当前流量只有域名而尚无真实目标 IP，遇到 IP 类规则时会触发代理内部的 DNS 解析；在该规则末尾附加 `no-resolve` 会阻止这条规则主动触发解析（若先前已有 IP 仍参与判断），把解析推迟到后续需要 IP 的规则或 `DIRECT` 出站阶段[^6]。
- **`MATCH`**：置于规则表末尾作为兜底条件，当以上规则都未命中时给出默认策略组或出站。

`Proxy` 只是常见配置里策略组的命名之一。连接选中的节点时，代理使用该节点的出站协议和配置，例如 HTTP 出站可选用 TLS[^http-outbound]。判断实际保护范围时，要分别确认目标 TLS 的终止位置和代理传输所覆盖的链路。

### 用有序规则表表示分流

下面的 C 模型把精确匹配、按点号边界后缀匹配、通配兜底和传输类型检查放进有序规则表，用来演示规则顺序与后缀边界。传入的域名已按 DNS 规范转为小写且不含末尾点，尚且只有 IP 线索的流用 `NULL` 表示。规则表自上而下短路返回第一个匹配项指针；调用方须在只读查询期间保留规则表内存，查无匹配时返回 `NULL`。实际路由引擎还会在命中策略组后按 `url-test`、`fallback` 等组策略再选具体节点，并在规则带 `IP-CIDR`/`GEOIP` 时决定是否推迟 DNS 解析[^6]。

```c
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

enum Transport { TRANSPORT_ANY, TRANSPORT_TCP, TRANSPORT_UDP };
enum DomainMatchKind { RULE_MATCH_ALL, RULE_EXACT, RULE_SUFFIX };

struct FlowMetadata {
    enum Transport transport;
    const char *domain;
};

enum OutboundKind { OUTBOUND_DIRECT, OUTBOUND_REJECT, OUTBOUND_GROUP };

struct Outbound {
    enum OutboundKind kind;
    const char *group_name;  // Used only for OUTBOUND_GROUP.
};

struct Rule {
    enum DomainMatchKind match_kind;
    const char *domain;  // Ignored when match_kind is RULE_MATCH_ALL.
    enum Transport transport;
    struct Outbound outbound;
};

static bool domain_matches_suffix(const char *domain, const char *suffix) {
    size_t domain_len = strlen(domain);
    size_t suffix_len = strlen(suffix);
    if (domain_len < suffix_len) {
        return false;
    }
    const char *tail = domain + (domain_len - suffix_len);
    if (strcmp(tail, suffix) != 0) {
        return false;
    }
    // Require exact match or a '.' label separator so "notexample.com" does not match "example.com".
    return domain_len == suffix_len || tail[-1] == '.';
}

static bool rule_matches_domain(const struct Rule *rule, const char *domain) {
    if (rule->match_kind == RULE_MATCH_ALL) {
        return true;
    }
    if (domain == NULL || rule->domain == NULL) {
        return false;
    }
    if (rule->match_kind == RULE_EXACT) {
        return strcmp(rule->domain, domain) == 0;
    }
    return domain_matches_suffix(domain, rule->domain);
}

const struct Outbound *select_outbound(const struct Rule *rules, size_t count,
                                       const struct FlowMetadata *flow) {
    if (rules == NULL || flow == NULL) {
        return NULL;
    }
    // Evaluate top-to-bottom so the first matching rule wins (short-circuit order).
    for (size_t i = 0; i < count; ++i) {
        const struct Rule *rule = &rules[i];
        if (!rule_matches_domain(rule, flow->domain)) {
            continue;
        }
        if (rule->transport != TRANSPORT_ANY && rule->transport != flow->transport) {
            continue;
        }
        return &rule->outbound;
    }
    return NULL;
}
```

可以把规则依次填成“`RULE_EXACT` `tracker.example` → `OUTBOUND_REJECT`”“`RULE_SUFFIX` `example.com` 且 TCP → 策略组 `Relay`”“`RULE_MATCH_ALL` → `OUTBOUND_DIRECT`”。此时 `a.example.com` 的 TCP 流选中 `Relay`，`notexample.com` 与 UDP 流都会略过第二条并命中末尾的直连规则；而若把 `RULE_MATCH_ALL` 移到最前面，它会先截断所有后续规则。Mihomo 还支持 `GEOSITE`、`GEOIP`、`PROCESS-NAME` 等更多规则及出站协议兼容性回退[^6]。

策略组随后按自身配置选择节点。手选组使用当前选择，`url-test` 组使用探测结果与容差，`fallback` 组按可用性和顺序切换。测速面板上的延迟只反映探测路径和时刻。规则里名为 `Proxy` 的策略组也可以配置 `DIRECT` 成员，排查时要看到实际选中的出站[^proxy-groups]。

### 浏览器请求怎样经过远端节点

以浏览器用本地 HTTP 代理访问 `https://example.com/` 为例。假定浏览器使用 TCP，规则选择 `Relay`，最终出站是使用 TLS 的节点 `edge.example.net:443`。这里假设本地代理把目标以域名交给节点，且节点仅中继网站 TLS 字节。

1. 浏览器建立到 `127.0.0.1:7890` 的连接，发出 `CONNECT example.com:443`。核心从请求中取得目标域名和端口。
2. 核心按规则选中 `Relay`，再由策略组决定将本次流量交给哪个节点。核心解析并连接节点地址，这是一次针对代理服务的建连。
3. 核心通过节点会话提交 `example.com:443`。节点解析网站地址，另建到网站的 TCP 连接。核心确认 CONNECT 成功后，浏览器在隧道里与网站进行目标 TLS 握手[^1]。
4. 网站把响应送回节点，节点把网站 TLS 字节交回核心，核心再通过本地 CONNECT 隧道交回浏览器。在这个例子里，节点可读取代理协议携带的目标，但浏览器与网站之间的 HTTP 内容仍由目标 TLS 保护。

若改用 TUN，第一步变成系统按路由把 IP 包交给核心，[Fake-IP 映射或可见协议字段](#接管后怎样补足目标域名)可能提供域名线索。后续分流仍可导向同一节点。若改用完整 IP 隧道，VPN 对端处理的是解封所得的内层 IP 包，网站 TCP 连接的握手和序号仍由浏览器与网站两端维护[^vpn-protocols]。

## TUN 代理如何建立出站并交付回包

出站选定后，代理通过直连或节点会话发送数据，再按保存的入站状态把响应交回应用。以一个被 TUN 接管并由本地代理终结的 TCP 流为例，应用侧的 SYN、ACK 与 FIN 由本地连接状态处理，出站连接使用独立的序号空间。这两段 TCP 仍可搬运同一条端到端 TLS 字节流。

### 应用侧与出站侧的两套连接状态

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

这与第三篇的 [NAPT 两侧包头对照](/posts/networking/routing-forwarding-nat-virtual-interfaces/#napt地址端口映射与回包转换)不同：普通 NAPT 没有新建这两套 TCP 序号空间；也与第三篇的[完整内层 IP 包 VPN 封装](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun代理与-ip-隧道的处理区别)不同，表中的物理出站包不包含原来那份 Fake-IP 包。

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
 class dns actor
 class route,tun,native,core state
 class stop risk
 class out result
```

排查意外绕行时，先核对 A、AAAA 回答，再对同一域名分别运行 `curl -4` 和 `curl -6`，记录 `remote_ip`。用[路由查询](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果)和第八篇的[捕获位置对照](/posts/networking/network-diagnostics-performance-troubleshooting/#https-与代理路径需要另一次捕获)核实出接口，并用代理日志确认对应的入站与出站。经显式代理时，`remote_ip` 记录 curl 连到的代理地址。若目标域名也交给代理处理，另一段连接使用的地址族要在出站侧另行核实[^curl]。

## 命令行验证：先确认入站，再对照解析位置

下面的 curl 命令需要本机已配置代理，并会尝试访问 `example.com`。先确认监听地址，再结合代理日志检查本次连接使用的入站、出站和解析路径。

### 实验一：观察 HTTP CONNECT

使用已配置、允许访问该目标的本机 HTTP 代理，把 `7890` 换成实际监听端口。

```bash frame="code"
curl --noproxy '' --proxy http://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 \
  -sS -v --http1.1 https://example.com/ -o /dev/null
```

`--noproxy ''` 清空环境中的绕过列表（不同于 `--noproxy '*'` 跳过全部显式代理），避免 shell 变量 `no_proxy` 让本次实验意外跳过指定代理；`-sS` 保留报错输出并省去进度条，便于对照 `-v` 握手日志。日志先显示连接本地代理，再发送 `CONNECT example.com:443`，收到成功响应后才开始目标 TLS 握手。对照代理日志中的入站与出站，区分失败发生在代理 TCP、CONNECT 协商、目标 TLS 还是 HTTP 响应；只看到代理端口连接成功并不能证明整条访问成功[^curl]。

### 实验二：SOCKS5 的本地解析与代理解析

对自己已配置的 SOCKS5 代理，可分别运行以下两条命令；示例端口 `7890` 必须替换成实际端口：

```bash frame="code"
curl --noproxy '' --proxy socks5://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 -sS -v https://example.com/ -o /dev/null
curl --noproxy '' --proxy socks5h://127.0.0.1:7890 \
  --connect-timeout 5 --max-time 20 -sS -v https://example.com/ -o /dev/null
```

在 curl 中，`socks5://` 先由客户端解析目标并向 SOCKS 代理传 IP；`socks5h://` 传域名让 SOCKS 代理处理。这里的“代理解析”仍不保证最终使用哪台上游 DNS；规则、Fake-IP 映射与节点协议可能继续影响路径[^curl]。

对照日志时，HTTP 代理应先出现 `CONNECT example.com:443` 与成功的隧道响应；SOCKS 本地解析会显示 IP 和 `locally resolved`，代理解析则显示域名和 `remotely resolved`。启用 Fake-IP 时，前者传入的可能是映射地址。这些日志可以区分 curl 向代理传 IP 还是域名；后续采用哪台真实 DNS、选择哪个远端节点，仍需查看代理日志。

:::tip[把三份证据对齐]
保留 curl 日志中的目标表示方式、代理日志中的域名/IP 元数据与所选出站，再对照 DNS 查询日志。若运行了 TUN，`--noproxy '*'` 仅绕过 curl 的显式代理选择，并不能撤销系统路由；比较实验时必须记录这一条件。
:::

## 总结

- 正向代理代为连接或中继目标，反向代理则立足服务端并可终止前段 TLS；IP VPN 转发隧道内的 IP 包；节点配置描述代理服务端点和通信参数。
- 显式代理由应用传递目标，TUN 借助接口与路由接收 IP 包。两种入口均可把流量交给代理核心分流。
- 入站方式、运行模式、DNS 模式与出站协议回答四个不同的问题，不能用一个“全局”开关代替。
- Fake-IP 延后的是特定阶段的真实目标解析，嗅探依赖可见协议字段；`ECH` 与目的地址覆盖叠加时，不能把外层公开名当成内部真实目标。
- 规则顺序、`no-resolve`、出站能力与防回环需要一起检查，返回方向也有需要维护的会话状态。

最后一篇[《计算机网络（八）：网络诊断、性能指标与分层排障》](/posts/networking/network-diagnostics-performance-troubleshooting/)会把这些阶段转为对照实验：先确认请求实际经过哪些环节，再判断哪份证据能排除哪种解释。

## 延伸阅读

- [Mihomo 官方文档](https://wiki.metacubex.one/)——按安装版本对照完整配置，而不是把单段示意当成可直接部署的配置文件
- [RFC 9297: HTTP Datagrams and the Capsule Protocol](https://www.rfc-editor.org/rfc/rfc9297.html)——理解 HTTP/3 QUIC Datagram 与 HTTP/2 / HTTP/1.1 Capsule 怎样在连接内部承载无连接语义的数据报

[^1]: 〔RFC〕[RFC 9110 §3.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-3.7)区分代理、网关与隧道；[§9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)定义 CONNECT 目标、成功响应后的隧道语义与连接关闭要求。

[^tls-endpoints]: 〔RFC〕[RFC 9846 §2](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)与[§5.2](https://www.rfc-editor.org/rfc/rfc9846.html#section-5.2)——TLS 对端建立密钥并保护应用数据；中间转发 TCP 字节不会使中间节点成为 TLS 对端。

[^2]: 〔RFC〕[RFC 1928 §3–7](https://www.rfc-editor.org/rfc/rfc1928.html#section-3)——SOCKS5 方法协商、目标地址类型、TCP 连接与 UDP 中继。

[^connect-udp]: 〔RFC〕[RFC 9298 §3](https://www.rfc-editor.org/rfc/rfc9298.html#section-3)——使用 HTTP `connect-udp` 与 URI 模板建立基于 HTTP 的 UDP 隧道。

[^mode]: 〔软件实现〕[Mihomo：常规配置](https://wiki.metacubex.one/config/general/)——`rule`、`global`、`direct` 运行模式的出站选择职责。

[^3]: 〔软件实现〕[Mihomo：DNS 配置](https://wiki.metacubex.one/config/dns/)——Fake-IP、IPv6 地址池、过滤模式、目标解析、直连解析、节点解析与 DNS 服务的引导解析。

[^mapping-storage]: 〔软件实现〕[Mihomo：常规配置](https://wiki.metacubex.one/config/general/)中 `profile.store-fake-ip` 的说明——保存 Fake-IP 映射供后续启动复用。

[^fakeip-rfc]: 〔RFC〕[RFC 3089 §3, DNS Name Resolving Procedure](https://www.rfc-editor.org/rfc/rfc3089.html#section-3)——在 SOCKS IPv6/IPv4 网关中用临时地址恢复对应域名。

[^fakeip-benchmark]: 〔地址登记〕[IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)——`198.18.0.0/15` 对应 RFC 2544，登记用途为基准测试，标记为非全球可达。

[^4]: 〔软件实现〕[Mihomo：TUN 入站](https://wiki.metacubex.one/config/inbound/tun/)——协议栈选项、自动路由、排除地址及 DNS 劫持的平台边界。

[^5]: 〔软件实现〕[Mihomo：域名嗅探](https://wiki.metacubex.one/config/sniff/)——HTTP、TLS、QUIC 嗅探与目标覆盖配置。

[^6]: 〔软件实现〕[Mihomo：路由规则](https://wiki.metacubex.one/config/rules/)——顺序匹配、UDP 出站能力例外及 `no-resolve` 的作用范围。

[^http-outbound]: 〔软件实现〕[Mihomo：HTTP 出站](https://wiki.metacubex.one/config/proxies/http/)——HTTP 代理出站的 TLS 是独立可选配置。

[^curl]: 〔工具文档〕[curl 官方手册](https://curl.se/docs/manpage.html#--proxy)——HTTP 代理、SOCKS5/SOCKS5H 解析位置与 `--noproxy`；实验还需按本机 `curl --version` 确认功能。

[^version]: 〔软件实现〕[Mihomo v1.19.34 发布页](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.34)与[该版本配置类型](https://pkg.go.dev/github.com/metacubex/mihomo@v1.19.34/config)——固定本文配置字段的版本基线；平台行为另按各项官方文档及本机实际结果核对。

[^transparent]: 〔平台与实现〕[Linux Kernel: Transparent proxy support](https://docs.kernel.org/networking/tproxy.html)——REDIRECT 的目的地址改写局限、TPROXY 与策略路由及 IP_TRANSPARENT 的配合；Mihomo 的入口字段另见[官方监听器文档](https://wiki.metacubex.one/config/inbound/listeners/)。

[^vpn-protocols]: 〔协议与实现〕[WireGuard: Cryptokey Routing](https://www.wireguard.com/#cryptokey-routing)说明包封装、公钥对端和允许地址；[OpenVPN 2.6 手册](https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual/)说明 TUN/TAP、路由与默认网关选项；[RFC 4301 §4.1、§4.4](https://www.rfc-editor.org/rfc/rfc4301.html#section-4.1)说明 IPsec 的隧道模式与安全策略。

[^remote-config]: 〔软件实现〕Mihomo 的 [VMess 配置](https://wiki.metacubex.one/config/proxies/vmess/)与 [VLESS 配置](https://wiki.metacubex.one/config/proxies/vless/)分别列出用户标识、加密和传输字段。

[^gui-client]: 〔软件实现〕[Clash Verge Rev 项目说明](https://github.com/clash-verge-rev/clash-verge-rev)——GUI 客户端、Mihomo 核心和配置管理功能。

[^providers]: 〔软件实现〕Mihomo 的[节点提供者](https://wiki.metacubex.one/config/proxy-providers/)、[节点列表格式](https://wiki.metacubex.one/config/proxy-providers/content/)及[规则提供者](https://wiki.metacubex.one/config/rule-providers/)——远端配置来源以及节点列表与规则集的加载方式。

[^ss-aead]: 〔协议文档〕[Shadowsocks: AEAD ciphers](https://shadowsocks.org/doc/aead.html)——AEAD 加密以及 TCP 流与 UDP 数据报的封装边界。

[^trojan]: 〔软件实现〕[Mihomo：Trojan 出站](https://wiki.metacubex.one/config/proxies/trojan/)——密码、TLS 与传输选项。

[^hysteria]: 〔协议文档〕[Hysteria 2 协议](https://v2.hysteria.network/docs/developers/Protocol/)——QUIC 流代理 TCP、DATAGRAM 中继 UDP 和拥塞控制。

[^chromium-proxy]: 〔软件实现〕[Chromium：Proxy support in Chrome](https://chromium.googlesource.com/chromium/src/+/master/net/docs/proxy.md)——系统代理与浏览器自己的代理配置方式。

[^proxy-groups]: 〔软件实现〕Mihomo 的[策略组配置](https://wiki.metacubex.one/config/proxy-groups/)、[`url-test`](https://wiki.metacubex.one/config/proxy-groups/url-test/)及[`fallback`](https://wiki.metacubex.one/config/proxy-groups/fallback/)——组成员、探测容差和故障切换的职责。

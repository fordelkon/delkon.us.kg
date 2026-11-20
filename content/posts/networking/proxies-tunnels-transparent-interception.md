---
title: "计算机网络（七）：代理协议、透明接管与分流实现"
description: "以 Mihomo 为例区分显式代理、TUN 入站、运行模式、DNS 模式与出站协议，结合 Go CONNECT 示例和 curl 实验，解释域名关联、规则匹配及连接转发的边界。"
publishDate: "23 Nov 2026"
tags: ["networking", "go"]
---

前六篇沿客户端访问的主线介绍了寻址、路由、传输、DNS 与 Web 通信。代理把这些机制组合到新的连接路径中：应用先连接谁、域名由谁解析、代理选哪个出站，以及目标 TLS 在哪里终止，都取决于这条连接的实际路径。

本篇以 Mihomo 为配置参照，先画清代理的连接，再分别追踪 HTTP CONNECT、SOCKS5 和第三篇介绍的 [TUN 接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#虚拟网络接口tun-与-tap-如何接入协议栈)怎样把流量交给代理。最后用 Go 标准库演示最小 CONNECT 代理，再用 `curl` 对照解析位置与连接路径。

## 代理的入站、出站与 TLS 终止

以普通 TCP CONNECT 为例，客户端先与代理建立 TCP 连接，代理再与目标建立一条独立的 TCP 连接。两段连接各自维护序号、确认与关闭状态。代理在两段之间搬运字节时，目标 TLS 仍可由客户端与目标服务建立，证书也由客户端校验。连接端点与加密终止点的对照见[第六篇的可见性矩阵](/posts/networking/http-evolution-tls-handshake-https/#端到端可见性边界谁能看到什么)[^1]。

对显式入站，应用把目标写进代理请求。对 TUN 入站，路由把 IP 包交给代理程序，目标域名可能要靠 DNS 映射或可见的协议字段补足。下面按入站方式、目标信息与出站决策的顺序展开。

### 入站、运行模式、DNS 与出站

以下字段对照 Mihomo v1.19.34 的配置类型与官方 Wiki（2026 年 11 月 18 日查阅）说明。排查本机时，用 `mihomo -v` 确认实际内核版本，再查看客户端最终生成的配置；GUI 对订阅的覆盖也会改变生效结果[^version]。

| 配置维度 | 决定什么 | 常见选项 |
| --- | --- | --- |
| 入站接入方式 | 流量怎样进入代理内核 | HTTP/SOCKS 监听端口、TUN |
| 运行模式 | 已进入内核的流量怎样选择出站 | `rule`、`global`、`direct` |
| DNS 模式与关联 | 返回真实还是映射地址，怎样保留域名关系 | `fake-ip`、`redir-host` 及过滤配置 |
| 出站协议 | 怎样连接远端、是否加密、保护哪段链路 | HTTP、SOCKS、Shadowsocks、Trojan 等 |

`global` 选择的是已进入内核的流量的出站策略，不会替未采用显式代理、也未被 TUN 接管的应用捕获流量。TUN 也可以把流量交给 DIRECT；接管方式与是否使用远端节点是不同选择[^mode][^4]。

## 显式代理：HTTP CONNECT 与 SOCKS5 的工作边界

**显式代理**（Explicit Proxy）要求客户端主动知晓并配置代理端点。程序采用代理设置后，先把 Socket 连接到代理监听地址，例如 `127.0.0.1:7890`，再告诉代理要连接的目标。不同程序是否读取系统设置、环境变量及哪些变量，取决于实现，不能把“设置了系统代理”当作每个进程都会采用代理的保证。

| 对比维度 | HTTP CONNECT | SOCKS5 |
| --- | --- | --- |
| 协商方式 | HTTP 方法，请求行为如 `CONNECT example.com:443 HTTP/1.1` | 二进制握手、认证方法协商与连接请求 |
| 目标地址 | authority 形式的主机与端口，可以传域名或 IP | IPv4、域名或 IPv6，类型分别为 `0x01`、`0x03`、`0x04` |
| 传输支持 | 此处讨论普通 CONNECT 的 TCP 字节流隧道 | `CONNECT` 用于 TCP，`UDP ASSOCIATE` 用于 UDP 中继 |
| 目标 DNS | 若传入域名，由代理处理；若传入 IP，代理不必再解析该目标名 | 客户端可以先解析并传 IP，也可以传域名交给代理处理 |

这两种协议的地址与协商格式分别见 RFC 9110 和 RFC 1928[^1][^2]。客户端把域名交给本地代理，也不等于域名一定在远端节点解析：本地代理的规则判断或出站协议仍可能要求先取得真实 IP。

CONNECT 请求已经向代理提供目标主机与端口。隧道建立后，客户端可以在其中发起目标 TLS 握手，邻接的两段 TCP 负责把握手和后续密文送到对端。

## 透明接管：TUN 提供 IP 包，域名需要额外关联

先把应用配合方式与内核接管方式放在同一张表中，避免把透明接管等同于 TUN：

| 入口 | 交给处理程序的对象 | 主要前提与限制 |
| --- | --- | --- |
| 系统代理 / 显式代理 | 应用发出的 HTTP 或 SOCKS 请求 | 应用须采用代理配置；不是系统路由强制接管 |
| TUN | 三层 IP 包 | 需要接口、路由和流处理；本身不提供域名 |
| TAP | 二层以太网帧 | 需要二层处理，可用于桥接；不是 Mihomo 的 TUN 选项 |
| REDIRECT | 经本地重定向后交给监听 Socket 的流量 | 常见 Linux TCP 方案会改写目的；恢复原目的信息需要平台接口 |
| TPROXY | 保留原目的地址的透明 Socket 流量 | Linux 需相应内核支持、策略路由及透明 Socket 配合，可用于 TCP/UDP |

REDIRECT 与 TPROXY 的上述区别依据 Linux 内核文档，不能复制为 macOS 或 Windows 的部署命令。它们也不能单独解决 DNS 域名关联、代理出站或 TLS 解密问题[^transparent]。

对不采用显式代理的应用，可以通过路由把匹配流量引向 TUN。Mihomo 的 `tun.enable` 与 `auto-route` 负责相应接口及自动路由配置，但实际范围仍受更具体路由、排除地址、策略路由与 IPv4/IPv6 配置影响。第三篇的[最长前缀匹配](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由表与最长前缀匹配)解释了为什么“已启用 TUN”不能直接证明所有连接都进入代理[^4]。

显式代理可以直接取得 CONNECT/SOCKS 请求中的域名；TUN 则向程序交付 IP 包。**IP 头本来就没有域名字段**，缺少额外关联时，代理只能从头部取得目标 IP，而不能反推出唯一域名。域名可能仍在 DNS、HTTP Host 或 TLS SNI 等应用层数据里，不能说它“离开进程时被 IP 层剥掉”。

代理内核需要把这些包转换为可处理的传输流或 UDP 会话。Mihomo 文档中，`system` 使用系统协议栈，`gvisor` 使用用户态协议栈，`mixed` 的 TCP 使用 system、UDP 使用 gvisor；文档还列有自研 `mips` 栈。因此 `system` 本身不是“混合栈”，可用选项和默认值应结合安装版本确认[^4]。

TUN 只是交付 IP 包的接口，并不规定后续必须把完整内层 IP 包封装成 VPN 隧道。代理可以终结传输流再建立出站连接；MTU 开销也应按实际出站封装计算，参见[第八篇的 MTU 排查](/posts/networking/network-diagnostics-performance-troubleshooting/)。

## 接管后怎样补足目标域名

### Fake-IP：在 DNS 阶段建立映射

在匹配的 DNS 请求进入内部解析器后，**虚拟地址映射**（Fake-IP）可以先返回域名关联的虚拟映射地址，而不必在这个响应阶段取得真实目标 IP。这一思路在原型上可追溯至 RFC 3089 提出的应用层虚拟地址映射机制[^fakeip-rfc]，Mihomo 官方配置示例则借用 RFC 2544 预留的基准测试网段 `198.18.0.0/15`（具体默认配置如 `198.18.0.1/16`）作为地址池；它属于特殊用途地址空间，并不是网站真实的公网地址[^3][^fakeip-rfc]。

应用连接映射地址，流量再进入代理时，内核可通过映射关系恢复域名。随后是否需要本地真实解析，仍取决于规则和出站：若二者都不要求本地目标 IP，可以把域名交给远端；若目标 IP 规则、直连或特定出站要求真实 IP，则仍需在相应阶段查询。

```mermaid title="Fake-IP 从 DNS 映射到域名出站的闭环" description="限定 DNS 请求进入内部解析器、应用连接对应 Fake-IP 且路由将其送入 TUN 的情形。DNS 模块与 TUN 处理侧属于同一个 Mihomo，共享映射状态；此处选择无需本地目标 IP 的域名规则及支持域名的远端出站。远端再解析目标并连接源站，DIRECT、IP 规则和不支持域名的出站另有路径。箭头表示逻辑交付顺序，不按耗时绘制，也不表示本地 TCP 包原样穿过全部连接。"
sequenceDiagram
 participant App as 应用
 participant DNS as Mihomo DNS
 participant Kernel as 内核
 participant Inbound as TUN 与代理核心
 participant Node as 远端代理节点
 participant Target as 目标服务
 App-->>DNS: 查询 example.com 的 A 记录
 Note over DNS,Inbound: 写入共享映射<br/>198.18.0.8 ↔ example.com
 DNS->>App: 返回 198.18.0.8
 App->>Kernel: 连接 198.18.0.8:443
 Kernel->>Inbound: 路由选中 TUN，交付 IP 包
 Note over Inbound: 查映射恢复 example.com，DOMAIN-SUFFIX 规则选择远端出站
 Inbound->>Node: 通过支持域名的出站协议<br/>提交 example.com:443
 Note over Node: 按节点环境解析真实目标地址
 Node->>Target: 建立独立的目标连接
 Target->>Node: 返回响应
 Node->>Inbound: 通过对应代理会话返回
 Inbound->>Kernel: 按应用侧状态写回 IP 包
 Kernel->>App: 交付响应字节
```

需要分开看三类解析对象[^3]：

| 解析对象 | 相关配置职责 |
| --- | --- |
| 网站目标域名 | `nameserver-policy`、`nameserver`、`fallback`，DIRECT 可采用 `direct-nameserver` |
| 代理节点自身域名 | `proxy-server-nameserver`，未设置时按文档回退到其他解析配置 |
| DNS 服务自身域名 | `default-nameserver` 负责引导，避免解析器地址也依赖尚未建立的解析路径 |

`direct-nameserver` 未设置时也会有文档规定的回退路径，不能写成“DIRECT 只能使用这一项”。第五篇的[DNS 引导与解析路径](/posts/networking/dns-resolution-caching-encrypted-queries/)说明了这些依赖为什么可能绕成环。

`dns-hijack` 把匹配的 DNS 连接送进内部模块，不是所有名称解析的总开关：普通 `any:53` 写法默认匹配 UDP，TCP 需要相应配置；浏览器 DoH 等加密 DNS 也不能仅凭端口 53 的规则接管。macOS、Windows 的局域网 DNS 劫持还存在文档列出的限制[^4]。因此，`dig @某服务器` 只指定了请求的表面目的地址，不能单凭参数证明实际处理者。

### 映射没有命中时怎么办

成功路径要求 DNS 应答、Fake-IP 映射与 TUN 接管保持一致。下面从“代理已收到连接”开始分支；如果应用流量根本没有进入代理，应先检查路由，而不是在规则引擎里寻找原因。

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
| 代理重启或映射被清理，应用仍缓存 Fake-IP | 虚拟地址到原域名的可用映射 | 对照 DNS 回答时间、映射持久化和连接日志；不能向公网连接该地址 |
| 应用自行使用 DoH，绕过内部 DNS | DNS 阶段的 Fake-IP 关联 | 检查应用 DNS 设置与实际收到的真实 IP；端口 53 劫持不覆盖 DoH |
| 应用直接使用 IP 或自定义加密协议 | 原始域名或可识别元数据 | 按 IP、进程等规则验证，不能凭 IP 断言唯一域名 |
| TLS / QUIC 使用 ECH | 真实的内部 SNI | 外层公开名不能冒充真实目标名；其他已知映射仍可独立使用 |
| IPv4 被接管，IPv6 地址或路由未配套 | 另一地址族的接管路径 | 分别核对 A/AAAA、IPv6 路由和代理日志，不能拿 IPv4 成功证明双栈完整 |

持久化映射可减少某些重启场景的失配，却不保证应用缓存与代理状态永远同步。`fake-ip-filter` 命中的域名返回真实地址时，本来就应走真实 IP 的分析路径，而不是当作映射故障[^3]。

### 域名嗅探：读取可见的协议元数据

没有可用 Fake-IP 关联时，**域名嗅探**（domain sniffing）可以从部分协议数据取得目标名[^5]：

- 明文 HTTP 请求中的 `Host`。
- TLS ClientHello 中未被 ECH 隐藏的 SNI。
- QUIC Initial 中可解析的 ClientHello 信息。

这里的“首包”是处理阶段的简称，不保证一个网络包就包含完整字段：TCP 分段、TLS 记录及 QUIC 数据可能需要重组。嗅探也不是对 HTTPS 内容的解密；在[第六篇的 ECH 场景](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello)下，外层信息不能可靠揭示内部目标域名。

:::caution[映射地址与嗅探都有适用条件]
会把解析结果上报给其他设备的应用，可能无法使用仅在本机代理内有意义的 Fake-IP。此时可按 `fake-ip-filter` 及其过滤模式让相关域名返回真实 IP，而不是把整个 DNS 模式都改掉。嗅探则依赖可见且可识别的元数据；硬编码 IP、自定义协议或 ECH 都可能使它无法取得真实域名[^3][^5]。
:::

### 按地址族验证接管与出站

应用可能从系统 DNS 或自带 DoH 得到真实 AAAA，也可能从代理 DNS 得到配置支持的虚拟地址。AAAA 只说明这是 IPv6 形式的结果。内核使用实际目标地址选路，IPv4 的覆盖路由对 IPv6 不生效，双栈竞速还可能改变最终使用的地址族。虚拟地址必须由生成映射的核心恢复目标名，真实地址则依赖独立的域名元数据或 IP 规则[^3][^4]。

```mermaid title="AAAA、IPv6 入站与出站的边界" description="限定应用尝试连接 IPv6 地址；本次选路决定是否进入 TUN。虚线是决策与关联，实线是包或连接数据的交付。代理处理入站后另选真实目标及出站地址族，代理节点本身的解析和选路另计。"
flowchart TB
 dns["应用取得 AAAA"] -.->|实际尝试该地址| route{"IPv6 实际选路"}
 route -->|TUN| tun["内核交付 IPv6 包"]
 route -->|物理接口| native["按系统路由出站"]
 route -.->|无有效路由| stop["本次尝试失败"]
 tun -.->|虚拟地址查映射；真实地址用已有线索| core["核心识别目标并匹配规则"]
 core -->|建立独立出站| out["按可达性与策略使用 IPv4 或 IPv6"]
```

排查意外绕行时，在同一次请求记录实际目标地址、出接口、核心是否记录了该入站，以及代理自己的出站连接。可以用同一域名的 `curl -4` 和 `curl -6` 对照并记录 `remote_ip`，再用[路由查询](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果)和[捕获位置对照](/posts/networking/network-diagnostics-performance-troubleshooting/#https-与代理路径需要另一次捕获)核实。若显式代理在另一端解析目标，curl 的远端地址和地址族选项可能只反映它到代理的连接，两段要分别观察[^curl]。

## 规则引擎、出站与返回路径

在 `rule` 模式下，可以按下面的顺序理解一次处理：

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

代理规则列表通常按书写顺序取首个匹配，和路由表的最长前缀匹配不同。还要检查所选出站是否适用：官方文档指出，UDP 请求命中不支持 UDP 的节点时会继续匹配后续规则，不能把“首条匹配立即停止”写成无条件保证[^6]。

`no-resolve` 也有明确的作用范围：当连接元数据含域名而尚无真实目标 IP 时，目标 IP 类规则可能为匹配而触发解析。给这条规则加 `no-resolve`，只阻止它主动触发这次解析；若之前已经取得 IP，这条规则仍可匹配。后续规则和出站阶段仍可能查询 DNS[^6]。

选中名为 `Proxy` 的策略组不代表一定建立 TLS/QUIC 隧道：`Proxy` 常常只是用户命名，实际行为取决于所选节点。HTTP 出站就有可选的 TLS 配置；其他出站使用的加密机制也各不相同[^http-outbound]。应用的 HTTPS 保护应用与目标 TLS 终止端之间的内容，代理传输的加密则保护其覆盖的代理链路，需要分别判断。

### TUN 代理如何建立出站并交付回包

以一个被 TUN 接管并由本地代理终结的 TCP 流为例。应用侧的 SYN、ACK 与 FIN 由本地连接状态处理，远端连接使用独立的序号空间；这两段 TCP 仍可搬运同一条端到端 TLS 字节流。

```mermaid title="TUN 代理的本地终止与独立出站" description="限定终结应用侧 TCP、直连远端且不解密应用 TLS 的代理实现。控制性选路使用虚线，实线表示包或流数据的交付。代理自己的出站需要适用的绕行策略，包进入同一个 TUN 则是失败分支。"
sequenceDiagram
 participant App as 应用
 participant Kernel as 内核
 participant Tun as TUN
 participant Proxy as 代理核心
 participant Peer as 远端
 App->>Kernel: 写入应用侧 TCP
 Kernel-->>Kernel: 选路命中 TUN
 Kernel->>Tun: 送出应用侧 IP 包
 Tun->>Proxy: 用户态读取
 Note over Proxy: 处理应用侧连接
 Proxy-->>Kernel: 查询自身出站路径
 Note over Kernel,Proxy: 需要选到可用物理出口；再次命中 TUN 则可能回环
 Proxy->>Peer: 独立 TCP，经物理出口发送
 Peer->>Proxy: 出站连接返回字节
 Proxy->>Tun: 生成应用侧回包并写回
 Tun->>Kernel: 作为虚拟接口入站
 Kernel->>App: 交付原连接的响应字节
```

:::important[代理的出站流量需要可用的绕行路径]
如果出站 Socket 产生的流量又被送回同一个 TUN 入口，可能形成回环。常见处理包括为远端端点配置更具体路由、使用 socket 标记配合策略路由，或按平台能力绑定接口、排除进程。它们的效果取决于平台和整套规则；“绑定物理网卡”不能脱离实际查表结果被当作统一的绕过保证。
:::

## 实验：用 Go 实现最小 HTTP CONNECT 代理

### Go 示例：保留预读数据与两个方向的结束状态

下面的教学代理只监听回环地址。它先读取 CONNECT 头部，再建立目标 TCP 连接，随后双向复制。错误响应共用一个格式化函数，状态行之后的字段从行首开始，并以空行结束字段区[^http-wire]。这里保留 `bufio.Reader`，因为 HTTP 解析器可能已经从连接预读了后续字节；转发时跳回原始连接会漏掉 reader 中尚未消费的数据。

两个方向也有独立生命周期：某方向正常读到 EOF 后，对另一连接执行 `CloseWrite`，继续等待反向复制；出错时关闭两端以解除另一个阻塞的复制，再收束两个 goroutine。为使实验有结束边界，头部读取与建连各有 5 秒期限。错误响应另有一秒写入期限，以免建连耗尽时间时无法尝试返回 502；转发阶段采用 30 秒的绝对期限。`SetDeadline` 不是自动续期的空闲超时[^go-net][^go-http]。

```go
package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
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
		return
	}
	if req.Method != http.MethodConnect {
		writeError(client, http.StatusMethodNotAllowed)
		return
	}
	if _, _, err := net.SplitHostPort(req.Host); err != nil {
		writeError(client, http.StatusBadRequest)
		return
	}

	conn, err := net.DialTimeout("tcp", req.Host, 5*time.Second)
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

	for range 2 {
		if err := <-done; err != nil {
			log.Printf("relay ended: %v", err)
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

将上面的程序保存为 `connect_proxy.go`，在该文件所在目录打开本机终端，用 Go 1.22 或更新版本运行 `go run connect_proxy.go`。保持代理运行，再在另一终端执行下面的回环验证。

先做不访问外网的回环验证（Python 3.8 或更新版本）：在另一终端把下面的完整程序保存为 `connect_local_check.py`，运行 `python3 connect_local_check.py`。这里用 Python 标准库同时创建一次性目标服务和客户端，避免另外部署 Web 服务；目标地址是动态分配的 `127.0.0.1` 端口，CONNECT 也只传这个数字地址，不需要 DNS。

```python
import socket
from concurrent.futures import ThreadPoolExecutor

PAYLOAD = b"first-frame|second-frame"
RESPONSE = b"response after EOF"


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
target received 24 bytes, then EOF
client received: response after EOF
```

客户端把 CONNECT 头与首段载荷放在同一次 `sendall` 中，再关闭写方向；即使头部解析已经预读载荷，代理也必须继续使用同一个 reader。这个验证检查目标收到完整字节、收到 EOF 后客户端仍能得到反向响应；一次运行不保证每次都会触发预读，也不证明两段连接使用相同分包。验证结束后，在代理终端按 Ctrl+C 停止监听。

:::warning[教学代理的使用范围]
这个程序只用于本机实验，未实现认证、目标访问控制、头部大小限制、并发配额或完整的服务关停协议。不要将监听地址改为对外开放后直接用于公共服务。30 秒期限也会中止长连接；生产转发器需要根据协议与资源预算设计相应行为。
:::

这里选择等待反向复制，是为了展示第四篇的[半关闭契约](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)。HTTP CONNECT 规范本身另有隧道关闭要求，不能把这段教学代码当成所有 HTTP 代理的完整一致性实现[^1]。

在回环实验中，目标看到的对端是代理的出站 Socket。对照[第三篇的 NAT 映射](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip)，也可以从连接状态判断地址改写和代理重建连接各自发生在哪里。

## 命令行验证：先确认入站，再对照解析位置

前面的回环验证只检查本机字节流转发。下面的 curl 命令还会经代理访问真实网络，需在本机终端与已有代理环境中另行验证；前面的成功输出不能代替实际的分流与 DNS 检查。

### 实验一：观察 HTTP CONNECT

启动前面的教学代理后，在另一终端执行：

```bash frame="code"
curl --noproxy '' --proxy http://127.0.0.1:17890 \
  --connect-timeout 5 --max-time 20 \
  -v --http1.1 https://example.com/ -o /dev/null
```

`--noproxy ''` 避免环境中的绕过列表使本次实验跳过指定代理。日志应先显示连接本地代理，再发送 `CONNECT example.com:443`，收到成功响应后才开始目标 TLS 握手。先区分失败发生在代理 TCP、CONNECT 协商、目标 TLS 还是 HTTP 响应；只看到代理端口连接成功并不能证明整条访问成功[^curl]。

也可以使用已有 HTTP/SOCKS mixed 监听端口重复实验，但要用实际监听地址替换 `17890`，并确认代理日志中的入站与出站。教学程序只支持 CONNECT，不支持 SOCKS5。

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

[^1]: 〔RFC〕[RFC 9110 §9.3.6, CONNECT](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)——CONNECT 目标、成功响应后的隧道语义与连接关闭要求。

[^2]: 〔RFC〕[RFC 1928 §3–7](https://www.rfc-editor.org/rfc/rfc1928.html#section-3)——SOCKS5 方法协商、目标地址类型、TCP 连接与 UDP 中继。

[^go-net]: 〔软件实现〕[Go `TCPConn.CloseWrite`](https://pkg.go.dev/net#TCPConn.CloseWrite)、[`Conn.SetDeadline`](https://pkg.go.dev/net#Conn)、[`DialTimeout`](https://pkg.go.dev/net#DialTimeout)——关闭写方向、绝对读写期限及含 DNS 阶段的建连超时。

[^go-http]: 〔软件实现〕[Go `http.ReadRequest`](https://pkg.go.dev/net/http#ReadRequest)与[`bufio.Reader`](https://pkg.go.dev/bufio#Reader)——从缓冲 reader 解析 HTTP 请求及 reader 的预读边界。

[^mode]: 〔软件实现〕[Mihomo：运行模式](https://wiki.metacubex.one/config/general/#_4)——`rule`、`global`、`direct` 的出站选择职责。

[^3]: 〔软件实现〕[Mihomo：DNS 配置](https://wiki.metacubex.one/config/dns/)——Fake-IP、过滤模式、目标解析、直连解析、节点解析与 DNS 服务的引导解析。

[^fakeip-rfc]: 〔RFC〕[RFC 3089: A SOCKS-based IPv6/IPv4 Gateway Mechanism](https://www.rfc-editor.org/rfc/rfc3089.html)与[RFC 2544: Benchmarking Methodology for Network Interconnect Devices](https://www.rfc-editor.org/rfc/rfc2544.html)——前者提出用虚拟地址映射域名实现透明接管的原型思路，后者定义了常被代理软件借用作 Fake-IP 地址池的 `198.18.0.0/15` 基准测试网段。

[^4]: 〔软件实现〕[Mihomo：TUN 入站](https://wiki.metacubex.one/config/inbound/tun/)——协议栈选项、自动路由、排除地址及 DNS 劫持的平台边界。

[^5]: 〔软件实现〕[Mihomo：域名嗅探](https://wiki.metacubex.one/config/sniff/)——HTTP、TLS、QUIC 嗅探与目标覆盖配置。

[^6]: 〔软件实现〕[Mihomo：路由规则](https://wiki.metacubex.one/config/rules/)——顺序匹配、UDP 出站能力例外及 `no-resolve` 的作用范围。

[^http-outbound]: 〔软件实现〕[Mihomo：HTTP 出站](https://wiki.metacubex.one/config/proxies/http/)——HTTP 代理出站的 TLS 是独立可选配置。

[^curl]: 〔工具文档〕[curl 官方手册](https://curl.se/docs/manpage.html#--proxy)——HTTP 代理、SOCKS5/SOCKS5H 解析位置与 `--noproxy`；实验还需按本机 `curl --version` 确认功能。

[^version]: 〔软件实现〕[Mihomo v1.19.34 发布页](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.34)与[该版本配置类型](https://pkg.go.dev/github.com/metacubex/mihomo@v1.19.34/config)——固定本文配置字段的版本基线；平台行为另按各项官方文档及本机实际结果核对。

[^transparent]: 〔平台与实现〕[Linux Kernel: Transparent proxy support](https://docs.kernel.org/networking/tproxy.html)——REDIRECT 的目的地址改写局限、TPROXY 与策略路由及 IP_TRANSPARENT 的配合；Mihomo 的入口字段另见[官方监听器文档](https://wiki.metacubex.one/config/inbound/listeners/)。

[^http-wire]: 〔RFC〕[RFC 9112 §2.1、§5](https://www.rfc-editor.org/rfc/rfc9112.html#section-2.1)——HTTP/1.1 起始行、字段行与空行的消息定界。

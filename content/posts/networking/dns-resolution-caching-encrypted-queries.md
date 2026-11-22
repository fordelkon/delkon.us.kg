---
title: "计算机网络（五）：DNS 解析、缓存层级与加密查询"
description: "从资源记录与递归查询理解域名解析，区分缓存、名字不存在与解析失败，解释 DNSSEC、加密 DNS 和引导解析的边界，并用 dig 对照系统解析路径。"
publishDate: "21 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（四）：TCP、UDP、QUIC 与 Socket 接口》](/posts/networking/transport-tcp-udp-socket-quic/)解释了字节流与数据报怎样交付给通信端点。但应用发起连接时，手里通常只有 `example.com` 这样的域名。**域名系统**（Domain Name System，DNS）为通过域名访问服务的应用提供地址及其他连接参数。

本篇从资源记录、解析路径与缓存讲起，再解释怎样验证答案、保护查询，以及应用如何使用返回的地址。排查时可以依次核对查询类型、实际解析器、响应状态和连接目标。HTTP、TLS 与 QUIC 的连接细节在[下一篇](/posts/networking/http-evolution-tls-handshake-https/)继续解释。

## 域名空间与常见资源记录

DNS 是按名字分层管理的分布式数据库。一个**完全限定域名**（Fully Qualified Domain Name，FQDN）从右向左逐级细分：最右侧的根 `.` 之下是**顶级域**（Top-Level Domain，TLD，如 `.com`、`.org`），再往下是 `example.com` 与 `www.example.com`。域名的层级不等于每一级都有独立服务器；管理者通过**区域**（zone）与委派划分权威数据的责任[^1]。

DNS 查询按**资源记录**（Resource Record，RR）类型返回不同用途的数据[^1]：

| 记录类型 | 含义与作用 | 需要区分的细节 |
| --- | --- | --- |
| `A` | IPv4 地址 | 一个名字可以返回多个地址 |
| `AAAA` | IPv6 地址 | 双栈客户端可以同时或相近时间查询 `A` 与 `AAAA` |
| `CNAME` | 给整个 DNS 名字设置别名 | 除查询 `CNAME` 本身外，通常沿目标名继续查原类型；不能与同名 `SOA`、`NS` 共存，故区域顶点（zone apex）不能直接配 `CNAME`[^1] |
| `NS` | 某区域的权威域名服务器 | 用于区域权威声明与逐级委派 |
| `TXT` | 文本数据 | 常用于域名验证、SPF 和 DKIM 等应用 |
| `HTTPS` / `SVCB` | **服务绑定记录**（service binding record） | 优先级为 `0` 是 AliasMode，正数是 ServiceMode；AliasMode 只改变服务绑定的查询目标，可以与同名 `A` / `AAAA` 共存[^6] |

例如，区域顶点的 `example.com. HTTPS 0 svc.example.net.` 告诉支持 AliasMode 的客户端去查 `svc.example.net.` 的 `HTTPS` 记录，不会把 `example.com.` 的 `A` / `AAAA` 查询也改写到那里。若随后得到 `svc.example.net. HTTPS 1 edge.example.net. alpn="h3,h2"`，这条 ServiceMode 记录才给出了候选连接端点 `edge.example.net.` 及其参数。地址通常来自端点名的 `A` / `AAAA`；`ipv4hint` / `ipv6hint` 可在地址记录尚未取得时提供尝试连接的地址，但不代替地址记录。连到这个端点时，TLS 仍须验证原服务名 `example.com`，而不是改用端点名[^6]。

`HTTPS` 是独立的查询类型，不是 `A` / `AAAA` 应答中的固定字段。ServiceMode 可以通告**应用层协议协商**（Application-Layer Protocol Negotiation，ALPN）候选、端口、地址提示和 `ech` 等参数，不要求每项都出现。通告 `h3` 帮助客户端发现 HTTP/3 端点，实际仍需另建 QUIC 连接并在握手中协商；HTTP 也可通过 `Alt-Svc` 通告 HTTP/3 服务[^6][^http3]。`ech` 则按 RFC 9848 分发**加密客户端问候**（Encrypted ClientHello，ECH）所需的 `ECHConfigList`，实际加密机制见[下一篇的 ECH 说明](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello)[^ech-dns][^ech-tls]。

这里要区分发现和握手。支持 ECH、原本允许绕过服务绑定记录直连的客户端，如果服务绑定解析成功且所有备选端点都带 `ech`，就必须改为依赖这些端点；全部连接失败时，不能再绕过记录直接连接。没有 `HTTPS` 记录不等于这种情况。若 DNS 响应受密码学保护，服务绑定解析却因认证失败、`SERVFAIL`、传输错误或超时未完成，RFC 9460 建议放弃此次连接，而不是把失败当成“没有记录”[^ech-dns][^6]。

如果已经发送 ECH 但在 TLS 握手中被拒绝，客户端不能用那条连接发送应用数据。公开名认证和握手成功后，可以按规范用新连接重试，包括使用更新配置，或在确认服务端已安全禁用 ECH 时禁用 ECH 重试[^ech-tls]。

## 递归与迭代：一次查询如何穿越层级

### 解析器角色与委派路径

应用通常把查询交给系统服务或浏览器内置解析器，而不直接询问根服务器。先区分三个角色：

- **存根解析器**（Stub Resolver）：把查询交给配置好的递归解析器；系统实现还可能综合静态映射、缓存与不同网络的解析策略。
- **递归解析器**（Recursive Resolver）：使用缓存并按需要向其他服务器发起迭代查询，最终返回答案或失败状态[^1]。运营商 DNS 与公共 DNS 都可以承担这一职责。
- **权威名称服务器**（Authoritative Name Server）：提供某个区域的权威数据。根区服务由多个标识及其分布式实例提供；此图把它们抽象为一个角色。

存根设置 `RD=1` 请求递归服务：由提供该服务的解析器负责返回最终结果或失败，不把下一站留给存根。递归器可以直接用缓存回答；答案未命中但有可用的缓存委派时，则从最接近目标的已知区域开始补查。下面假设两种缓存都没命中，所以从根开始。图中 `198.51.100.20` 是文档地址，不是实时解析结果[^1]。

```mermaid title="一次未命中缓存的 DNS 查询" description="从上到下读。本例没有可用的答案或委派缓存，递归器从根开始迭代查询。根与 .com 只返回下一站，递归器自己发起下一次查询；它们并不转发存根的原请求。每次都查询 example.com. 的 A 记录，省略查询名最小化、别名、失败和地址补查。"
sequenceDiagram
 participant S as 存根
 participant R as 递归器
 participant Root as 根
 participant TLD as .com
 participant Auth as 目标权威
 S->>R: 查询 A · RD=1
 R->>Root: 查询 A · RD=0
 Root->>R: .com 委派（NS）
 R->>TLD: 查询 A · RD=0
 TLD->>R: example.com 委派（NS）
 R->>Auth: 查询 A · RD=0
 Auth->>R: A = 198.51.100.20
 R->>S: A = 198.51.100.20
```

**委派应答**（referral）不是所求记录的最终答案：权威段的 `NS` 告诉递归器下一站问谁，它再向其中一台服务器发出非递归查询（`RD=0`）。若附加段已提供下一站所需的地址，就可以少做地址查询。父区随委派提供的名称服务器地址称为**胶水记录**（glue）；例如 `example.com` 的名称服务器是 `ns.example.com` 时，胶水可打破“必须先联系子区才能查到子区服务器地址”的循环。不是附加段中的所有地址记录都是胶水[^1][^glue]。

实现**查询名最小化**（QNAME Minimisation）的递归解析器通常只把足以取得下一次委派的名字交给上级权威服务器，而不是逐级发送完整查询名。例如查询 `www.example.com. A` 时，它可以先向根查询 `com.`，再向 `.com` 查询 `example.com.`，到负责目标记录的权威端才查完整名字。存根发给递归解析器的查询并不因此缩短，这也不是通道加密[^qname-min]。

## DNS 查询的报文与传输

### 把查询过程展开成实际报文

用一个已配置往返路由、没有 NAT 或透明接管的实验网络看具体字段。递归器已经取得委派信息，只需向权威服务器补查 `example.com. A`。权威地址 `203.0.113.53` 与答案 `198.51.100.20` 都使用文档地址。

本例选用 UDP，客户端源端口分别为 `53001` 和 `54002`，DNS 服务端口为 `53`。DNS 头中的 `ID` 标识一次查询，`QR=0` 表示查询、`QR=1` 表示响应；响应复制对应查询的 ID，问题段说明在查哪个名字、哪种记录[^dns-message]：

表中 `S` 是存根（`192.168.1.10`），`R` 是递归解析器（`192.168.1.53`），`A` 是权威服务器（`203.0.113.53`）。

| 顺序 | UDP 源 → 目的 | DNS 头 |
| --- | --- | --- |
| 1. 存根查询 | `S:53001 → R:53` | `ID=0x1201`，`QR=0, RD=1` |
| 2. 递归器查询 | `R:54002 → A:53` | `ID=0x8a30`，`QR=0, RD=0` |
| 3. 权威应答 | `A:53 → R:54002` | `ID=0x8a30`，`QR=1` |
| 4. 递归器应答 | `R:53 → S:53001` | `ID=0x1201`，`QR=1` |

两次查询都是 `example.com. IN A`。本例的两次应答都给出 `198.51.100.20`，记录 TTL 为 300 秒。

递归器在这里接收并解释 DNS 消息，再用自己的地址、源端口与事务 ID 发起上游查询；它没有把存根的原 IP 包原样送到权威端。本例为便于区分选了两个不同 ID，协议并不要求两段 ID 必须不同。缓存命中时，中间这对上游报文可以完全不出现；返回的记录 TTL 还会受缓存剩余期限等条件影响。

### UDP DNS 查询的报文布局

把上表第 1 行展开成客户端在以太网口发出的帧。本例是一条无 EDNS 的 `example.com. IN A` 查询。UDP 头里的端口用于交付数据报，DNS 头里的事务 ID 用于把应答对应到查询[^dns-message]。

```mermaid title="一条 DNS 查询怎样装进 UDP 数据报" description="外层以太网承载 IPv4。IPv4 用 Protocol=17 标识 UDP，UDP 载荷是一条 DNS 查询消息。DNS 头下面只有一个问题，答案、权威和附加记录计数为零。图只列关键字段，省略链路层填充和 FCS。"
flowchart TB
 subgraph frame[Ethernet II 帧]
  eth["帧头 · EtherType=0x0800"]
  subgraph ip[IPv4 包]
   ip_header["IPv4 头 · Protocol=17<br/>源：192.168.1.10<br/>目的：192.168.1.53"]
   subgraph udp[UDP 数据报]
    udp_header["UDP 头 · 53001 → 53<br/>长度 · 校验和"]
    subgraph dns[DNS 查询消息]
     dns_header["DNS 头 · ID=0x1201<br/>QR=0 · RD=1<br/>QDCOUNT=1"]
     question["问题段<br/>example.com. · A · IN"]
     dns_header --- question
    end
    udp_header --- dns_header
   end
   ip_header --- udp_header
  end
  eth --- ip_header
 end
 linkStyle default stroke:none
```

### DNS 的 UDP 大小限制与 TCP 回退

传统 DNS over UDP 未使用 EDNS 时的消息上限为 512 字节。请求方可在 **DNS 扩展机制**（extension mechanisms for DNS，EDNS(0)）的 `OPT` 伪记录中声明可接收的 UDP 载荷大小。声明值反映接收能力，实际请求还应考虑路径 MTU 与分片。若响应不能完整装入可用的 UDP 大小，服务端可用 `TC=1` 表示截断，请求方可通过 TCP 重新取得完整答案。通用 DNS 实现须支持 UDP 与 TCP，TCP 也可直接使用或复用已有连接[^edns][^dns-tcp]。

## 缓存、TTL 与错误结果

### 缓存层级与 TTL

浏览器、系统服务、路由器转发器和递归解析器都可能缓存结果，但它们不一定全部出现在同一条查询路径上。浏览器内置 DoH 可能绕过系统解析服务；`/etc/hosts` 是本地静态映射，也不能直接当作遵循 DNS TTL 的缓存。

```mermaid title="解析路径决定会访问哪些缓存" description="应用、系统服务或本地转发器可在本地作答；向上游发查询的箭头只画这些节点未能直接作答的情况。到达递归器后，可用缓存结果直接返回；只有需要补查时才开始迭代。上游给出下一次委派时，递归器继续查，不把委派作为最终结果。省略别名追踪与重试。"
flowchart TB
 app["应用或浏览器<br/>先检查自身可用缓存"] --> path{"本次解析路径"}
 path -->|系统接口| system["系统解析服务<br/>静态映射、缓存与网络策略"]
 system --> local["可选本地 DNS 转发器<br/>可能另有缓存"]
 system -->|直接配置递归服务| recursive{"递归器有可用的缓存结果？"}
 local --> recursive
 path -->|浏览器内置 DoH| doh["浏览器选定的 DoH 服务<br/>可能绕过系统解析缓存"]
 doh --> recursive
 recursive -->|有| reply["向请求方返回结果"]
 recursive -->|需要补查| query["从最近的可用委派开始<br/>没有则从根开始"]
 query --> iterate["向当前权威发起迭代查询"]
 iterate -->|收到下一站的委派| iterate
 iterate -->|得到最终答案或失败| reply
```

DoH 是服务入口，递归是逻辑职责，两者可以属于同一服务。缓存也可以保存[否定结果或短暂的失败结果](#否定应答解析失败与超时)，不是只有地址才算命中。若只缓存了委派，它能缩短[前面的冷缓存路径](#解析器角色与委派路径)，不能回答存根的问题。观察系统缓存也不能据此判断浏览器内置 DoH 的缓存状态。

DNS 的**生存时间**（Time to Live，TTL，单位秒）用于约束记录的缓存使用时间，与 IP 头中用于限制转发跳数的 TTL 含义不同。重复命中同一份尚未刷新的缓存时，通常能观察到剩余 TTL 下降。预取刷新、公共解析服务的不同缓存后端会改变观察结果；标准还允许在规定条件下暂时提供过期数据（serve stale），因此不能把“TTL 到零”理解成所有实现都必须在这一刻同步查询上游[^stale]。

一条解析路径还可能涉及多个 TTL：别名的 `CNAME`、目标名的 `A` / `AAAA`、单独查询的 `HTTPS` RRset 都有各自的缓存期限。某个地址记录到期，并不自动使相关的全部记录同时到期。下面仅示意同一名字下三类正向记录，不表示客户端必定查询全部类型：

| `example.com.` 的记录类型 | 缓存内容 | 示例剩余 TTL |
| --- | --- | ---: |
| `A` | IPv4 地址 | 60 秒 |
| `AAAA` | IPv6 地址 | 120 秒 |
| `HTTPS` | 服务绑定信息 | 300 秒 |

### 否定应答、解析失败与超时

先检查状态与各段记录，再解释“空答案”：

| 结果 | 表示什么 | 排障时不能推导什么 |
| --- | --- | --- |
| `NXDOMAIN` | 查询的名字不存在；有别名链时需检查最终目标 | 不能只因暂时失败就使用这个结论 |
| `NODATA` | 名字存在，但没有请求类型的数据 | 它不是独立 RCODE；`NOERROR` 且答案为空也可能是委派，应结合权威段的 SOA 与 NS 判断[^negative] |
| `SERVFAIL` | 解析器未能完成查询，如上游失败或 DNSSEC 验证失败 | 不证明名字不存在 |
| 超时 | 在工具的等待预算内没有收到可用响应 | 不证明服务器宕机，也不证明不存在；还可能是路径、过滤或接管问题 |

`NXDOMAIN` 与 `NODATA` 可以执行**否定缓存**（Negative Caching）。按 RFC 2308，携带 SOA 的权威否定应答，其否定缓存 TTL 由 SOA 记录自身 TTL 与 `SOA.MINIMUM` 字段的较小值决定。RFC 9520 另规定递归解析器必须短暂缓存解析失败，避免反复查询失败的上游；再次立即得到 `SERVFAIL`，不证明解析器重新联系过权威服务器。失败缓存与携带 SOA 的否定应答有不同的规则，不能把所有失败都当成“域名不存在”[^negative]。

:::tip[改完记录仍查不到时，先保存完整响应]
用 `dig example.com A` 查看 `status`、`ANSWER`、`AUTHORITY` 和 TTL，再与系统解析结果对照。只使用 `+short` 容易把不存在、没有该类型记录与某些失败都压成一段空输出。清缓存之前先记录证据，也能避免把缓存刷新与其他同时发生的变化混在一起。
:::

## DNS 答案怎样影响连接目标

权威服务器一般能看到向它查询的递归解析器地址。**EDNS 客户端子网**（EDNS Client Subnet，ECS）允许解析器附带客户端地址前缀，可能影响权威端的地域调度；同时也会向更多参与者暴露客户端网络信息。公共解析服务可能使用任播与地域节点，CDN 也可能结合其他信号，不能仅凭公共 DNS 的品牌或注册地断定一定绕路[^ecs]。

DNS 返回多个地址后，怎样选连接是下一阶段的问题。Happy Eyeballs 让支持该机制的客户端按策略安排 IPv6、IPv4 连接尝试，减少一条地址族路径异常造成的等待；它不是 DNS 自动修复地址，也不是保证每次都由 IPv6 或某个固定地址获胜[^happy]。诊断时应把“返回了什么地址”与“实际连上了哪个地址”分开，后者可以在[第八篇的 curl 阶段观察](/posts/networking/network-diagnostics-performance-troubleshooting/#用-curl-记录请求耗时)中继续核对。

## DNSSEC 与加密 DNS：数据认证和通道保密

### DNSSEC 验证数据，不隐藏查询

普通 DNS 报文没有内建的传输保密。递归解析器在接受 UDP 应答前要核对地址、端口、事务 ID 和问题段等字段；事务 ID 相同不代表应答有效[^response-match]。**域名系统安全扩展**（DNS Security Extensions，DNSSEC）增加数据来源认证、完整性保护和经过认证的不存在证明，使验证者能够沿信任链检查签名；它不加密名字或答案[^dnssec]。

客户端若把验证交给递归解析器，还需要信任该解析器及与它之间的通信。`dig +dnssec` 只是置位 `DO`（DNSSEC OK）以请求相关 DNSSEC 数据，本身不等于完成独立验证；`AD`（Authentic Data）是解析器对数据验证结果的声明，不能信任来自未经保护通道的任意一个 `AD` 标志[^dnssec-tools]。

例如，解析器验证 `www.example.com. A` 时，可以从根信任锚出发，沿 `.com` 到 `example.com` 的安全委派逐级验证。每一级先验证父区的 `DS` 记录，用其摘要核对子区的一把 `DNSKEY`，再用这把密钥验证子区的 `DNSKEY` 记录集。最后，用经验证的 `example.com` 密钥检查目标 `A` 记录集的 `RRSIG` 签名。`DS` 负责把信任跨到子区，`RRSIG` 则用于核验记录集的来源和完整性[^dnssec-validation]。

没有安全委派的区域可能被判为 insecure，不等于签名错误；应当能够验证却未能通过验证的 bogus 数据则不能当作正常答案接受。排查 `SERVFAIL` 时应区分签名过期、信任链问题与普通上游超时，不能关闭验证后就宣称域名数据没有问题[^dnssec-validation]。

| 使用方式 | DNS 数据认证与完整性 | 查询通道保密 |
| --- | --- | --- |
| 仅 DNSSEC，且实际完成验证 | 可验证安全委派下的数据与不存在证明 | 不隐藏查询名 |
| 仅 DoT / DoH / DoQ，且认证解析服务 | 保护到该解析服务的通道，不自动验证权威签名 | 保护该段传输，解析器仍知道查询 |
| 两者组合 | 分别满足数据验证与通道认证条件时同时获得两类保护 | 不扩展为全网匿名或解析器不可见 |

### DoT、DoH 与 DoQ 保护查询通道

把传统 DNS 和三种加密方式放在一起对照。加密各行假设客户端认证了所选 DNS 服务，且本次查询未回退到明文；加密只保护实际使用它的链路[^2][^3][^4][^5]。

| 协议 | 从内到外的封装（省略 IP） | 默认端口 | DNS 消息怎样承载 |
| --- | --- | --- | --- |
| 传统 DNS | DNS → UDP 或 TCP | UDP/TCP 53 | UDP 直接承载消息；TCP 使用 2 字节长度前缀；两者都不提供传输加密[^dns-message][^dns-tcp] |
| DoT（DNS over TLS） | DNS → TLS → TCP | TCP 853 | DNS 消息带 2 字节长度前缀[^2] |
| DoH（DNS over HTTPS，经 HTTP/2） | DNS → HTTP/2 → TLS → TCP | TCP 443 | GET 用 `dns` 参数携带 base64url 编码的消息，POST 用二进制请求体[^3] |
| DoH（经 HTTP/3） | DNS → HTTP/3 → QUIC（集成 TLS）→ UDP | UDP 443 | DNS 消息到 HTTP 请求的映射不变，由双方支持并协商 `h3`[^3][^http3] |
| DoQ（DNS over QUIC） | DNS → QUIC（集成 TLS）→ UDP | UDP 853 | 每次查询用独立双向流；DNS 消息带 2 字节长度前缀[^4] |

DoH 用 HTTP 承载查询；DoQ 直接用 QUIC 流，并不经过 HTTP。DoQ 的响应沿发出查询的同一条流返回，靠流匹配而非事务 ID，因此 DNS 报文的 `ID` 置为 `0`[^4]。DoH 使用 443 不保证可达；DoH over HTTP/3 和 DoQ 还依赖 UDP 路径可用。两种 HTTPS 封装的差异见[下一篇的 HTTP/2 与 HTTP/3 应用数据布局](/posts/networking/http-evolution-tls-handshake-https/#http2-与-http3-的应用数据布局)。

- **客户端链路上的旁观者**：无法直接读取加密段中的查询名、类型和答案，但能看到该段的连接地址、端口和流量大小、时序。若加密从本地转发器才开始，前一段的旁观者不受这层保护[^5]。
- **解密查询的转发器或递归解析器**：可以读取收到的查询名、类型和应答，也能看到连接对端的地址；对端不一定是最初的客户端[^5]。
- **权威名称服务器**：只看到实际发给自己的查询。缓存命中可能根本没有这一步，查询名最小化也会改变各级权威收到的名字。通常看到的是递归器的来源地址；[ECS](#dns-答案怎样影响连接目标) 等机制可能另外携带客户端网络前缀。客户端加密到递归器，不会自动加密这些后续查询[^5][^qname-min][^ecs]。

网站连接还要单独判断：未使用 ECH 时，旁观者可能从 TLS 的服务器名称指示（SNI）得到网站域名；即使用了加密 DNS 和 ECH，网站的目标 IP 及流量特征也未因此隐藏，详见[下一篇的可见性边界](/posts/networking/http-evolution-tls-handshake-https/#端到端可见性边界谁能看到什么)。

域名形式的 DoH 服务（如 `https://dns.google/dns-query`）还需要**引导解析**（bootstrap）：客户端必须先有办法取得解析服务自己的地址。地址可以来自既有缓存、预配置 IP、另一套可用解析服务等；不必然要求一次明文查询。取得 IP 后仍需按服务名验证 TLS 身份，不能因为使用预置 IP 就省略认证。

:::important[网站、代理节点与 DNS 服务是三个解析对象]
开启代理后，目标网站、代理节点自身、加密 DNS 服务自身可能分别使用不同的解析路径。Fake-IP 能让代理先返回映射地址，但是否需要本地真实解析仍取决于规则与出站协议。参见[第七篇对这三类解析路径的区分](/posts/networking/proxies-tunnels-transparent-interception/#目标站点代理节点与-dns-服务的解析)：不能把“开了 TUN”当作全部查询都由同一个解析器完成的证据。
:::

## DNS 查询实验与结果判读

以下 `dig`、系统名称服务与 curl 命令会查询实际解析服务或访问外网，应在本机终端运行；在线 Playground 即使允许网络，也使用它自己的解析器与网络路径，不能用来验证你的系统缓存、DNS 接管或 TUN 行为。没有外网实验条件时，可先阅读响应字段和记录类型示例，不把未执行的查询当成实测结果。

### 实验一：对照默认 DNS、指定解析器与系统解析

先用 `dig` 分别向工具默认选用的 DNS 服务器和显式指定的递归服务器查询同一个 `A` 记录，比较完整响应中的 `SERVER`、状态码和答案：

```bash frame="code"
dig +time=2 +tries=1 example.com A
dig +time=2 +tries=1 @1.1.1.1 example.com A
```

然后对照操作系统的名称服务结果。macOS 可运行：

```bash frame="code"
dscacheutil -q host -a name example.com
```

Linux 按实际配置选用 `resolvectl query example.com` 或 `getent ahosts example.com`。Windows 的 `Resolve-DnsName`、本地缓存和其他平台对应命令见[第八篇的平台对照](/posts/networking/network-diagnostics-performance-troubleshooting/#平台命令对照)。系统名称服务可能综合静态映射、缓存和按网络选择的解析策略。再用 `curl -v --noproxy '*' https://example.com/ -o /dev/null` 对照 curl 得到的解析结果和实际连接地址。浏览器内置 DoH 仍可能形成另一条路径。

### 实验二：追踪独立的委派查询

先记录工具版本，再执行有界等待的查询：

```bash frame="code"
dig -v
dig +time=2 +tries=1 +trace example.com A
```

`dig +trace` 起步通常先向默认解析器或 `@server` 指定的解析器查询根区 NS，然后自行跟随根、顶级域、权威服务器的委派。`@server` 只控制这次根 NS 查询的去处，不把所有后续查询交给该解析器。缺失服务器地址时，`dig` 还可能借助本地配置的解析器补查。这不是浏览器使用的解析路径[^dig-trace]。

观察每段末尾的 `Received ... from ...`，判断该步使用的服务器地址。若无可用的 IPv6 出口，可加 `-4` 用 IPv4 传输重跑，例如 `dig -4 +time=2 +tries=1 +trace example.com A`；`-4` 限制的是查询发往服务器的传输地址族，不是查询的记录类型[^dig-manual]。若第一段根 NS 就失败，只能说明这次引导未完成；若在后续某段超时，应保存该段信息，不能把一条受限网络中的失败 trace 写成域名坏了。

### 实验三：对照记录类型与 TTL

```bash frame="code"
dig +time=2 +tries=1 @1.1.1.1 example.com A
dig +time=2 +tries=1 @1.1.1.1 example.com A
dig +time=2 +tries=1 @1.1.1.1 cloudflare.com TYPE65
```

前两条比较答案与剩余 TTL；只有命中同一份未刷新缓存时，才适合用“TTL 随时间下降”解释。查询耗时还包含网络往返等因素，不能保证第二次一定更快。第三条使用 `HTTPS` 的数字类型 `TYPE65`，兼容 DiG 9.10.6 等不识别 `HTTPS` 类型名称的旧版本；支持名称的新版也可写 `HTTPS`。旧工具可能只显示通用编码，不能要求一定打印 `alpn="h3,h2"`。

对照别名和服务绑定时，分别执行 `dig www.example.com CNAME`、`dig www.example.com A` 与 `dig www.example.com TYPE65`。若返回 CNAME，沿目标名继续检查所需记录类型。HTTPS 记录中的 AliasMode 与 ServiceMode 应按其优先级和参数区分；未配置这两类记录的名字可只返回空答案，实验不依赖样例域名的实时结果[^1][^6]。

### 判读边界：TUN 与 DNS 接管

`SERVER` 显示 `dig` 看到的交互端点。端口 53 被透明重定向时，还需确认实际处理查询的服务。启用 TUN 与 DNS 接管时，可能遇到下面这些结果：

| 操作 | 可能出现的结果 | 怎样解释 |
| --- | --- | --- |
| 默认解析与 `@1.1.1.1` 查询 `example.com A` | 都返回 `198.18.0.79`，TTL 为 1 | 取得的是映射答案，不能用于验证公开权威记录或公共缓存 TTL |
| `dig +trace` | 首段有根 NS；后续标注根服务器名字的响应直接返回映射地址 | 输出受接管影响，不能证明查询完整经过根、顶级域与权威服务器 |
| `cloudflare.com TYPE65` | `NOERROR`，答案与权威段均为空 | 查询路径没有提供 HTTPS 记录，但信息不足以证明权威端的 NODATA |
| 查询到 `1.1.1.1` 的路由 | 出接口为 `utun` | 指定公共服务器地址仍经过虚拟接口，不能据此认定绕过了接管 |

验证真实迭代与公共缓存时，需要先确认查询路径未被透明重定向。否则，命令执行成功也不能证明结果来自指定的公网服务器。

:::caution[指定 `@1.1.1.1` 不证明查询到达了它]
`dig` 不走系统名称服务的完整处理链，因此适合对照 hosts、系统缓存与 DNS 响应。但它发出的 53 端口流量仍可能被路由、透明重定向或 Mihomo 的 DNS 接管处理。命令中的目标与实际处理者应结合抓包和代理日志核对；`--noproxy '*'` 同样只排除 curl 的显式代理，不绕过 TUN 路由。
:::

## 总结

DNS 的输出是带类型、状态与缓存条件的记录，不只是一个 IP。排障先区分名字不存在、没有所需类型、解析失败与没有收到响应，再确认查询经过了哪些缓存和解析器。

取得连接参数后，还需要验证对端身份并交换应用消息。下一篇[《计算机网络（六）：HTTP 演进、TLS 握手与加密边界》](/posts/networking/http-evolution-tls-handshake-https/)继续解释 HTTP 的连接复用、TLS 的身份校验，以及代理与旁观者分别能看到什么。

## 延伸阅读

- [RFC 9499: DNS Terminology](https://www.rfc-editor.org/rfc/rfc9499.html)——系统核对存根、递归、权威、区域与胶水等术语
- [BIND 9: dig 手册](https://bind9.readthedocs.io/en/stable/manpages.html#dig-dns-lookup-utility)——按所用版本核对查询选项、显示格式与类型支持

[^1]: 〔RFC〕[RFC 1034 §3](https://www.rfc-editor.org/rfc/rfc1034.html#section-3)讨论域名空间与资源记录，[§3.6.2](https://www.rfc-editor.org/rfc/rfc1034.html#section-3.6.2)定义 CNAME，[§4.3.1–§4.3.2](https://www.rfc-editor.org/rfc/rfc1034.html#section-4.3.1)区分递归应答与委派，[§5.3.3](https://www.rfc-editor.org/rfc/rfc1034.html#section-5.3.3)说明怎样使用缓存和逐级查询；资源记录格式见 [RFC 1035 §3.2](https://www.rfc-editor.org/rfc/rfc1035.html#section-3.2)。

[^2]: 〔RFC〕[RFC 7858 §3](https://www.rfc-editor.org/rfc/rfc7858.html#section-3)——DoT 的 TLS 连接、TCP/853 与 DNS 消息长度前缀

[^3]: 〔RFC〕[RFC 8484 §4](https://www.rfc-editor.org/rfc/rfc8484.html#section-4)与[§6](https://www.rfc-editor.org/rfc/rfc8484.html#section-6)定义 DNS 消息到 HTTPS 的映射及 `application/dns-message` 格式；[§5.2](https://www.rfc-editor.org/rfc/rfc8484.html#section-5.2)推荐至少使用 HTTP/2。

[^4]: 〔RFC〕[RFC 9250 §4.1–§4.2.1](https://www.rfc-editor.org/rfc/rfc9250.html#section-4.1)——DoQ 的默认端口、独立流、两字节长度前缀与 DNS 消息 ID 规则。

[^5]: 〔RFC〕[RFC 9076 §5](https://www.rfc-editor.org/rfc/rfc9076.html#section-5)讨论链路观察者与加密边界，[§6](https://www.rfc-editor.org/rfc/rfc9076.html#section-6)区分递归与权威服务器的可见性，[§7.1](https://www.rfc-editor.org/rfc/rfc9076.html#section-7.1)讨论元数据关联风险。

[^6]: 〔RFC〕[RFC 9460 §2.4](https://www.rfc-editor.org/rfc/rfc9460.html#section-2.4)区分 AliasMode 与 ServiceMode，[§3–§3.1](https://www.rfc-editor.org/rfc/rfc9460.html#section-3)说明端点选择与失败处理，[§7](https://www.rfc-editor.org/rfc/rfc9460.html#section-7)定义 ALPN、端口、地址提示等服务参数，[§9.4](https://www.rfc-editor.org/rfc/rfc9460.html#section-9.4)保留原始服务身份，[§10.4.2](https://www.rfc-editor.org/rfc/rfc9460.html#section-10.4.2)给出区域顶点别名与地址记录共存的示例。

[^ech-dns]: 〔RFC〕[RFC 9848 §3、§5.1](https://www.rfc-editor.org/rfc/rfc9848.html#section-3)——`ech` 携带 `ECHConfigList`，且在解析成功、所有备选端点均含 `ech` 时禁止绕过服务绑定直接回退。

[^ech-tls]: 〔RFC〕[RFC 9849 §6.1.6–§6.1.7](https://www.rfc-editor.org/rfc/rfc9849.html#section-6.1.6)——ECH 被拒绝后的公开名认证、错误条件和用新连接重试的规则。

[^http3]: 〔RFC〕[RFC 9114 §3.1](https://www.rfc-editor.org/rfc/rfc9114.html#section-3.1)——HTTP/3 端点发现、替代服务与后续 QUIC 连接；HTTPS 记录通告 `h3` 的具体示例见[RFC 9460 §10.4.1](https://www.rfc-editor.org/rfc/rfc9460.html#section-10.4.1)

[^dns-message]: 〔RFC〕[RFC 1035 §4.1.1–§4.1.3、§4.2.1](https://www.rfc-editor.org/rfc/rfc1035.html#section-4.1.1)——DNS 头中的 ID、QR、RD，问题段与资源记录格式，以及 UDP 服务端口 53。

[^glue]: 〔RFC〕[RFC 9471 §2.1–§2.3](https://www.rfc-editor.org/rfc/rfc9471.html#section-2.1)——委派中的胶水记录、域内与同级名称服务器，以及地址依赖。

[^qname-min]: 〔RFC〕[RFC 9156 §2、§4](https://www.rfc-editor.org/rfc/rfc9156.html#section-2)——查询名最小化的目的、查询名与查询类型选择，以及示例。

[^dns-tcp]: 〔RFC〕[RFC 1035 §4.2.2](https://www.rfc-editor.org/rfc/rfc1035.html#section-4.2.2)定义 DNS 使用 TCP 53 和两字节长度前缀；[RFC 7766 §5–§6](https://www.rfc-editor.org/rfc/rfc7766.html#section-5)说明通用 DNS 对 TCP 的支持要求，以及直接使用与复用 TCP 连接。

[^stale]: 〔RFC〕[RFC 8767 §4](https://www.rfc-editor.org/rfc/rfc8767.html#section-4)——在规定条件下使用过期 DNS 数据；TTL 的通常模型不能包办所有缓存行为

[^negative]: 〔RFC〕[RFC 2308 §2、§3、§5](https://www.rfc-editor.org/rfc/rfc2308.html#section-2)——NXDOMAIN、NODATA 与 SOA 负缓存 TTL；[RFC 9520 §3.2](https://www.rfc-editor.org/rfc/rfc9520.html#section-3.2)另行规定解析失败缓存。

[^ecs]: 〔RFC〕[RFC 7871 §6、§11](https://www.rfc-editor.org/rfc/rfc7871.html#section-6)——ECS 地址前缀、缓存与隐私权衡

[^happy]: 〔RFC〕[RFC 8305 §3–§5](https://www.rfc-editor.org/rfc/rfc8305.html#section-3)——双栈解析、地址排序与连接尝试的调度

[^response-match]: 〔RFC〕[RFC 5452 §9.1](https://www.rfc-editor.org/rfc/rfc5452.html#section-9.1)——解析器接受响应前核对地址、端口、事务 ID、查询名及查询类型和类。

[^dnssec]: 〔RFC〕[RFC 4033 §3、§4、§7](https://www.rfc-editor.org/rfc/rfc4033.html#section-3)——DNSSEC 的数据认证、完整性、不存在证明、非保密性，以及存根对验证解析器的信任。

[^dnssec-tools]: 〔RFC 与工具文档〕[RFC 4035 §4.9.3](https://www.rfc-editor.org/rfc/rfc4035.html#section-4.9.3)——存根如何解释 `AD`；[BIND 9: dig 手册中的 `+dnssec`](https://bind9.readthedocs.io/en/stable/manpages.html#cmdoption-dig-arg-dnssec)说明它只是置位 `DO` 请求 DNSSEC 记录。

[^dnssec-validation]: 〔RFC〕[RFC 4033 §5](https://www.rfc-editor.org/rfc/rfc4033.html#section-5)与[RFC 4035 §5](https://www.rfc-editor.org/rfc/rfc4035.html#section-5)——secure、insecure、bogus 等验证状态，以及 DNSKEY、DS 和 RRSIG 的验证职责。

[^dig-trace]: 〔工具文档〕[ISC: dig and the + trace option](https://kb.isc.org/docs/aa-00208)——起步向所选解析器发现根 NS、随后跟随委派，以及缺失地址时的补充解析。

[^dig-manual]: 〔工具文档〕[BIND 9: dig 手册中的 `-4`](https://bind9.readthedocs.io/en/stable/manpages.html#cmdoption-dig-4)——只使用 IPv4 传输 DNS 查询。

[^edns]: 〔RFC〕[RFC 1035 §4.2.1](https://www.rfc-editor.org/rfc/rfc1035.html#section-4.2.1)与[RFC 6891 §6.2.3–§6.2.5](https://www.rfc-editor.org/rfc/rfc6891.html#section-6.2.3)——传统 UDP 上限、OPT 通告的请求方载荷能力及分片边界。

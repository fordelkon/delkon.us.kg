---
title: "计算机网络（六）：HTTP 演进、TLS 握手与加密边界"
description: "从最小 HTTP 请求与响应理解消息语义，比较 HTTP/1.1、HTTP/2、HTTP/3 的复用边界，拆解 TLS 身份校验、SNI、ALPN 与 ECH，并用 OpenSSL 和 curl 观察连接。"
publishDate: "22 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（五）：DNS 解析、缓存层级与加密查询》](/posts/networking/dns-resolution-caching-encrypted-queries/)解释了如何取得目标地址与连接参数。接下来要分别解决两个问题：应用怎样表达请求与响应，客户端怎样确认通信对端并保护消息。**超文本传输协议**（Hypertext Transfer Protocol，HTTP）规定前者，TLS 为后者提供认证与加密机制。

本篇先读一组最小 HTTP 消息，再比较三个版本怎样复用连接。随后沿 TLS 1.3 握手看客户端怎样验证服务身份，再对照 HTTP/2 和 HTTP/3 在握手和传输应用数据时的线上封装，最后用实验核对协商结果。分清谁能看到什么，也为[第七篇的两段 TCP 与目标 TLS](/posts/networking/proxies-tunnels-transparent-interception/#两段-tcp-与目标-tls)打下基础：代理把传输连接分成两段，不表示应用的 TLS 也在那里终止。

## HTTP 请求、响应与消息语义

### 一组 HTTP 请求与响应

HTTP 的核心语义包括方法、目标资源、状态码、字段与内容。它们与具体版本怎样分帧分别定义，因此换成 HTTP/2 或 HTTP/3 以后，`GET` 与 `404` 的含义仍然成立[^1]。

下面是 HTTP/1.1 的最小交互示意。线上起始行和头字段行以 `CRLF`（`\r\n`）结束，再用一个 `CRLF` 结束消息头。示例响应的正文是 `hello` 加单字节 `LF`（`\n`），共 6 字节；正文不适用消息头的行结束规则[^2]：

```http title="Request"
GET /hello HTTP/1.1
Host: example.com
Accept: text/plain

```

```http title="Response"
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 6

hello
```

`Host` 表示请求指向的主机；路径 `/hello` 标识该主机上的目标资源。`Content-Length` 参与消息定界，不是让 TCP 产生消息边界——[第四篇的 TCP 字节流](/posts/networking/transport-tcp-udp-socket-quic/)仍可能把这一响应交付为多次读取。

| 状态码 | 常见含义 | 读响应时还要看什么 |
| --- | --- | --- |
| `200` | 请求成功 | 方法决定是否有内容，例如 HEAD 不返回响应内容 |
| `301` / `302` | 重定向 | 检查 `Location`；后续请求的方法处理受具体状态与客户端行为影响 |
| `307` / `308` | 临时 / 永久重定向 | 自动跟随时保留原请求方法 |
| `404` | 未找到目标资源 | 说明已拿到 HTTP 响应，不等于 DNS 或 TCP 连接失败 |
| `500` / `502` / `504` | 服务端错误 / 网关收到无效上游响应 / 网关等待上游超时 | 需要结合响应来源及服务日志；状态码不单独定位底层根因 |

重定向意味着客户端还可能访问另一个 URL，形成新的解析、连接或身份校验。`curl` 默认不自动跟随 HTTP 重定向，`-L` 才请求跟随[^curl]；做阶段计时应先确认是否发生重定向，具体方法见[第八篇](/posts/networking/network-diagnostics-performance-troubleshooting/)。

### HTTP 缓存与 Cookie

`Cache-Control: max-age=60` 允许响应在满足其他条件时保持 60 秒新鲜；`no-cache` 要求复用前验证，并不等于禁止存储；`no-store` 才要求缓存不要存储。过期响应若有 `ETag`，客户端可以发送 `If-None-Match`，服务端在条件满足时返回 `304`，复用已有正文。这种条件请求仍然会产生网络交互，应与完全命中本地缓存区分[^cache]。

Cookie 则是 HTTP 层的状态管理：服务端用 `Set-Cookie` 设置，客户端按适用条件在后续请求中发送 `Cookie`，不依赖是否复用了同一条 TCP/TLS 连接。TLS 保护传输，但不能代替 Cookie 的作用域和访问控制；`Secure` 限制安全通道发送，`HttpOnly` 限制脚本读取，都不意味着服务端或 TLS 终止端看不到它[^cookie]。

## HTTP/1.1 到 HTTP/3 的连接与复用

| 协议版本 | 传输与消息组织 | 复用能力 | 遗留边界 |
| --- | --- | --- | --- |
| HTTP/1.1 | TCP，文本消息行与字段 | 默认持久连接；也允许不等前一响应就发下一请求的流水线[^2] | 响应仍须按请求顺序返回，前面的慢响应会阻塞后续响应 |
| HTTP/2 | TCP，二进制帧和流，使用 HPACK 压缩字段[^hpack] | 不同流的帧可交错[^3] | TCP 丢失字节仍会阻止后续字节按序交付，从而影响多个流 |
| HTTP/3 | QUIC / UDP，HTTP 流，使用 QPACK 压缩字段[^4] | 利用 QUIC 流的独立按序交付[^4] | 仍共享路径、连接拥塞控制等资源；头部解码也有自己的依赖 |

HTTP/1.1 的持久连接不需要靠 `Connection: Keep-Alive` 才开启；连接关闭、消息定界和完整消费响应都会影响能否复用。并行建立多少条连接属于客户端策略，不是协议规定固定创建六条。RFC 9113 为 HTTP/2 定义了两种建连方式：对于 `https` URI，通过 TLS 的 ALPN 协商 `h2`；对于明文 TCP，客户端需预先知道服务端支持 HTTP/2，然后直接发送连接前言。这些是协议定义的用法，不代表浏览器必须支持两种方式[^3]。

例如，HTTP/2 的某段 TCP 字节丢失时，即便接收端已经收到后面属于另一条 HTTP/2 流的字节，也必须等缺口补齐才会向上交付。HTTP/3 的顺序约束在各 QUIC 流内：若丢包只让流 A 出现缺口，流 B 已到齐的数据仍可交付；若丢失的 QUIC 包同时携带 A、B 两条流的数据，两条流都可能各自等待重传[^3][^4]。这消除的是 TCP 字节流带来的跨流队头阻塞，不是所有跨流影响：QUIC 仍共享拥塞控制；若头部引用了尚未到达的 QPACK 动态表条目，头部解码仍可能等待[^4]。有些路径还会限制 UDP，因此不能据此保证 HTTP/3 更快。具体传输行为见[第四篇的按流交付与队头阻塞](/posts/networking/transport-tcp-udp-socket-quic/#按流交付与队头阻塞)。

复用决定多个请求如何共用一条连接。对 HTTPS 来说，还要先看客户端怎样确认连接对端的身份，以及双方怎样协商应用协议。

## TLS 1.3 握手：密钥协商、证书校验与 SNI / ALPN

明文 HTTP 的消息可以被路径上的观察者读取和修改。TLS 为通信提供机密性、完整性和对端身份认证机制，但应用必须正确配置并检查身份验证；“用了加密”本身不证明连到了预期服务。

### 握手消息与协议协商

以使用证书认证、没有 HelloRetryRequest 的常见 TLS 1.3 完整握手为例，客户端通常经过一次 TLS 网络往返（1-RTT）后即可发送应用数据；此前的 DNS、TCP 握手不包含在这个 1-RTT 里，重试等条件也可能增加往返[^5]。本例使用**临时椭圆曲线迪菲-赫尔曼密钥交换**（Elliptic Curve Diffie-Hellman Ephemeral，ECDHE），两端在 `ClientHello` 与 `ServerHello` 中用 `key_share` 交换各自的临时公钥，从而获得**前向保密**（Forward Secrecy，FS）。双方在 `ServerHello` 后以**基于 HMAC 的密钥派生函数**（HMAC-based Key Derivation Function，HKDF）从共享秘密导出握手流量密钥。此后，握手消息以**带关联数据的认证加密**（Authenticated Encryption with Associated Data，AEAD）保护[^5]。

```mermaid title="TLS 1.3 完整握手与应用数据" description="示意 TCP 上仅认证服务端的 ECDHE 证书握手，未启用 ECH 或 0-RTT，也没有 HelloRetryRequest。实线为明文 ClientHello、ServerHello；虚线为受保护的消息。花括号内使用握手密钥，应用数据使用应用流量密钥。箭头不对应固定数量的 TCP 报文段或真实耗时；图末画出服务端收到客户端 Finished 后发送数据的情况。"
sequenceDiagram
 participant Client as 客户端
 participant Server as TLS 服务端
 Client->>Server: ClientHello (key_share, SNI, ALPN 候选)
 Server->>Client: ServerHello (key_share)
 Note over Client,Server: 派生握手密钥；此时尚未完成身份验证
 Server-->>Client: {EncryptedExtensions: ALPN 选择}
 Server-->>Client: {Certificate}
 Server-->>Client: {CertificateVerify: 握手签名}
 Server-->>Client: {Finished: 握手校验}
 Note over Client: 验证证书链与服务名<br/>验证签名和服务端 Finished
 Client-->>Server: {Finished: 握手校验}
 Note over Server: 验证客户端 Finished
 Client-->>Server: 加密 Application Data
 Server-->>Client: 加密 Application Data
```

`CertificateVerify` 用证书对应的私钥对握手上下文签名，证明持有该私钥，并把身份绑定到本次握手；证书链与服务名检查仍须另行完成。双方各自的 `Finished` 则校验握手记录并确认掌握相应密钥。本例客户端没发送证书，验证它的 `Finished` 不等于认证特定客户端身份。客户端发出自己的 `Finished` 后才能发送普通应用数据；服务端发出自己的 `Finished` 后可以先发送，不一定要等客户端的 `Finished` 到达[^5]。

在图中的 TCP 链路上，旁观者能读到 `ClientHello` 和 `ServerHello`。从 `EncryptedExtensions` 开始，握手消息的内容不再公开：服务端选中的 ALPN、证书链、`CertificateVerify` 和双方的 `Finished` 都受保护[^5][^7]。这也与常见 TLS 1.2 完整握手的明文证书消息不同。

- **服务器名称指示**（Server Name Indication，SNI）：客户端用 `server_name` 扩展告诉服务器要访问的名字，使同一地址上的服务可以选择配置和证书；SNI 本身不认证身份[^6]。
- [ALPN](/posts/networking/dns-resolution-caching-encrypted-queries/#域名空间与常见资源记录)：在未启用 ECH 的例子中，旁观者可以从 `ClientHello` 读出 `h2`、`http/1.1` 等候选，却不能从 TLS 1.3 的 `EncryptedExtensions` 直接读出服务端最终选了哪个[^7]。

### 证书链可信，还要检查名字

客户端需要确认认证路径通向受信任的**证书颁发机构**（certificate authority，CA）根证书、证书的有效期与约束满足要求[^pki]，并验证服务器持有相应私钥[^5]。它还要独立地把预期服务名与证书**主题备用名称**（Subject Alternative Name，SAN）中适用的身份匹配。RFC 9525 不再允许使用 Common Name 作为服务身份；仅仅“某个 CA 签过这张证书”不能代替名字匹配[^identity]。

吊销状态的获取和失败处理依客户端策略而异，不能声称所有工具都会在线确认“未被吊销”。浏览器、OpenSSL 和应用自带信任库也可能不同，诊断时应记录工具与信任配置。

| 材料或机制 | 回答的问题 | 不能代替什么 |
| --- | --- | --- |
| SNI | 客户端希望服务器选择哪个服务配置？ | 不能证明响应者就是该服务 |
| SAN 名字匹配 | 证书里的适用身份是否匹配预期服务名？ | 不能代替信任链与有效期检查 |
| CA 信任链及约束 | 这条证书路径是否受当前信任库认可？ | 不能单独证明持有私钥或名字正确 |
| CertificateVerify / Finished | 是否持有相应私钥、握手记录和密钥是否一致？ | 不能免除证书身份与路径检查 |
| ECH | 是否保护真实 ClientHello 中的敏感参数？ | 不能代替服务认证，也不隐藏目的 IP |

### TLS 会话恢复与早期数据

TLS 1.3 的服务端可以在握手后发送 `NewSessionTicket`，把票据与本次握手派生的**预共享密钥**（Pre-Shared Key，PSK）关联。客户端可在新连接的 `ClientHello` 中用票据标识该 PSK；服务端接受后，双方据此恢复会话，而不是复用原连接[^resumption]。

会话恢复不等于发送早期数据。只有条件允许时客户端才尝试发送；服务端可接受恢复、却拒绝早期数据。早期数据可能被重放，客户端只应发送应用层明确允许重放的数据，不能仅凭 GET 方法名作判断。HTTP 可用 `425` 表明服务端不愿承担重放风险，QUIC 的恢复与早期数据另见[第四篇的 0-RTT 说明](/posts/networking/transport-tcp-udp-socket-quic/#tls-握手应用数据与-0-rtt)[^early]。

## HTTPS 在线上如何承载握手与应用数据

前面的握手图按 TLS 消息展开。抓包时，还要区分这些消息的载体。先看握手落在哪一层，再看握手结束后的两种应用数据布局。

### HTTP/3 怎样把 TLS 放进 QUIC

使用 TLS 的 HTTP/2 新连接先建 TCP，再通过字节流中的 TLS 记录传递握手消息；HTTP/3 则把 TLS 握手消息放进 QUIC 的 CRYPTO 帧，不使用 TLS 记录层。`h3` 在 QUIC 的 TLS 握手中通过 ALPN 协商，不是在既有 TCP 连接里升级得到[^4][^quic-handshake]。

`ClientHello` 和 `ServerHello` 都走 QUIC Initial。能看到客户端 Initial 的旁观者可从公开信息导出 Initial 密钥，读出这两个握手消息的公开部分；这与能解密 ECH 的内部 ClientHello 是两回事。之后的 `EncryptedExtensions`、证书（若发送）及 `Finished` 走 Handshake 级别，应用数据通常走 1-RTT，不能用公开的 Initial 密钥解密[^quic-handshake]。

### HTTP/2 与 HTTP/3 的应用数据布局

握手完成后，再对照应用数据怎样装进 IP 数据报。设客户端为 `192.168.1.10`，目标为文档示例地址 `198.51.100.20`。下面比较同一客户端分别建立的 HTTP/2 与 HTTP/3 连接，只画客户端出站、尚未经过 NAT 的 IP 数据报，不画外面的链路帧。为单独看清包含关系，特意选择能在一个 TCP 段中装下完整 TLS 记录、以及一个 UDP 数据报中只装一个 QUIC 1-RTT 包的情况：

```mermaid title="HTTP/2 与 HTTP/3 的数据包里分别装了什么" description="两组分别是 HTTP/2 和 HTTP/3 连接里的 IPv4 包。框的嵌套表示载荷归属。HTTP/2 组选一条完整 TLS 记录恰好装进一个 TCP 段，HTTP/3 组选一个 UDP 数据报承载一个 QUIC 短头 1-RTT 包。框内列出线上可见字段，以及密文解开后的内容。"
flowchart TB
 subgraph h2_packet[HTTP/2：一个 IPv4 数据报]
  ip2["IPv4 头 · Protocol=6<br/>192.168.1.10 → 198.51.100.20"]
  subgraph tcp_segment[TCP 报文段]
   tcp2["TCP 头<br/>50001 → 443<br/>Seq · Ack · 校验和"]
   subgraph tls_record[TLS 1.3 记录]
    record2["公开记录头 · type=23<br/>version=0x0303 · 密文长度"]
    cipher2["AEAD 密文与认证标签<br/>解密后：HTTP/2 DATA 帧<br/>内层类型与可选填充"]
    record2 --- cipher2
   end
   tcp2 --- record2
  end
  ip2 --- tcp2
 end
 subgraph h3_packet[HTTP/3：一个 IPv4 数据报]
  ip3["IPv4 头 · Protocol=17<br/>192.168.1.10 → 198.51.100.20"]
  subgraph udp_datagram[UDP 数据报]
   udp3["UDP 头<br/>50002 → 443<br/>长度 · 校验和"]
   subgraph quic_packet[QUIC 1-RTT 包]
    header3["QUIC 短头 · 目的连接 ID 可见<br/>包号受头部保护"]
    cipher3["AEAD 密文与认证标签<br/>解密后：STREAM 帧<br/>流内字节承载 HTTP/3 DATA 帧"]
    header3 --- cipher3
   end
   udp3 --- header3
  end
  ip3 --- udp3
 end
 h2_packet --- h3_packet
 linkStyle default stroke:none
```

HTTP/2 这组能读取到 TCP 端口、序号和 TLS 外层记录头，但 `type=23` 只说明这是 TLS 加密记录的外层类型，不能据此读出 HTTP 方法、路径或正文；`0x0303` 是兼容字段，也不表示实际协商了 TLS 1.2[^tls-record]。HTTP/3 这组的应用流数据属于受保护的 QUIC 包体，包号还接受单独的头部保护[^quic-handshake]。

图中的单包安排是为了看清字段归属。实际 HTTP/2 帧、TLS 记录与 TCP 段之间没有固定的一一对应关系，见[第一篇的记录与分段示例](/posts/networking/layered-architecture-packet-journey/#tls-记录与-tcp-报文段两套独立的边界)。HTTP/3 帧也可能跨多个 QUIC STREAM 帧与包传输；反过来，一个包可以携带多个 QUIC 帧。

## 端到端可见性边界：谁能看到什么？

应用数据进入密文，不代表连接的所有信息都被隐藏。判断谁能看到什么，要区分握手公开了哪些参数，以及观察者处在路径的哪一段。

### ECH：保护真实的 ClientHello

ECH 用服务端配置的公钥加密 `ClientHelloInner`，真实 SNI 和需要保护的 ALPN 候选可放在其中；可见的 `ClientHelloOuter` 则承载密文。RFC 9849 定义 ECH 机制；客户端可以从[DNS 服务绑定记录的 `ech` 参数](/posts/networking/dns-resolution-caching-encrypted-queries/#域名空间与常见资源记录)取得 RFC 9848 定义的 `ECHConfigList`[^8][^ech-dns]。

ECH 改变的是 ClientHello 的可见范围。外层 SNI 通常使用配置中的公开名 `public_name`；外层也可携带非敏感的 ALPN 候选，不表示这就是内部真实的候选列表。服务端最终选定的 ALPN 本来就在加密的 `EncryptedExtensions` 里，是否使用 ECH 都不会把选择结果改成明文[^7][^8]。

```mermaid mobile-direction="TB" title="ECH 的公开外层与受保护的 ClientHello" description="从同一条客户端链路上的被动旁观者视角，对照携带 SNI 与 ALPN 的普通 ClientHello，以及通过 HTTPS 或 SVCB 配置并成功使用 ECH 的情况。外层通常显示配置指定的公开名，受保护的内层字段只有持有私钥的一端能恢复。"
flowchart LR
 plain["未启用 ECH<br/>普通 ClientHello"] -.->|旁观者可读| plain_view["目标 SNI<br/>客户端的 ALPN 候选"]
 dns["HTTPS / SVCB 的 ech 参数<br/>提供公钥与 public_name"] --> outer["成功使用 ECH<br/>ClientHelloOuter 承载内层密文"]
 outer -.->|旁观者可读| outer_view["外层 SNI（通常为 public_name）<br/>可能还有外层 ALPN 候选"]
 outer -->|用私钥解密| frontend["ECH 前端恢复内层<br/>真实 SNI 与受保护的 ALPN 候选"]
```

能解开 ECH 不等于能解密 HTTP。在分离部署中，ECH 前端恢复内部 ClientHello 并交给后端；后端才是目标 TLS 的终止端。合并部署时两个角色也可以在同一服务上。无论哪种部署，客户端仍须验证预期服务身份[^8]。

若服务端拒绝 ECH，RFC 9849 要求客户端用 `public_name` 校验外层握手。即使校验和握手都成功，也不能把它当成到目标服务的连接，必须在发送应用数据前以 `ech_required` 结束。若握手或认证失败，则报告错误，不使用重试配置，也不能据此关闭 ECH[^ech-retry]。

外层握手与认证成功才有重试的依据；如果返回的 `encrypted_client_hello` 扩展格式无效，客户端必须中止。若 `retry_configs` 中至少有一项采用客户端支持的 ECH 版本，规范建议另建连接，用新配置重试。若未返回该扩展、没有客户端支持的 ECH 配置版本，或协商到早于 TLS 1.3 的版本，规范允许把这些情况视为服务端发出的可信停用信号，并建议另建连接、不带 ECH 重试。单凭超时或拒绝信号不能关闭 ECH；不重试就须向应用报告错误。这些规则只适用于已使用配置尝试 ECH 的握手[^ech-retry]。

:::note[ECH 仍留下地址与流量特征]
如果同一旁观者还能看到明文 DNS，目标名可能早在握手前就已暴露；[加密 DNS](/posts/networking/dns-resolution-caching-encrypted-queries/#dotdoh-与-doq-保护查询通道)只减少所保护链路上的查询暴露。即使两者都启用，观察者仍能看到其所在链路的外层 IP、包长与时序；不能把“没读到明文域名”当成“无法推断访问目标”[^8]。
:::

### 各参与者能看到什么

下面假设目标使用 TLS 1.3，且客户端验证预期服务身份。旁观者不持有会话密钥；普通代理只转发，不终止目标 TLS。表中每一行描述该参与者自身的视角，不能把它看到的内容等同于同一链路上的第三方观察结果。

| 观察者 / 参与者 | 地址与端口 | 目标域名 | 目标证书 | HTTP 路径、字段与内容 |
| --- | --- | --- | --- | --- |
| 本地路由器 / ISP | 可见所观察链路的外层地址与端口 | 明文 DNS 或未受 ECH 保护的 SNI 可能可见 | 不能直接从 TLS 1.3 加密握手读取 | 不可直接读取 |
| 递归 DNS 解析器 | 可见查询方或转发方地址 | 可见向它查询的名字 | DNS 查询不包含网站证书 | 网站的 HTTP 消息不属于 DNS 查询 |
| NAT 路由器 | 可见并改写所在链路的地址与端口 | 只在该位置可见明文 DNS 或 SNI 时能读取对应信息 | 不可直接读取目标 TLS 加密证书 | 不可直接读取 |
| TUN 接管程序 | 可见交给其处理的内层 IP 包 | 可结合本机 DNS 映射或可见元数据 | 未终止目标 TLS 时不可直接读取 | 未终止目标 TLS 时不可直接读取 |
| 普通 CONNECT 代理 | 可见客户端及代理出站连接地址 | CONNECT 目标若使用域名，代理自身可见 | 透传时不能直接读取 TLS 1.3 证书消息 | 不可直接读取目标 TLS 内的内容 |
| 被客户端接受的**中间人**（man-in-the-middle，MitM）代理 | 可见其两段连接 | 通常可见 | 对客户端提供替代证书，对上游独立验证 | 作为 TLS 终止端可读取 |
| TLS 终止端，如 CDN 或源站 | 可见对端出口地址 | 可见被接收的 SNI 与 HTTP authority / Host | 持有相应证书与认证密钥 | 可读取终止于此的 HTTP 消息 |

**CONNECT 代理知道目标，不等于客户端到代理沿途的旁观者都知道。** 明文 HTTP 代理上的 `CONNECT example.com:443` 可在该链路被读取；如果客户端通过 TLS 连接 HTTPS 代理，代理只解开外层 TLS 来处理 CONNECT，仍可把隧道内的目标 TLS 原样转发。两种入口与 SOCKS5 的地址处理见[第七篇的显式代理边界](/posts/networking/proxies-tunnels-transparent-interception/#显式代理http-connect-与-socks5-的工作边界)[^connect]。

若 CDN 作为反向代理终止客户端 TLS，它就能读取 HTTP；CDN 到源站走明文还是另建 TLS，是另一段连接的配置。如果使用 TLS，上游身份应由 CDN 独立验证，客户端的 TLS 握手验证不了这一段[^gateway]。MitM 调试代理则需要让客户端信任它为目标名提供的替代证书；信任可能来自调试 CA、设备管理或应用自己的信任配置。代理终止客户端 TLS，再单独验证上游，不能把两段握手的验证结果混在一起[^mitm]。

:::important[信任库决定哪一个 TLS 终止端会被接受]
客户端接受代理 CA 后，代理可能成为它认可的服务身份签发者。诊断时应检查证书签发者、目标名字、实际连接地址与代理配置；单凭“浏览器没有报错”不能推导链路中不存在被信任的 TLS 检查代理。
:::

## 观察 TLS 握手与 HTTP 协商：实验与边界

链路旁观者只能看到公开字段；客户端工具则能报告实际协商的协议以及自己的证书验证结果。下面的 OpenSSL 与 curl 命令需要本机工具、信任库和真实网络；在线 Playground 的运行权限、证书库与本机不同，不适合据此判断自己的 HTTPS 或代理路径。只练习本机 HTTP 请求与计时时，可以先做[第八篇的回环对照实验](/posts/networking/network-diagnostics-performance-troubleshooting/#控制变量实验只改变服务端响应前的等待)，它不验证 TLS。

### 实验一：同时检查握手、证书链与服务名

先记录版本，再显式设置服务名和失败处理。以下参数按 OpenSSL 3.6 文档核对：

```bash frame="code"
openssl version
openssl s_client \
  -connect example.com:443 \
  -servername example.com \
  -verify_hostname example.com \
  -verify_return_error \
  -alpn h2,http/1.1 </dev/null
```

`-servername` 发送 SNI；`-verify_hostname` 检查目标名字；`-verify_return_error` 让验证错误导致失败。默认的调试式 `s_client` 可能报告证书错误后继续，不能省略后两项再用“连上了”证明身份校验成功。OpenSSL 的名字检查可在没有适用 SAN 时匹配 Common Name，因此命令通过也不等于证明证书符合前面的 RFC 9525 身份规则；仍要核对匹配的 SAN[^openssl]。

检查实际协商的 TLS 版本、密码套件、收到的对端证书及验证结果，同时记录命令退出状态。这条命令既不强制 TLS 1.3，也不发送 HTTP 请求；ALPN 选中 `h2` 只表示协商出了应用协议，不等于已收到 HTTP/2 响应。

若要明确测试不发送 SNI，使用独立命令：

```bash frame="code"
openssl s_client \
  -connect example.com:443 \
  -noservername \
  -verify_hostname example.com \
  -verify_return_error \
  -alpn h2,http/1.1 </dev/null
```

自 OpenSSL 1.1.1 起，省略 `-servername` 时可从 `-connect` 中的 DNS 名自动填写 SNI，因此“删掉该参数”不能证明未发 SNI。第二条命令仍检查 `example.com` 的证书名字，单独改变的是是否发送 SNI。服务端可能返回适用证书、默认证书，也可能中断握手，结果不由 TLS 规范统一规定。

:::caution[一行 `Verify return code: 0` 不能证明握手成功]
未收到对端证书时，OpenSSL 的证书验证结果仍可为 `X509_V_OK`（`Verify return code: 0`）[^openssl-result]。这只表示没有记录证书验证错误，不代表收到了证书或握手完成；要同时检查对端证书、协商结果及退出状态。
:::

### 实验二：用 curl 观察 HTTP 协商与响应

```bash frame="code"
curl --version
curl --noproxy '*' -v --http1.1 https://example.com/ -o /dev/null
curl --noproxy '*' -v --http2 https://example.com/ -o /dev/null
```

先用 `curl --version` 确认编译功能，再对照 ALPN、实际 HTTP 版本、状态码和响应字段。`--http2` 在此 HTTPS 用法中请求协商 HTTP/2，仍应阅读实际协商结果。能否验证 HTTP/3 取决于 curl 是否编入相应支持，不能仅凭版本号判断。

这里使用 GET，并丢弃响应内容。`curl -I` 发的是 HEAD，服务端处理可能与 GET 不同，不能把两者响应差异直接归咎于传输版本。要观察重定向，可先查看原始响应，再决定是否加 `-L` 跟随，避免一次改变过多条件。

如果 `--noproxy '*'` 请求仍取得 Fake-IP，或选路进入 TUN，说明显式代理虽被排除，透明接管仍可能参与连接。请求成功不能据此解释为未经代理的公网直连。OpenSSL 默认也不会自动读取 curl 的代理环境设置；二者结果不同时，应先核对解析、路由、信任库和代理入口。

## 总结

HTTP 的语义与消息传输版本分别演进；HTTP/1.1 允许流水线但要求响应有序，HTTP/2 在 TCP 上复用流，HTTP/3 借助 QUIC 避免跨流的传输按序交付阻塞。TLS 则另行规定密钥、身份和加密边界，SNI、名字校验与证书链验证各有职责。

到这里，本系列选取的客户端访问主线已经从本地交付延伸到应用消息。下一篇[《计算机网络（七）：代理协议、透明接管与分流实现》](/posts/networking/proxies-tunnels-transparent-interception/)将把这些机制放入代理场景，分别追踪流量从哪里进入、域名在哪里解析，以及哪一端建立目标连接。

## 延伸阅读

- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)——进一步查阅方法、状态码、缓存与网关语义
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html)——需要双向消息通信时，进一步了解 WebSocket 的握手与消息帧；它与 HTTP 缓存、连接复用是不同主题

[^1]: 〔RFC〕[RFC 9110 §6、§9、§15](https://www.rfc-editor.org/rfc/rfc9110.html#section-6)——跨版本的消息、请求方法与状态码语义

[^2]: 〔RFC〕[RFC 9112 §2.1](https://www.rfc-editor.org/rfc/rfc9112.html#section-2.1)定义 HTTP/1.1 消息头的 `CRLF` 边界；[§6](https://www.rfc-editor.org/rfc/rfc9112.html#section-6)定义正文定界；[§9.3](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3)与 [§9.3.2](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3.2)说明默认持久连接及流水线响应顺序。

[^3]: 〔RFC〕[RFC 9113 §2](https://www.rfc-editor.org/rfc/rfc9113.html#section-2)说明 HTTP/2 与 TCP 队头阻塞的关系；[§3.2–3.3](https://www.rfc-editor.org/rfc/rfc9113.html#section-3.2)说明 TLS 协商与预先知道支持时的明文建连，[§4](https://www.rfc-editor.org/rfc/rfc9113.html#section-4)定义二进制帧，[§5](https://www.rfc-editor.org/rfc/rfc9113.html#section-5)定义流与多路复用。

[^hpack]: 〔RFC〕[RFC 7541 §1](https://www.rfc-editor.org/rfc/rfc7541.html#section-1)——HTTP/2 的字段压缩格式 HPACK。

[^4]: 〔RFC〕[RFC 9114 §2、§3](https://www.rfc-editor.org/rfc/rfc9114.html#section-2)——HTTP/3 的 QUIC 映射、ALPN 与端点发现；[RFC 9000 §13](https://www.rfc-editor.org/rfc/rfc9000.html#section-13)说明丢包与各流的交付，[RFC 9204 §2](https://www.rfc-editor.org/rfc/rfc9204.html#section-2)说明 QPACK 的头部依赖和受阻流。

[^5]: 〔RFC〕[RFC 9846 §2](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)和[图 1](https://www.rfc-editor.org/rfc/rfc9846.html#figure-1)展示 TLS 1.3 完整握手、明文与密钥保护阶段、应用数据发送时机；[§4.5.2–§4.5.3](https://www.rfc-editor.org/rfc/rfc9846.html#section-4.5.2)定义 `CertificateVerify` 与 `Finished`，[§7](https://www.rfc-editor.org/rfc/rfc9846.html#section-7)定义 HKDF 密钥派生。RFC 9846 取代 RFC 8446。

[^6]: 〔RFC〕[RFC 6066 §3](https://www.rfc-editor.org/rfc/rfc6066.html#section-3)——`server_name` 扩展在 ClientHello 中传递服务名，不代替客户端身份验证

[^7]: 〔RFC〕[RFC 7301 §3](https://www.rfc-editor.org/rfc/rfc7301.html#section-3)与[RFC 9846 §4.4.1](https://www.rfc-editor.org/rfc/rfc9846.html#section-4.4.1)——ALPN 的协议选择及 TLS 1.3 服务端在加密扩展中的响应；新版主规范调整了章节编号。

[^8]: 〔RFC〕[RFC 9849 §3.1–§3.2](https://www.rfc-editor.org/rfc/rfc9849.html#section-3.1)区分部署角色并概述 ClientHelloInner / Outer，[§6.1.1](https://www.rfc-editor.org/rfc/rfc9849.html#section-6.1.1)规定外层 SNI 与 `public_name` 的关系，[§10](https://www.rfc-editor.org/rfc/rfc9849.html#section-10)讨论 DNS、IP 等隐私边界及外层敏感参数的处理。

[^ech-retry]: 〔RFC〕[RFC 9849 §6.1.4](https://www.rfc-editor.org/rfc/rfc9849.html#section-6.1.4)定义接受与拒绝的判定；[§6.1.6](https://www.rfc-editor.org/rfc/rfc9849.html#section-6.1.6)与 [§6.1.7](https://www.rfc-editor.org/rfc/rfc9849.html#section-6.1.7)定义拒绝后的重试条件与公开名认证。

[^ech-dns]: 〔RFC〕[RFC 9848 §3](https://www.rfc-editor.org/rfc/rfc9848.html#section-3)——`ech` 服务参数中 ECHConfigList 的编码与分发

[^identity]: 〔RFC〕[RFC 9525 §6](https://www.rfc-editor.org/rfc/rfc9525.html#section-6)——预期服务身份、SAN 名字匹配与认证路径验证的不同责任，不允许以 Common Name 识别服务

[^connect]: 〔RFC〕[RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)——CONNECT 成功后转为隧道；[RFC 1928 §4、§5](https://www.rfc-editor.org/rfc/rfc1928.html#section-4)另行定义 SOCKS5 地址与请求

[^gateway]: 〔RFC〕[RFC 9110 §3.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-3.7)描述反向代理在客户端和上游两侧的角色，[§4.3.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.3.4)规定 HTTPS 客户端应验证所连接的服务身份。

[^mitm]: 〔软件实现〕[mitmproxy: Certificates](https://docs.mitmproxy.org/stable/concepts/certificates/)——动态签发替代证书与客户端接受代理 CA 的前提

[^openssl]: 〔工具文档〕[OpenSSL 3.6 `s_client`](https://docs.openssl.org/3.6/man1/openssl-s_client/)与[验证选项](https://docs.openssl.org/3.6/man1/openssl-verification-options/)——SNI 默认行为、`-noservername`、`-verify_hostname` 与 `-verify_return_error`；[`X509_check_host`](https://docs.openssl.org/3.6/man3/X509_check_host/)说明 SAN 和 Common Name 的匹配顺序。

[^openssl-result]: 〔工具文档〕[OpenSSL 3.6 `SSL_get_verify_result`](https://docs.openssl.org/3.6/man3/SSL_get_verify_result/#bugs)——没有对端证书也可返回 `X509_V_OK`。

[^curl]: 〔工具文档〕[curl 手册：location、http2、head、noproxy](https://curl.se/docs/manpage.html)——重定向跟随、协议协商、HEAD 与显式代理排除选项

[^cache]: 〔RFC〕[RFC 9111 §4.2、§4.3、§5.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2)——新鲜度、重新验证与 no-cache / no-store 等指令；条件请求语义见 [RFC 9110 §13](https://www.rfc-editor.org/rfc/rfc9110.html#section-13)。

[^cookie]: 〔RFC〕[RFC 6265 §4.1、§4.2、§5.4](https://www.rfc-editor.org/rfc/rfc6265.html#section-4.1)——Set-Cookie、Cookie 的作用域和发送条件，以及 Secure、HttpOnly 属性。

[^tls-record]: 〔RFC〕[RFC 9846 §5.2](https://www.rfc-editor.org/rfc/rfc9846.html#section-5.2)及[附录 B.1](https://www.rfc-editor.org/rfc/rfc9846.html#appendix-B.1)——TLS 1.3 加密记录的外层类型、兼容版本字段与长度，以及受保护的内容、内层类型和填充。

[^quic-handshake]: 〔RFC〕[RFC 9001 §4](https://www.rfc-editor.org/rfc/rfc9001.html#section-4)与[图 5](https://www.rfc-editor.org/rfc/rfc9001.html#figure-5)说明 CRYPTO 帧与各 TLS 消息的保护级别，[§5.2–§5.4](https://www.rfc-editor.org/rfc/rfc9001.html#section-5.2)说明公开可导出的 Initial 密钥、包体与包头保护；HTTP/3 的 QUIC 流映射见 [RFC 9114 §6](https://www.rfc-editor.org/rfc/rfc9114.html#section-6)。

[^pki]: 〔RFC〕[RFC 5280 §6.1](https://www.rfc-editor.org/rfc/rfc5280.html#section-6.1)——认证路径验证、有效期和约束检查。

[^resumption]: 〔RFC〕[RFC 9846 §2.2](https://www.rfc-editor.org/rfc/rfc9846.html#section-2.2)与 [§4.7.1](https://www.rfc-editor.org/rfc/rfc9846.html#section-4.7.1)——TLS 1.3 会话恢复、票据与派生 PSK 的关联。

[^early]: 〔RFC〕[RFC 9846 §4.3.10](https://www.rfc-editor.org/rfc/rfc9846.html#section-4.3.10)定义服务端对早期数据的处理；[§8](https://www.rfc-editor.org/rfc/rfc9846.html#section-8)与 [RFC 8470 §5.2](https://www.rfc-editor.org/rfc/rfc8470.html#section-5.2)分别说明重放风险及 HTTP 425。

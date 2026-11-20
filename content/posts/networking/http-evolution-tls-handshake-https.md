---
title: "计算机网络（六）：HTTP 演进、TLS 握手与加密边界"
description: "从最小 HTTP 请求与响应理解消息语义，比较 HTTP/1.1、HTTP/2、HTTP/3 的复用边界，拆解 TLS 身份校验、SNI、ALPN 与 ECH，并用 OpenSSL 和 curl 观察连接。"
publishDate: "22 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（五）：DNS 解析、缓存层级与加密查询》](/posts/networking/dns-resolution-caching-encrypted-queries/)解释了如何取得目标地址与连接参数。接下来要分别解决两个问题：应用怎样表达请求与响应，客户端怎样确认通信对端并保护消息。**超文本传输协议**（Hypertext Transfer Protocol，HTTP）规定前者，**传输层安全性协议**（Transport Layer Security，TLS）为后者提供认证与加密机制。

本篇先读一组最小 HTTP 消息，再比较三个版本的连接复用，最后沿 TLS 握手划清各方的观察边界。这些边界也会成为[第七篇代理分析](/posts/networking/proxies-tunnels-transparent-interception/)的依据：传输连接被代理分成两段，不表示应用的 TLS 也一定在那里终止。

## HTTP 请求、响应与消息语义

### 先读一组请求与响应

HTTP 的核心语义包括方法、目标资源、状态码、字段与内容。它们与具体版本怎样分帧分别定义，因此换成 HTTP/2 或 HTTP/3 以后，`GET` 与 `404` 的含义仍然成立[^1]。

下面是 HTTP/1.1 的最小交互示意。线上各行由 `CRLF` 结束，头部后的空行划分消息头与内容；响应的 6 字节内容为 `hello` 加一个换行[^2]：

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

### 缓存与 Cookie 不属于传输连接状态

`Cache-Control: max-age=60` 允许响应在满足其他条件时保持 60 秒新鲜；`no-cache` 要求复用前验证，并不等于禁止存储；`no-store` 才要求缓存不要存储。过期响应若有 `ETag`，客户端可以发送 `If-None-Match`，服务端在条件满足时返回 `304`，复用已有正文。这种条件请求仍然会产生网络交互，应与完全命中本地缓存区分[^cache]。

Cookie 则是 HTTP 层的状态管理：服务端用 `Set-Cookie` 设置，客户端按适用条件在后续请求中发送 `Cookie`，不依赖是否复用了同一条 TCP/TLS 连接。TLS 保护传输，但不能代替 Cookie 的作用域和访问控制；`Secure` 限制安全通道发送，`HttpOnly` 限制脚本读取，都不意味着服务端或 TLS 终止端看不到它[^cookie]。

## HTTP/1.1 到 HTTP/3 的连接与复用

| 协议版本 | 传输与消息组织 | 复用能力 | 遗留边界 |
| --- | --- | --- | --- |
| HTTP/1.1 | TCP，文本消息行与字段 | 默认持久连接；也允许不等前一响应就发下一请求的流水线[^2] | 响应仍须按请求顺序返回，前面的慢响应会阻塞后续响应 |
| HTTP/2 | TCP，二进制帧、流与 HPACK | 不同流的帧可交错；浏览器 HTTPS 部署通常使用 TLS[^3] | TCP 丢失字节仍会阻止后续字节按序交付，从而影响多个流 |
| HTTP/3 | QUIC / UDP，HTTP 流与 QPACK | 利用 QUIC 流的独立按序交付[^4] | 仍共享路径、连接拥塞控制等资源；头部解码也有自己的依赖 |

HTTP/1.1 的持久连接不需要靠 `Connection: Keep-Alive` 才开启；连接关闭、消息定界和完整消费响应都会影响能否复用。浏览器并行建立多条连接属于实现策略，不是协议规定固定创建六条。HTTP/2 也允许在预先知道服务端支持的条件下直接使用明文 TCP；`h2` 则是用于 TLS ALPN 的协议标识，不能把浏览器常见部署当成唯一形式。

HTTP/3 避免的是丢包引起的跨流传输按序交付阻塞，并不保证一个流绝不受其他流影响。它所依赖的可靠性、流量控制与连接迁移见[第四篇的 QUIC](/posts/networking/transport-tcp-udp-socket-quic/#quic为什么在-udp-之上重建可靠传输)。

## TLS 1.3 握手：密钥协商、证书校验与 SNI / ALPN

明文 HTTP 的消息可以被路径上的观察者读取和修改。TLS 为通信提供机密性、完整性和对端身份认证机制，但应用必须正确配置并检查身份验证；“用了加密”本身不证明连到了预期服务。

以使用证书认证、没有 HelloRetryRequest 的常见 TLS 1.3 完整握手为例，客户端通常经过一次 TLS 网络往返（1-RTT）后即可发送应用数据；此前的 DNS、TCP 握手不包含在这个 1-RTT 里，重试等条件也可能增加往返[^5]。在 `ClientHello` 与 `ServerHello` 中，双方已各自携带**椭圆曲线瞬时迪菲-赫尔曼密钥交换**（Elliptic Curve Diffie-Hellman Ephemeral，ECDHE）临时公钥 `key_share`（提供**前向保密**，Forward Secrecy，FS）；一旦服务端发出 `ServerHello`，双方即可通过基于哈希的密钥派生函数（HKDF）算出握手流量密钥，因此紧随其后的 `EncryptedExtensions`、`Certificate`、`CertificateVerify` 和 `Finished` 全部处于**带关联数据的认证加密**（Authenticated Encryption with Associated Data，AEAD）保护之下[^5]：

```mermaid title="TLS 1.3 完整握手与应用数据" description="示意仅认证服务端的 ECDHE 证书握手，未启用 ECH、0-RTT，也没有 HelloRetryRequest。实线表示明文握手消息，虚线表示密钥保护的消息；花括号中的消息由握手密钥保护，应用数据使用应用流量密钥。箭头是逻辑消息顺序，不对应固定数量的 TCP 报文段或真实耗时。"
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

`CertificateVerify` 用证书对应的私钥对握手上下文签名，证明持有该私钥，并把身份绑定到本次握手；证书链与服务名检查仍须另行完成。双方各自的 `Finished` 则校验握手记录并确认掌握相应密钥：本例客户端没有提供客户端证书，因此服务端验证客户端 `Finished` 不等于验证了客户端的实名身份[^5]。

花括号表示已被握手密钥保护的消息。与常见 TLS 1.2 完整证书握手的明文证书消息不同，TLS 1.3 的服务器证书通常在加密通道中传输；未使用 ECH 时，最初的 `ClientHello` 及其中的一些扩展仍对链路观察者可见。

- **服务器名称指示**（Server Name Indication，SNI）：客户端用 `server_name` 扩展告诉服务器要访问的名字，使同一地址上的服务可以选择配置和证书；SNI 不是证书身份验证[^6]。
- **应用层协议协商**（Application-Layer Protocol Negotiation，ALPN）：客户端提供候选应用协议，服务端选取支持的一个。基于 TCP 的 HTTPS 常协商 `h2` 或 `http/1.1`；HTTP/3 则在 QUIC 的 TLS 握手中协商 `h3`，不是在既有 TCP 连接里升级得到[^7][^4]。

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

TLS 1.3 会话恢复允许在满足条件时尝试**早期数据**（early data，0-RTT）。服务端可拒绝早期数据，攻击者也可能重放；客户端只应把应用层明确允许重放的数据放入此阶段。不要仅凭 GET 方法名假定业务操作可重放。HTTP 可用 425 表明服务端不愿承担重放风险，QUIC 的恢复与早期数据另见[第四篇](/posts/networking/transport-tcp-udp-socket-quic/#quic为什么在-udp-之上重建可靠传输)[^early]。

### HTTP/3 怎样把 TLS 放进 QUIC

HTTP/2 的普通新连接先建 TCP，再在字节流上运行 TLS；HTTP/3 则把 TLS 握手消息放进 QUIC 的 CRYPTO 帧，不使用 TLS 记录层。两者的建连过程如下，省略 DNS、重试、会话恢复与请求正文[^quic-handshake]：

```mermaid mobile-direction="TB" title="HTTPS over TCP 与 QUIC 的建连对照" description="两组是独立的新连接，均无 0-RTT 或 HelloRetryRequest，QUIC 也没有 Retry。箭头表示阶段依赖，不表示相同耗时。QUIC Initial 的密钥可由公开信息导出，不能向旁观者保密；后续 Handshake 与 1-RTT 使用另外派生的密钥。"
flowchart LR
 subgraph tcp_case[HTTP/2：先建 TCP，再运行 TLS]
  direction TB
  tcp["TCP 三次握手"] --> tls["TLS 握手<br/>密钥协商与证书验证<br/>Finished"]
  tls --> h2["HTTP/2 帧<br/>经 TLS 记录与 TCP 字节流传输"]
 end
 subgraph quic_case[HTTP/3：QUIC 内集成 TLS]
  direction TB
  initial["QUIC Initial<br/>CRYPTO 帧开始 TLS 握手"] --> handshake["Initial 携带 ServerHello<br/>Handshake 携带后续握手"]
  handshake --> h3["客户端发送 Finished<br/>1-RTT 包承载 HTTP/3 流"]
 end
 tcp_case --- quic_case
 linkStyle 4 stroke:none
```

QUIC 的应用流仍在流内按序交付；QPACK 的动态表依赖也可能让某些头部解码等待。减少跨流传输阻塞不能推导“HTTP/3 完全没有队头阻塞”，更不能保证 UDP 受限路径上一定比 HTTP/2 快。

### ECH：保护真实的 ClientHello

**加密客户端问候**（Encrypted Client Hello，ECH）使用服务端提供的配置加密 `ClientHelloInner`，把真实 SNI 及其他受保护参数放在里面，`ClientHelloOuter` 则作为可见的外部封装。RFC 9849 定义 ECH 机制，RFC 9848 的 `ech` 服务参数定义了通过 `HTTPS` / `SVCB` 分发 `ECHConfigList` 的方式[^8][^ech-dns]。

ECH 不会把整个最初的握手都变成不可见：`ClientHelloOuter` 仍是可见消息，包含为外部连接服务的参数与加密的 inner 载荷；外层 SNI 也不能等同于受保护的真实 SNI。外层名字用于与公开服务配置交互，不能把某个 CDN 的示例域名当成 ECH 的固定名称。客户端、DNS 配置与服务端都支持且成功使用 ECH 时，链路旁观者不能直接从外层读取真实 SNI；具体接受与回退行为仍需按实现核对。

```mermaid mobile-direction="TB" title="ECH 的公开外层与受保护的 ClientHello" description="展示通过 DNS HTTPS 或 SVCB 的 ech 参数取得配置、并成功使用 ECH 的路径，不表示每次都要重新查询 DNS，也不表示所有站点都提供 ECH。配置包含公钥与 public_name；ClientHelloInner 中的真实 SNI 和受保护 ALPN 被加密后放进外层 ECH 扩展。持有对应私钥的 ECH 前端可恢复 inner，旁观者只能读取外层及网络元数据；客户端仍需完成 TLS 服务身份验证。"
flowchart LR
 dns["HTTPS / SVCB 的 ech 参数<br/>解码为 ECHConfigList"] --> seal["按公钥与 public_name 构造外层<br/>加密内部 ClientHello"]
 seal --> outer["ClientHelloOuter<br/>外层可见，ECH 扩展携带密文"]
 outer -.->|只能观察公开部分| observer["旁观者<br/>不能解密 inner"]
 outer -->|解密| frontend["ECH 前端<br/>用私钥恢复 inner"]
 frontend --> tls["继续 TLS<br/>客户端校验身份"]
```

:::note[ECH 仍留下地址与流量特征]
加密 DNS 可减少查询在该段链路上的明文暴露，ECH 可保护真实 ClientHello。两者都不隐藏目标 IP、包长与时序，也不保证目标服务与其他服务不可区分。不能把“观察不到明文域名”直接写成“无法推断访问目标”[^8]。
:::

## 端到端可见性边界：谁能看到什么？

下面以目标使用 TLS 1.3、客户端验证预期服务身份、普通代理不终止目标 TLS 为前提。每一行描述该参与者自身的视角；客户端到它之间若有外层加密隧道，沿途第三方看到的还会更少。

| 观察者 / 参与者 | 地址与端口 | 目标域名 | 目标证书 | HTTP 路径、字段与内容 |
| --- | --- | --- | --- | --- |
| 本地路由器 / ISP | 可见所观察链路的外层地址与端口 | 明文 DNS 或未受 ECH 保护的 SNI 可能可见 | 不能直接从 TLS 1.3 加密握手读取 | 不可直接读取 |
| 递归 DNS 解析器 | 可见查询方或转发方地址 | 可见向它查询的名字 | DNS 查询不包含网站证书 | 网站的 HTTP 消息不属于 DNS 查询 |
| NAT 路由器 | 可见并改写所在链路的地址与端口 | 只在该位置可见明文 DNS 或 SNI 时能读取对应信息 | 不可直接读取目标 TLS 加密证书 | 不可直接读取 |
| TUN 接管程序 | 可见交给其处理的内层 IP 包 | 可结合本机 DNS 映射或可见元数据 | 未终止目标 TLS 时不可直接读取 | 未终止目标 TLS 时不可直接读取 |
| 普通 CONNECT 代理 | 可见客户端及代理出站连接地址 | CONNECT 目标若使用域名，代理自身可见 | 透传时不能直接读取 TLS 1.3 证书消息 | 不可直接读取目标 TLS 内的内容 |
| 被客户端接受的**中间人**（man-in-the-middle，MitM）代理 | 可见其两段连接 | 通常可见 | 对客户端提供替代证书，对上游独立验证 | 作为 TLS 终止端可读取 |
| TLS 终止端，如 CDN 或源站 | 可见对端出口地址 | 可见被接收的 SNI 与 HTTP authority / Host | 持有相应证书与认证密钥 | 可读取终止于此的 HTTP 消息 |

**CONNECT 代理知道目标，不等于客户端到代理沿途的旁观者都知道。** 明文 HTTP 代理上的 `CONNECT example.com:443` 可在该链路被读取；如果客户端通过 TLS 连接 HTTPS 代理，CONNECT 本身就在外层 TLS 内。两种情况下，代理自身都要解释目标信息，随后应用仍可与目标 TLS 终止端握手。CONNECT 语义由 HTTP 定义，SOCKS5 的目标地址和协商则由它自己的协议定义[^connect]。

MitM 调试代理需要让客户端接受它提供的证书和信任链。常见方式是安装调试 CA，但信任也可能预先由设备管理配置，或由应用单独设置；不能限定为用户手动安装。代理此时终止客户端 TLS，再单独连接上游，两个握手和验证责任需要分别检查[^mitm]。

:::important[信任库决定哪一个 TLS 终止端会被接受]
客户端接受代理 CA 后，代理可能成为它认可的服务身份签发者。诊断时应检查证书签发者、目标名字、实际连接地址与代理配置；单凭“浏览器没有报错”不能推导链路中不存在被信任的 TLS 检查代理。
:::

## 观察 TLS 握手与 HTTP 协商：实验与边界

前面的 HTTP 消息是协议格式示意，并不是可单独执行的程序。下面的 OpenSSL 与 curl 命令需要本机工具、信任库和真实网络；在线 Playground 的运行权限、证书库与本机不同，不适合据此判断自己的 HTTPS 或代理路径。只练习本机 HTTP 请求与计时时，可以先做[第八篇的回环对照实验](/posts/networking/network-diagnostics-performance-troubleshooting/#控制变量实验只改变服务端响应前的等待)，它不验证 TLS。

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

`-servername` 发送 SNI；`-verify_hostname` 执行目标名字检查；`-verify_return_error` 让验证错误导致失败。默认的调试式 `s_client` 可能报告证书错误后继续，不能省略后两项再用“连上了”证明身份校验成功[^openssl]。

检查协商协议、密码套件、收到的对端证书及验证结果，同时记录命令退出状态。ALPN 是否选择 `h2` 取决于双方支持情况；未协商 ALPN 不等于 TLS 本身失败。

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
OpenSSL 可能在没有收到对端证书、握手失败退出时，仍打印 `Verification: OK` / `Verify return code: 0`。判断连接是否成功，必须同时检查对端证书、协商结果及退出状态。无 SNI 的请求是否被接受取决于服务端配置，不能把某个站点的失败推广到所有服务。
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

[^2]: 〔RFC〕[RFC 9112 §2、§6、§9.3](https://www.rfc-editor.org/rfc/rfc9112.html#section-2)——HTTP/1.1 消息语法、长度定界与默认持久连接；[§9.3.2](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3.2)允许流水线并要求响应按请求顺序返回

[^3]: 〔RFC〕[RFC 9113 §2、§3、§4](https://www.rfc-editor.org/rfc/rfc9113.html#section-2)——HTTP/2 的流、二进制帧、TCP 队头阻塞，以及 TLS 与预先知晓支持时的明文连接

[^4]: 〔RFC〕[RFC 9114 §2、§3](https://www.rfc-editor.org/rfc/rfc9114.html#section-2)——HTTP/3 的 QUIC 映射、ALPN 与端点发现；[RFC 9204 §2](https://www.rfc-editor.org/rfc/rfc9204.html#section-2)说明 QPACK 的头部依赖和受阻流

[^5]: 〔RFC〕[RFC 9846 §2、§4、§5、§7](https://www.rfc-editor.org/rfc/rfc9846.html#section-2)——TLS 1.3 常见 1-RTT 完整握手、ECDHE 前向保密、HKDF 密钥派生以及 ServerHello 之后握手消息的 AEAD 加密保护；取代 RFC 8446

[^6]: 〔RFC〕[RFC 6066 §3](https://www.rfc-editor.org/rfc/rfc6066.html#section-3)——`server_name` 扩展在 ClientHello 中传递服务名，不代替客户端身份验证

[^7]: 〔RFC〕[RFC 7301 §3](https://www.rfc-editor.org/rfc/rfc7301.html#section-3)与[RFC 9846 §4.4.1](https://www.rfc-editor.org/rfc/rfc9846.html#section-4.4.1)——ALPN 的协议选择及 TLS 1.3 服务端在加密扩展中的响应；新版主规范调整了章节编号。

[^8]: 〔RFC〕[RFC 9849 §3、§10](https://www.rfc-editor.org/rfc/rfc9849.html#section-3)——ClientHelloInner / Outer、ECH 保护目标，以及 IP 与流量分析等剩余隐私边界（2026 年 3 月发布）

[^ech-dns]: 〔RFC〕[RFC 9848 §3](https://www.rfc-editor.org/rfc/rfc9848.html#section-3)——`ech` 服务参数中 ECHConfigList 的编码与分发

[^identity]: 〔RFC〕[RFC 9525 §6](https://www.rfc-editor.org/rfc/rfc9525.html#section-6)——预期服务身份、SAN 名字匹配与认证路径验证的不同责任，不允许以 Common Name 识别服务

[^connect]: 〔RFC〕[RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6)——CONNECT 成功后转为隧道；[RFC 1928 §4、§5](https://www.rfc-editor.org/rfc/rfc1928.html#section-4)另行定义 SOCKS5 地址与请求

[^mitm]: 〔软件实现〕[mitmproxy: Certificates](https://docs.mitmproxy.org/stable/concepts/certificates/)——动态签发替代证书与客户端接受代理 CA 的前提

[^openssl]: 〔工具文档〕[OpenSSL 3.6 `s_client`](https://docs.openssl.org/3.6/man1/openssl-s_client/)与[验证选项](https://docs.openssl.org/3.6/man1/openssl-verification-options/)——SNI 默认行为、`-noservername`、`-verify_hostname` 与 `-verify_return_error`

[^curl]: 〔工具文档〕[curl 手册：location、http2、head、noproxy](https://curl.se/docs/manpage.html)——重定向跟随、协议协商、HEAD 与显式代理排除选项

[^cache]: 〔RFC〕[RFC 9111 §4.2、§4.3、§5.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2)——新鲜度、重新验证与 no-cache / no-store 等指令；条件请求语义见 [RFC 9110 §13](https://www.rfc-editor.org/rfc/rfc9110.html#section-13)。

[^cookie]: 〔RFC〕[RFC 6265 §4.1、§4.2、§5.4](https://www.rfc-editor.org/rfc/rfc6265.html#section-4.1)——Set-Cookie、Cookie 的作用域和发送条件，以及 Secure、HttpOnly 属性。

[^quic-handshake]: 〔RFC〕[RFC 9001 §4、§5.2](https://www.rfc-editor.org/rfc/rfc9001.html#section-4)——QUIC CRYPTO 帧中的 TLS 握手与公开可导出的 Initial 密钥；HTTP/3 的 QUIC 流映射见 [RFC 9114 §6](https://www.rfc-editor.org/rfc/rfc9114.html#section-6)。

[^pki]: 〔RFC〕[RFC 5280 §6.1](https://www.rfc-editor.org/rfc/rfc5280.html#section-6.1)——认证路径验证、有效期和约束检查。

[^early]: 〔RFC〕[RFC 9846 §8](https://www.rfc-editor.org/rfc/rfc9846.html#section-8)与[RFC 8470 §3、§5.2](https://www.rfc-editor.org/rfc/rfc8470.html#section-3)——TLS 早期数据的重放风险与 HTTP 425。

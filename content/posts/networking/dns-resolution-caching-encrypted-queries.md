---
title: "计算机网络（五）：DNS 解析、缓存层级与加密查询"
description: "从资源记录与递归查询理解域名解析，区分缓存、名字不存在与解析失败，解释 DNSSEC、加密 DNS 和引导解析的边界，并用 dig 对照系统解析路径。"
publishDate: "21 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（四）：TCP、UDP、Socket 与可靠传输》](/posts/networking/transport-tcp-udp-socket-quic/)解释了字节流与数据报怎样交付给通信端点。但应用发起连接时，手里通常只有 `example.com` 这样的域名。**域名系统**（Domain Name System，DNS）要先将名字转换成地址及相关连接参数，传输层才能继续工作。

本篇沿着“查什么、谁来查、缓存什么、怎样保护查询”展开。DNS 排障也依赖这四个问题：一个工具查到了地址，并不表示浏览器采用了同一个解析器；一个查询没有地址，也不表示域名不存在。HTTP、TLS 与 QUIC 的连接细节在[下一篇](/posts/networking/http-evolution-tls-handshake-https/)继续解释，这里先明确 DNS 能提供哪些信息。

## 域名空间与常见资源记录

DNS 是按名字分层管理的分布式数据库。一个**完全限定域名**（Fully Qualified Domain Name，FQDN）从右向左逐级细分：最右侧的根 `.` 之下是**顶级域**（Top-Level Domain，TLD，如 `.com`、`.org`），再往下是 `example.com` 与 `www.example.com`。域名的层级不等于每一级都有独立服务器；管理者通过**区域**（zone）与委派划分权威数据的责任[^1]。

DNS 查询按**资源记录**（Resource Record，RR）类型返回不同用途的数据[^1]：

| 记录类型 | 含义与作用 | 需要区分的细节 |
| --- | --- | --- |
| `A` | IPv4 地址 | 一个名字可以返回多个地址 |
| `AAAA` | IPv6 地址 | 双栈客户端可以同时或相近时间查询 `A` 与 `AAAA` |
| `CNAME` | 指向另一个名字的别名 | 解析器可能继续查询别名目标；不能与同节点 `SOA`、`NS` 等共存，故裸域名（Zone Apex）不能直接配 `CNAME`[^1] |
| `NS` | 某区域的权威域名服务器 | 用于区域权威声明与逐级委派 |
| `TXT` | 文本数据 | 常用于域名验证、SPF 和 DKIM 等应用 |
| `HTTPS` / `SVCB` | **服务绑定记录**（Service Binding Record） | AliasMode 可解决裸域名别名问题，ServiceMode 提供**应用层协议协商**（ALPN）、端口、地址提示与 `ech` 配置[^6][^ech-dns] |

对基于 TCP 的 HTTPS，客户端通常在 TLS 握手中通过**应用层协议协商**（Application-Layer Protocol Negotiation，ALPN）协商 HTTP/1.1 或 HTTP/2。**HTTP/3 使用 QUIC**，需要发现可用端点后建立 QUIC 连接，不能把已有 TCP 连接直接协商成 HTTP/3。`HTTPS` 记录可以提前提供 `h3` 等参数[^6]，HTTP 的 `Alt-Svc` 信息也可以用于发现 HTTP/3 服务[^http3]。

因此，DNS 不只是返回一个 IP 的通讯录。`HTTPS` 是独立的查询类型，不是每次 `A` / `AAAA` 响应都会自动附送的固定字段；ServiceMode 的参数也是可选组合，不能假定每条记录都同时携带 `alpn`、地址提示和 `ech`。使用 `HTTPS` 记录的客户端还要理解记录参数及失败回退；旧客户端则可能只查询 `A` / `AAAA`。ECH 所需的 `ECHConfigList` 由 RFC 9848 定义的 `ech` 参数分发，实际加密机制属于 RFC 9849，见[下一篇的 ECH 说明](/posts/networking/http-evolution-tls-handshake-https/#ech保护真实的-clienthello)。

## 递归与迭代：一次查询如何穿越层级

应用通常把查询交给系统服务或浏览器内置解析器，而不直接询问根服务器。先区分三个角色：

- **存根解析器**（Stub Resolver）：把查询交给配置好的递归解析器；系统实现还可能综合静态映射、缓存与不同网络的解析策略。
- **递归解析器**（Recursive Resolver）：使用缓存并按需要向其他服务器发起迭代查询，最终返回答案或失败状态。运营商 DNS 与公共 DNS 都可以承担这一职责。
- **权威名称服务器**（Authoritative Name Server）：提供某个区域的权威数据。根区有 13 个命名的服务器标识，实际由分布在多地的许多实例提供服务，不能理解成只有 13 台物理机器。

以下是忽略缓存、别名和查询最小化等细节的单次 `A` 查询示意；`192.0.2.80` 是文档地址，不是当前真实解析结果[^1]：

```mermaid title="一次未命中缓存的 DNS 查询" description="中间三步都由递归解析器发起，不是根服务器把请求转发给下一层。根与 .com 返回委派，最终权威服务器返回示例地址 192.0.2.80，再由递归解析器答复 Stub。这里忽略缓存、别名与查询最小化，不代表每次解析都访问全部层级。"
flowchart TB
 stub["Stub 提交请求<br/>example.com. A"]
 subgraph resolver[递归解析器的迭代查询]
  root["向根服务器查询<br/>取得 .com 委派"]
  tld["向 .com 服务器查询<br/>取得 example.com 委派"]
  auth["向目标区域权威查询<br/>取得 A = 192.0.2.80"]
  root --> tld
  tld --> auth
 end
 stub --> root
 auth --> answer["向 Stub 返回答案"]
```

客户端请求递归服务（置位 `RD=1`），意思是让解析器完成后续工作，而不是只返回下一站。解析器对权威服务器通常进行非递归查询，沿委派继续向下。委派响应可能附带服务器地址，其中为打破委派解析依赖而提供的地址称为**胶水记录**（glue）；不能把所有附加段地址都笼统叫作胶水。

传统 DNS over UDP 的报文上限为 512 字节[^1]；现代解析器通过 **DNS 扩展机制**（Extension Mechanisms for DNS，EDNS(0)）携带 OPT 伪记录协商更大的 UDP 载荷（工程上常建议限制在 1232 字节内以避免 IP 分片）。若响应仍超出协商上限，响应头部置 `TC=1`（Truncated），客户端需要改用 TCP/53 获取完整数据。TCP/53 也可以直接用于查询并复用连接；它并非只供截断后的补救。现代通用 DNS 实现需要支持 UDP 与 TCP，网络只放行 UDP/53 可能造成部分查询失败[^dns-tcp]。

## 缓存、TTL 与错误结果

### 缓存层级与 TTL

浏览器、系统服务、路由器转发器和递归解析器都可能缓存结果，但它们不一定全部出现在同一条查询路径上。浏览器内置 DoH 可能绕过系统解析服务；`/etc/hosts` 是本地静态映射，也不能直接当作遵循 DNS TTL 的缓存。

DNS 的**生存时间**（Time to Live，TTL，单位秒）用于约束记录的缓存使用时间，与 IP 头中用于限制转发跳数的 TTL 含义不同。重复命中同一份尚未刷新的缓存时，通常能观察到剩余 TTL 下降。预取刷新、公共解析服务的不同缓存后端会改变观察结果；标准还允许在规定条件下暂时提供过期数据（serve stale），因此不能把“TTL 到零”理解成所有实现都必须在这一刻同步查询上游[^stale]。

一条解析路径还可能涉及多个 TTL：别名的 `CNAME`、目标名的 `A` / `AAAA`、单独查询的 `HTTPS` RRset 都有各自的缓存期限。某个地址记录到期，并不自动使相关的全部记录同时到期。下面仅示意同一名字下三类正向记录，不表示客户端必定查询全部类型：

```mermaid title="不同 DNS 记录分别计时" description="A、AAAA 与 HTTPS 是独立的查询类型，每个缓存 RRset 有自己的剩余 TTL。图中数值仅用于比较，既不是固定默认值，也不是整个网站共用的倒计时；缓存后端与刷新策略还会影响实测。"
flowchart LR
 name["example.com. 的查询"] -->|A| ipv4["IPv4 地址 RRset<br/>剩余 TTL 60 秒"]
 name -->|AAAA| ipv6["IPv6 地址 RRset<br/>剩余 TTL 120 秒"]
 name -->|HTTPS| service["服务绑定 RRset<br/>剩余 TTL 300 秒"]
```

### 没有地址：名字不存在，还是解析没完成？

先检查状态与各段记录，再解释“空答案”：

| 结果 | 表示什么 | 排障时不能推导什么 |
| --- | --- | --- |
| `NXDOMAIN` | 查询的名字不存在；有别名链时需检查最终目标 | 不能只因暂时失败就使用这个结论 |
| `NODATA` | 名字存在，但没有请求类型的数据 | 它不是独立 RCODE，常见形式是 `NOERROR` 且无相应答案；不能只看答案数为 0 就下结论 |
| `SERVFAIL` | 解析器未能完成查询，如上游失败或 DNSSEC 验证失败 | 不证明名字不存在 |
| 超时 | 在工具的等待预算内没有收到可用响应 | 不证明服务器宕机，也不证明不存在；还可能是路径、过滤或接管问题 |

`NXDOMAIN` 与 `NODATA` 可以执行**否定缓存**（Negative Caching）。按 RFC 2308，携带 SOA 的权威否定应答，其否定缓存 TTL 由 SOA 记录自身 TTL 与 `SOA.MINIMUM` 字段的较小值决定。`SERVFAIL` 等解析失败也可能按失败缓存规则短暂保留，用于避免反复冲击失败的上游；再次立即查询得到同样失败，不证明解析器已经重新联系权威服务器。它与携带 SOA 的不存在结果有不同的缓存规则，不应把所有失败都解释成同一类“域名不存在缓存”[^negative]。

:::tip[改完记录仍查不到时，先保存完整响应]
用 `dig example.com A` 查看 `status`、`ANSWER`、`AUTHORITY` 和 TTL，再与系统解析结果对照。只使用 `+short` 容易把不存在、没有该类型记录与某些失败都压成一段空输出。清缓存之前先记录证据，也能避免把缓存刷新与其他同时发生的变化混在一起。
:::

### CDN 调度与双栈连接

权威服务器一般能看到向它查询的递归解析器地址。**EDNS 客户端子网**（EDNS Client Subnet，ECS）允许解析器附带客户端地址前缀，可能影响权威端的地域调度；同时也会向更多参与者暴露客户端网络信息。公共解析服务可能使用任播与地域节点，CDN 也可能结合其他信号，不能仅凭公共 DNS 的品牌或注册地断定一定绕路[^ecs]。

DNS 返回多个地址后，怎样选连接是下一阶段的问题。**Happy Eyeballs** 让支持该机制的客户端按策略安排 IPv6、IPv4 连接尝试，减少一条地址族路径异常造成的等待；它不是 DNS 自动修复地址，也不是保证每次都由 IPv6 或某个固定地址获胜[^happy]。诊断时应把“返回了什么地址”与“实际连上了哪个地址”分开，后者可以在[第八篇的 curl 阶段观察](/posts/networking/network-diagnostics-performance-troubleshooting/)中继续核对。

## DNSSEC 与加密 DNS：数据认证和通道保密

### DNSSEC 验证数据，不隐藏查询

普通 DNS 报文没有内建的传输保密。伪造应答需要通过事务 ID、端口、查询内容等匹配检查；仅凭“抢先发一个同事务 ID 回包”不足以描述所有实现的接受条件。**域名系统安全扩展**（DNS Security Extensions，DNSSEC）增加数据来源认证、完整性保护和经过认证的不存在证明，使验证者能够沿信任链检查签名；它不加密名字或答案[^dnssec]。

客户端若把验证交给递归解析器，还需要信任该解析器及与它之间的通信。`dig +dnssec` 只是请求相关 DNSSEC 数据，本身不等于完成独立验证；`AD` 标志的意义也依赖可信的解析器与通道，不能从任意来源的一个标志就推导安全性。

### DoT、DoH 与 DoQ 保护查询通道

DoT、DoH、DoQ 在使用正确的服务端认证时，保护客户端到所选解析服务这一段传输[^2][^3][^4]：

| 协议 | 传输与默认端口 | 消息组织 | 边界与权衡 |
| --- | --- | --- | --- |
| **DoT**（DNS over TLS） | TCP + TLS，853 | 带 2 字节长度前缀的 DNS 消息 | 专用端口便于识别，也可能被网络策略限制 |
| **DoH**（DNS over HTTPS） | HTTPS，通常 443 | HTTP 请求承载 DNS 消息 | 可使用 HTTP/2 或 HTTP/3；共享端口不保证可用，也不消除 HTTP 元数据关联风险 |
| **DoQ**（DNS over QUIC） | QUIC / UDP，853 | 每次查询使用独立双向流 | 避免跨流的按序交付阻塞；仍受共享拥塞控制及 UDP 可达性影响 |

加密 DNS 不能阻止解析器本身看到查询；也不自动保护解析器到权威端的全部后续链路[^5]。它与 DNSSEC 可组合：一项认证 DNS 数据，一项保护所选通道。网站连接若未使用 ECH，旁观者还可能从 TLS SNI 得到域名；即使两者都启用，目标 IP 和流量模式仍然可见，详见[下一篇的可见性边界](/posts/networking/http-evolution-tls-handshake-https/#端到端可见性边界谁能看到什么)。

域名形式的 DoH 服务（如 `https://dns.google/dns-query`）还需要**引导解析**（bootstrap）：客户端必须先有办法取得解析服务自己的地址。地址可以来自既有缓存、预配置 IP、另一套可用解析服务等；不必然要求一次明文查询。取得 IP 后仍需按服务名验证 TLS 身份，不能因为使用预置 IP 就省略认证。

:::important[网站、代理节点与 DNS 服务是三个解析对象]
开启代理后，目标网站、代理节点自身、加密 DNS 服务自身可能分别使用不同的解析路径。Fake-IP 能让代理先返回映射地址，但是否需要本地真实解析仍取决于规则与出站协议。具体接管与配置职责见[第七篇](/posts/networking/proxies-tunnels-transparent-interception/)，不能把“开了 TUN”当作全部查询都由同一个解析器完成的证据。
:::

## 观察域名解析与缓存：实验与边界

以下 `dig`、系统名称服务与 curl 命令会查询实际解析服务或访问外网，应在本机终端运行；在线 Playground 即使允许网络，也使用它自己的解析器与网络路径，不能用来验证你的系统缓存、DNS 接管或 TUN 行为。没有外网实验条件时，可先阅读响应字段和记录类型示例，不把未执行的查询当成实测结果。

### 实验一：追踪独立的委派查询

先记录工具版本，再执行有界等待的查询：

```bash
dig -v
dig +time=2 +tries=1 +trace example.com A
```

`dig +trace` 起步通常先向默认解析器或 `@server` 指定的解析器查询根区 NS，然后自行跟随根、顶级域、权威服务器的委派。它不是读取本地 root hints 文件后完整复现浏览器路径；缺失服务器地址时，还可能借助本地配置的解析器补查地址[^dig-trace]。

观察每段末尾的 `Received ... from ...`，区分这一段实际向哪个地址发送查询。若第一段根 NS 就失败，只能说明这次引导未完成；若在后续某段超时，应保存该段信息，不能把一条受限网络中的失败 trace 写成域名坏了。

### 实验二：对照记录类型与 TTL

```bash
dig +time=2 +tries=1 @1.1.1.1 example.com A
dig +time=2 +tries=1 @1.1.1.1 example.com A
dig +time=2 +tries=1 @1.1.1.1 cloudflare.com TYPE65
```

前两条比较答案与剩余 TTL；只有命中同一份未刷新缓存时，才适合用“TTL 随时间下降”解释。查询耗时还包含网络往返等因素，不能保证第二次一定更快。第三条使用 `HTTPS` 的数字类型 `TYPE65`，兼容 DiG 9.10.6 等不识别 `HTTPS` 类型名称的旧版本；支持名称的新版也可写 `HTTPS`。旧工具可能只显示通用编码，不能要求一定打印 `alpn="h3,h2"`。

### 实验三：对照系统解析结果

macOS 可以查询系统名称服务：

```bash
dscacheutil -q host -a name example.com
```

Linux 按实际配置选用 `resolvectl query example.com` 或 `getent ahosts example.com`。再对照 `curl -v --noproxy '*' https://example.com/ -o /dev/null` 的解析与连接地址；浏览器内置 DoH 仍可能形成另一条路径。

### 接管环境中的查询结果

启用 TUN 与 DNS 接管时，可能遇到下面这些结果。解释输出之前，要先区分命令指定的目标与实际处理查询的服务：

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

[^1]: [RFC 1034 §3、§4](https://www.rfc-editor.org/rfc/rfc1034.html#section-3)与[RFC 1035 §3.2](https://www.rfc-editor.org/rfc/rfc1035.html#section-3.2)——域名空间、区域委派、递归解析和资源记录格式

[^2]: [RFC 7858 §3](https://www.rfc-editor.org/rfc/rfc7858.html#section-3)——DoT 的 TLS 连接、TCP/853 与 DNS 消息长度前缀

[^3]: [RFC 8484 §4](https://www.rfc-editor.org/rfc/rfc8484.html#section-4)——DNS 消息与 HTTPS 请求、响应的映射

[^4]: [RFC 9250 §4、§5](https://www.rfc-editor.org/rfc/rfc9250.html#section-4)——DoQ 的端口、流映射、连接与恢复边界

[^5]: [RFC 9076 §6](https://www.rfc-editor.org/rfc/rfc9076.html#section-6)——加密 DNS 下仍存在的解析器可见性、元数据关联和隐私限制

[^6]: [RFC 9460 §7、§9](https://www.rfc-editor.org/rfc/rfc9460.html#section-7)——HTTPS 记录及 ALPN、端口、地址提示等服务参数

[^ech-dns]: [RFC 9848 §3](https://www.rfc-editor.org/rfc/rfc9848.html#section-3)——`ech` 服务参数携带 ECHConfigList；与 RFC 9460 的通用服务绑定框架分工

[^http3]: [RFC 9114 §3.1](https://www.rfc-editor.org/rfc/rfc9114.html#section-3.1)——HTTP/3 端点发现、替代服务与后续 QUIC 连接；HTTPS 记录通告 `h3` 的具体示例见[RFC 9460 §10.4.1](https://www.rfc-editor.org/rfc/rfc9460.html#section-10.4.1)

[^dns-tcp]: [RFC 7766 §5、§6](https://www.rfc-editor.org/rfc/rfc7766.html#section-5)——通用 DNS 对 TCP 的支持要求，以及直接使用与复用 TCP 连接

[^stale]: [RFC 8767 §4](https://www.rfc-editor.org/rfc/rfc8767.html#section-4)——在规定条件下使用过期 DNS 数据；TTL 的通常模型不能包办所有缓存行为

[^negative]: [RFC 2308 §2、§3、§5](https://www.rfc-editor.org/rfc/rfc2308.html#section-2)——NXDOMAIN、NODATA 与 SOA 负缓存 TTL；[RFC 9520](https://www.rfc-editor.org/rfc/rfc9520.html)另行规定解析失败缓存

[^ecs]: [RFC 7871 §6、§11](https://www.rfc-editor.org/rfc/rfc7871.html#section-6)——ECS 地址前缀、缓存与隐私权衡

[^happy]: [RFC 8305 §3–§5](https://www.rfc-editor.org/rfc/rfc8305.html#section-3)——双栈解析、地址排序与连接尝试的调度

[^dnssec]: [RFC 4033 §3、§4、§7](https://www.rfc-editor.org/rfc/rfc4033.html#section-3)——DNSSEC 的数据认证、完整性、不存在证明、非保密性，以及存根对验证解析器的信任

[^dig-trace]: [ISC: How does dig +trace work?](https://kb.isc.org/docs/aa-00208)——起步向所选解析器发现根 NS、随后跟随委派，以及缺失地址时的补充解析

---
title: "计算机网络（四）：TCP、UDP、Socket 与可靠传输"
description: "对比 TCP 字节流与 UDP 数据报，解释握手、确认、重传与窗口控制，结合可运行的 Rust 程序说明短读、短写、EOF、半关闭及超时，并界定 QUIC 多流与连接迁移的保证。"
publishDate: "21 Nov 2026"
tags: ["networking", "rust"]
---

上一篇[《计算机网络（三）：路由转发、NAT 与虚拟网络接口》](/posts/networking/routing-forwarding-nat-virtual-interfaces/)解释了数据包怎样抵达目标主机。网络层的 IP 提供尽力而为的交付：包可能丢失、乱序或重复；IP 地址也没有说明该由主机内哪个应用接收。

本篇先比较**传输控制协议**（Transmission Control Protocol，TCP）字节流与**用户数据报协议**（User Datagram Protocol，UDP）数据报，再解释 TCP 怎样管理连接与在途数据，最后回到应用实际使用的 Socket 接口。两条线需要同时理解：网络协议提供什么服务，某次 API 调用又完成了哪一步。代码选用 Rust 标准库（无需第三方依赖即可直接展示 `TcpStream` 半关闭、短读与短写边界），连接状态观察以 macOS 与 Linux 为例。

读完本篇后，你应能：

- 区分 TCP 字节流、UDP 数据报与 QUIC 多路复用流。
- 解释写入、ACK、应用读取、半关闭和 TIME_WAIT 的不同保证。
- 用回环程序验证 EOF，并说明拥塞控制与 QUIC 连接迁移的边界。

## 端口复用与两条传输抽象：字节流 vs 数据报

传输层通过 16 位的**端口号**（Port，范围 `0–65535`）区分通信端点。同一个监听端口可以接受多条连接；在通常的 TCP/IP 讨论中，连接可用五元组 `(协议, 源 IP, 源端口, 目的 IP, 目的端口)` 区分，其中 TCP 自身使用两端地址与端口组成的四元组识别连接[^1]。

| 对比维度 | TCP | UDP |
| --- | --- | --- |
| 服务模型 | 面向连接、可靠、有序的字节流 | 无连接、尽力而为的独立数据报 |
| 消息边界 | 不保留应用的写入边界，读写次数不要求对应 | 保留数据报边界；普通接收调用处理一个数据报，缓冲区不足时可能截断 |
| 头部开销 | 至少 20 字节，含选项可达 60 字节 | 固定 8 字节 |
| 流量与拥塞控制 | 接收窗口与拥塞控制共同约束发送 | 协议本身不提供，应用或上层协议负责 |
| 典型应用 | HTTP/1.1–2、SSH、数据库连接 | DNS 查询、实时媒体、QUIC 的底层载体 |

UDP 的“保留边界”不表示每次都能取得完整消息。Rust `UdpSocket::recv_from` 明确说明：消息超过调用方提供的缓冲区时，超出的字节可能被丢弃；具体返回和截断指示依接口与平台而定。一次成功发送也不保证对端收到该数据报[^2][^udp-api]。

TCP 中，发送方分别写入 `"hello "` 和 `"world"`，接收方可能一次读到两者，也可能多次才读完。TCP 提供可靠、有序的字节流，但连接仍可能报错或中断；**可靠传输不等于每次业务请求都一定完成**。需要区分请求与响应时，应用必须定义**帧定界**（framing），例如固定长度、长度前缀或分隔符。[第六篇的 HTTP 消息](/posts/networking/http-evolution-tls-handshake-https/)会展示应用协议怎样使用这一契约。

## TCP 的可靠传输与连接生命周期

TCP 在两端维护序号、窗口、计时器与连接状态等记录，通常称为**传输控制块**（Transmission Control Block，TCB）[^1]。

### 建立与关闭：三次握手和 TIME-WAIT

通常的主动建连过程是：客户端发送 `SYN`，**初始序列号**（Initial Sequence Number，ISN）为 $x$；服务端回复 `SYN-ACK`，携带自身初始序号 $y$ 并确认 $x+1$；客户端再确认 $y+1$。这个交换使双方同步初始序号，并确认对方能够接收自己的序号信息；连接状态机还必须处理旧报文与重复报文，避免把滞留的连接请求误认为新的有效连接[^1]。

TCP 的两个方向可以分别结束。调用 `shutdown(Write)` 表示不再发送；FIN 在该方向先前排队的字节之后占据序号，按序结束字节流，对端须先读完此前的字节，非空缓冲区的读取才会返回**文件结束符**（End of File，EOF）[^shutdown][^1]。本端仍可以接收对方的响应，这称为**半关闭**（half-close）。正常关闭常画成四段报文，但 ACK 与 FIN 可以合并，也存在同时关闭，不能要求每次抓包都恰好出现四个包。

在通常的非同时关闭流程中，先发 FIN 的主动关闭端等待自己的 FIN 被确认，再接收对方 FIN 并发出最终 ACK，进入 **`TIME-WAIT`**。这取决于关闭顺序，客户端与服务端都可能成为这一端；同时关闭时也可能两端都进入该状态。规范中的等待长度为 `2 MSL`（**最大报文段生存时间**，Maximum Segment Lifetime，MSL），用于在对方重传 FIN 时重新确认，并让旧连接的残留报文在网络中失效；具体系统的计时与连接复用策略应按实现理解，不能从“等待几十秒”倒推所有平台的统一常量[^1]。

用状态表区分正常关闭与异常终止。以下正常路径假定 A 先关闭写方向、B 稍后关闭，且 FIN 与 ACK 不合并[^1]：

| 事件 | A 的状态 | B 的状态与含义 |
| --- | --- | --- |
| A 发 FIN，B 收到 | `FIN-WAIT-1` | `CLOSE-WAIT`；读完此前字节后收到 EOF，仍可发送 |
| B 确认 A 的 FIN，A 收到 ACK | `FIN-WAIT-2` | 等待本地应用关闭发送方向 |
| B 发 FIN | 仍在等待对端结束 | `LAST-ACK` |
| A 收到 FIN，发最终 ACK；B 收到 ACK | `TIME-WAIT` | `CLOSED` |
| 另一种路径：收到并接受有效 RST | 终止相应连接 | 错误如何暴露给应用取决于读写操作与缓冲状态 |

FIN 按序关闭一个方向，RST 则复位连接。即使收到 RST，此前请求也可能已被业务处理，重试仍需考虑幂等性。意外断网可能没有 FIN 或 RST，需等超时或后续通信发现。

### 序号、确认与重传

TCP 为字节流分配序号，并通过确认与计时器判断传输进度：

- **累计确认**（Cumulative ACK）：ACK 序号表示下一个期望的字节序号，其前面的字节已经按序收到。确认由 TCP 接收端产生，不代表接收应用已经处理数据。
- **选择性确认**（Selective Acknowledgment，SACK）：接收方还可报告已收到的非连续字节块，帮助发送方选择需要重传的部分[^sack]。
- **重传超时**（Retransmission Timeout，RTO）：发送端根据**往返时延**（Round-Trip Time，RTT）测量估算超时阈值，超时后重传并按规范退避；并不是每个报文段都有一个彼此独立的简单闹钟[^rto]。
- **快速重传**（Fast Retransmit）：RFC 5681 描述的经典算法在收到三个重复 ACK 后重传疑似丢失的段。重复 ACK 是推断线索，并非丢包的绝对证明，现代实现也可能采用其他丢失检测机制[^3]。

### 流量控制 vs 拥塞控制

**流量控制**（flow control）保护接收端。接收端通告**接收窗口**（receive window，`rwnd`），告知发送端当前可接受的序号范围；应用迟迟不读，窗口可能收缩至零。窗口和接收缓冲区相关，但不宜把每次通告值机械地等同于某个工具显示的空闲缓冲字节数[^1]。

**拥塞控制**（congestion control）约束发送端给网络施加的负载。发送端维护**拥塞窗口**（congestion window，`cwnd`），通过 ACK、丢包、**显式拥塞通知**（Explicit Congestion Notification，ECN）等反馈估计可用的发送空间。RFC 5681 描述慢启动、拥塞避免、快速重传与快速恢复；它是经典机制的依据，不代表所有实现都只运行这一套算法[^3]。

在简化的窗口模型中，允许存在的未确认在途数据量受 $\min(\text{cwnd}, \text{rwnd})$ 约束；已有在途数据会占用额度，并不是每收到一个 ACK 都能重新发送一个完整窗口。这里限制的是传输中的序号范围，不规定应用每次 `read` 的缓冲区大小或返回多少字节。应用供数、发送缓冲与发送节奏还会进一步影响吞吐。[第八篇的带宽时延积](/posts/networking/network-diagnostics-performance-troubleshooting/)会用这条关系解释“带宽充足但单连接跑不满”。

:::note[BBR 改变拥塞估计，不取消其他限制]
丢包型算法在某些大缓冲路径上可能形成较长排队。BBR 以带宽与往返传播时延的估计指导发送，具体效果取决于算法版本、竞争流量与路径条件，不能据此承诺开启后必然更快。即使拥塞控制更适合当前路径，也不能突破接收窗口不足或应用供数过慢的限制[^bbr]。
:::

常见拥塞控制的区别在于怎样估计和使用网络容量，而不是改变 TCP 的字节流服务：

| 机制 | 主要控制依据 | 需要保留的边界 |
| --- | --- | --- |
| Reno 风格的经典算法 | 慢启动、拥塞避免及丢失反馈，拥塞避免近似线性增窗 | RFC 5681 是基础机制，不是所有系统的默认实现 |
| CUBIC | 以距上次拥塞事件的时间和三次函数调整窗口 | RFC 9438；仍需丢失恢复、接收窗口与发送节奏配合[^cubic] |
| BBR | 估计瓶颈带宽与传播时延，控制 pacing 和在途数据 | 设计和效果随版本变化；引用的 BBRv3 文档是草案，不是正式 RFC[^bbr] |

## Socket 接口与内核缓冲区契约

第一篇的[Socket 边界](/posts/networking/layered-architecture-packet-journey/#操作系统边界socket-与网络接口)说明了应用怎样把字节交给操作系统。普通 TCP Socket 可以按下面的方向理解：

```mermaid mobile-direction="TB" title="TCP 字节从发送应用到接收应用" description="这是单向字节流的交付路径。write 成功只表示相应字节被本地发送路径接受，不证明对端已经读取或处理；一次写入与一次读取没有固定的一一对应关系。"
flowchart LR
 subgraph local[发送端]
  direction TB
  sender["发送应用"] -->|write / send| send_buffer["本机发送缓冲"]
 end
 subgraph remote[接收端]
  direction TB
  receive_buffer["对端接收缓冲"] -->|read / recv| receiver["接收应用"]
 end
 send_buffer -->|TCP/IP 与网络| receive_buffer
```

`write`/`send` 成功返回 `n`，只说明本次调用接受了前 `n` 个字节。在普通缓冲式 TCP 实现中，这通常对应本机内核发送缓冲区的接纳；它既不证明网卡已经发出，也不证明对端内核已收到这些字节，更不证明对端应用层已完成业务处理[^send-man]。这个区别与并发系列中[消息入队和处理完成](/posts/concurrency/message-passing-workers-backpressure/#消息交付与处理完成)相同：业务确认需要应用协议表达。

### 短读、短写、EOF 与 WouldBlock

Rust 标准库的 `Read`、`Write` 和 `TcpStream` 文档给出几项必须单独处理的结果[^read][^write][^5]：

| 操作结果 | 应怎样解释 |
| --- | --- |
| `read` 返回 `0 < n < buf.len()` | 合法的短读；只处理 `buf[..n]`，不能据此判断消息结束 |
| `write` 返回 `n < data.len()` | 合法的短写；后续需要继续写剩余部分 |
| 对 TCP 使用非空缓冲区，`read` 返回 `0` | 接收方向到达 EOF；仍可能可以向对方发送 |
| 非阻塞读写返回 `WouldBlock` | 暂时不能推进，应等待相应就绪事件；不是 EOF |
| 读写返回错误 | 按错误处理连接状态，不能当作成功或消息边界 |

`write_all` 会循环写入，直到全部接受或报错；`read_exact` 会尝试填满指定缓冲区。它们方便实现已知长度的协议字段，但错误不会撤销此前已完成的部分读写，`read_exact` 也不负责判断一个任意业务消息究竟有多长。

**背压**会沿缓冲传导：对端应用不读，接收窗口可能变为零；本端发送缓冲随后可能耗尽，阻塞写入会等待，非阻塞写入则可能短写或返回 `WouldBlock`。TCP 仍可能发送零窗口探测等控制流量，不能把窗口为零解释成线上绝无数据包。

### 运行一次半关闭：发送结束后继续接收

下面的完整程序在本机终端运行，只连接回环地址，不访问外网。客户端连续写两段字节后关闭发送方向；服务端循环读取到 EOF，再发送响应。接收缓冲只有 5 字节，明确要求程序跨多次读取保留进度，而不靠睡眠假设内核如何合并报文。

```rust frame="code"
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

fn main() -> io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let addr = listener.local_addr()?;
    println!("server listening on {addr}");

    let server = thread::spawn(move || -> io::Result<()> {
        let (mut stream, _) = listener.accept()?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        let mut received = Vec::new();
        let mut buf = [0_u8; 5];
        loop {
            match stream.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => received.extend_from_slice(&buf[..n]),
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
        assert_eq!(received, b"first-frame|second-frame");
        println!("server received {} bytes, then EOF", received.len());
        stream.write_all(b"response after EOF")?;
        stream.shutdown(Shutdown::Write)?;
        Ok(())
    });

    let mut client = TcpStream::connect_timeout(&addr, Duration::from_secs(5))?;
    client.set_read_timeout(Some(Duration::from_secs(5)))?;
    client.set_write_timeout(Some(Duration::from_secs(5)))?;
    client.write_all(b"first-frame|")?;
    client.write_all(b"second-frame")?;
    client.shutdown(Shutdown::Write)?;

    let mut response = String::new();
    client.read_to_string(&mut response)?;
    assert_eq!(response, "response after EOF");
    println!("client received: {response}");
    server.join().expect("server thread panicked")?;
    Ok(())
}
```

将上面的程序保存为 `tcp_half_close.rs`，在该文件所在目录打开本机终端，编译后运行：

```bash frame="code"
rustc tcp_half_close.rs -o tcp_half_close
./tcp_half_close
```

程序先打印监听地址，便于关联连接表，随后输出：

```text
server received 24 bytes, then EOF
client received: response after EOF
```

程序验证了发送方向关闭后仍可接收，以及应用必须累积多次读取结果；它没有证明两次写入对应几个 TCP 段，也没有保证某种读取分组在所有运行中重复出现。

### 超时与异步取消是另一层契约

示例的读写超时限制阻塞操作的等待，连接超时限制建连。它们不是整个业务请求共享的一份总期限。标准库还说明，读写超时在不同系统可能表现为 `WouldBlock` 或 `TimedOut`；错误分类要结合接口文档，不能只按名称推断[^5]。

Tokio 的 `AsyncReadExt::read_exact`、`AsyncWriteExt::write_all` 则是异步扩展接口。若在 `select!` 中取消它们，可能已有部分字节被读走或写出；重新创建操作不代表从原位置重新开始。对应保证应查 Tokio 文档，不能用同步 `std::net::TcpStream` 的文档代替[^tokio]。并发系列的[取消安全](/posts/concurrency/async-concurrency-task-lifecycle/#取消安全中断后能否重来)与[多阶段期限](/posts/concurrency/async-concurrency-task-lifecycle/#多阶段期限与关停责任)分别讨论如何保留进度及期限归属。

## QUIC：为什么在 UDP 之上重建可靠传输

**QUIC**（历史上源自 Quick UDP Internet Connections，IETF 标准 RFC 9000 将其确立为正式协议名称而非首字母缩写）以 UDP 为载体提供多路复用的安全传输。它说明“UDP 本身不保证可靠性”并不妨碍上层协议自行提供确认、重传与拥塞控制[^4]。

UDP 提供端口和数据报承载，使 QUIC 可以在现有 UDP 路径上部署新的传输逻辑，常见实现可随用户态库迭代。QUIC 自己维护包号、ACK、丢失检测、流偏移、流量控制和拥塞控制；丢失的流数据可放入新包号的包重发，不能理解成简单给 UDP 载荷加密。若直接叠在 TCP 上，仍会继承 TCP 整条字节流的按序交付约束，无法仅靠上层分流消除这个等待[^4][^quic-recovery]。

它主要改变了两项边界：

1. **跨流的按序等待**：HTTP/2 多条应用流共享 TCP 字节流，缺失字节会阻止后续字节按序交付，即使后续字节属于其他请求（即传输层**队头阻塞**，Head-of-Line Blocking）。QUIC 的流各自维护偏移量；某条流等待重传时，其他已具备数据的流可以继续交付。但流之间仍共享连接的拥塞控制与部分资源，不能说彼此完全没有影响。
2. **连接与地址组合的关系**：普通 TCP 连接依赖固定地址与端口组合；网络切换导致它们改变时，通常需要重新连接。QUIC 的**连接标识**（Connection ID，CID）将连接识别与固定 IP/端口组合解耦，为在条件允许时保留已有连接提供支持。

```mermaid title="TCP 字节缺口与 QUIC 流内缺口" description="上下比较相同丢包条件下的传输层交付，不按时间或字节比例绘制。HTTP/2 的后续字节受同一 TCP 字节流的缺口阻塞；QUIC 中只有已收到连续偏移、且应用依赖也已就绪的其他流才能继续交付。QUIC 的 ACK 确认包号，流数据按各自偏移重组，并非每条流都有独立的包确认空间；拥塞控制和连接级资源仍可能相互影响。"
flowchart TB
 subgraph tcp_case[HTTP/2 over TCP：共享按序字节流]
  tcp_gap["较早 TCP 字节缺失<br/>后续字节已到达"] --> tcp_wait["等待重传补齐缺口"]
  tcp_wait --> tcp_streams["流 1、流 2 的后续字节<br/>都暂不能由 TCP 向上交付"]
 end
 subgraph quic_case[HTTP/3 over QUIC：按流偏移重组]
  q_gap["流 1 缺少一段偏移"] --> q_wait["流 1 等待补齐"]
  q_ready["其他包中的流 2 数据连续<br/>且应用依赖已满足"] --> q_deliver["流 2 可以交付给应用"]
 end
 tcp_case --- quic_case
 linkStyle 4 stroke:none
```

连接迁移仍需遵循路径验证、迁移参数与 CID 使用规则。主动改变本地地址与 NAT 重绑定并不相同；RFC 9000 §9.5 还规定主动从不同本地地址发送时不能复用同一 CID，不能概括成“带着相同 CID 就能无缝迁移”[^4]。

QUIC 使用 TLS 1.3 完成密钥协商与身份认证，但不使用 TCP 上的 TLS 记录层。新连接通常可以在一次往返后开始发送应用数据；**零往返时间连接建立**（Zero Round-Trip Time，0-RTT）则是满足会话恢复条件时提前发送早期数据，不表示完整握手和身份认证在零往返内结束。早期数据可能被拒绝，还存在重放风险，应用必须限制适用操作[^quic-tls]。

QUIC 也有部署代价：UDP 可能受路径策略影响，高吞吐实现需要控制用户态处理和系统调用开销。浏览器能否回退到 TCP，还取决于是否存在可用的 HTTP/2 或 HTTP/1.1 服务以及客户端策略。[第六篇](/posts/networking/http-evolution-tls-handshake-https/)会继续比较这些 HTTP 传输方式。

## 观察连接状态与缓冲区：实验与边界

### 实验一：分清队列与累计统计

macOS 可以运行：

```bash frame="code"
netstat -anv -p tcp
```

Linux 对应的基本观察命令是 `ss -tn`；需要扩展 TCP 信息时可使用 `ss -tin`，按该工具的版本解释输出。macOS 上述命令中应区分：

- `Local Address`、`Foreign Address`、`state`：地址、端口与本机连接状态。
- `Recv-Q`、`Send-Q`：当前接收、发送队列相关数量，具体统计口径依系统及连接状态而定。
- `rxbytes`、`txbytes`：独立的收发字节统计，不能当作未消费或未确认的字节数；连接空闲时也不要求归零[^apple-netstat]。

一个 `ESTABLISHED` 连接可以同时出现队列为 `0`、`rxbytes` 与 `txbytes` 非零：当前没有队列积压，不代表此前没有收发数据。单次队列快照也不能确定拥塞或应用处理过慢，应在同一连接上重复观察，并结合窗口、重传与应用日志。上述 macOS 命令不展示 `cwnd`。

### 实验二：观察关闭后的状态

运行前面的半关闭程序后，可立即查看回环连接：

```bash frame="code"
netstat -an -p tcp | rg '127\.0\.0\.1.*TIME_WAIT'
```

Linux 可用 `ss -tan state time-wait`。短连接与状态保留时间受实现影响；该列表还可能包含其他进程的连接，需要用本次端口关联，而不能把任意条目当成本程序的证据。`TIME_WAIT` 是正常关闭状态之一，其数量本身不等于发生故障。

:::important[连接状态是本机判断]
`ESTABLISHED` 表示本机 TCP 状态机尚未关闭，不能证明对端此刻在线或路径畅通。远端断电、NAT 映射过期或路径中断，可能要到下一次传输、重传超时或探活失败时才被发现。业务需要判断可用性时，应定义请求期限与应用级确认。
:::

## 总结

- TCP 提供可靠、有序且无消息边界的字节流；UDP 保留数据报边界，接收缓冲不足仍可能截断。
- 接收窗口保护接收端，拥塞控制约束网络负载；ACK、API 写入成功和业务处理完成是不同事件。
- Socket 程序需要分别处理短读、短写、EOF、暂不可用和错误；半关闭允许发送结束后继续接收。
- QUIC 在 UDP 之上提供独立流与连接迁移机制，路径验证、CID 规则和早期数据的重放边界仍需明确。

接下来回到应用取得目标地址的步骤。[《计算机网络（五）：DNS 解析、缓存层级与加密查询》](/posts/networking/dns-resolution-caching-encrypted-queries/)会把域名查询放到已经明确的 UDP、TCP、TLS 和 QUIC 通道上。阅读顺序按机制依赖安排，不等于一次请求的执行顺序。

## 延伸阅读

- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293.html)——系统查阅 TCP 状态机与传输服务
- [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000.html)——查阅 QUIC 流、帧与连接状态

[^1]: [RFC 9293 §2.2、§3.3、§3.4、§3.8](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2)——TCP 字节流、序号、连接状态、关闭与接收窗口；TCB 描述见 §3.10.1。

[^2]: [RFC 768: User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768.html)——UDP 头部与不保证交付、重复保护或顺序的服务。

[^udp-api]: [Rust `UdpSocket::recv_from`](https://doc.rust-lang.org/std/net/struct.UdpSocket.html#method.recv_from)——单次接收一个数据报，缓冲区不足时超出字节可能被丢弃。

[^3]: [RFC 5681 §3](https://www.rfc-editor.org/rfc/rfc5681.html#section-3)——经典 TCP 拥塞控制与快速重传算法。

[^sack]: [RFC 2018 §3–4](https://www.rfc-editor.org/rfc/rfc2018.html#section-3)——SACK 选项与非连续已收字节块。

[^rto]: [RFC 6298 §2、§5](https://www.rfc-editor.org/rfc/rfc6298.html#section-2)——RTO 计算、计时器管理与超时退避。

[^bbr]: [ACM Queue: BBR — Congestion-Based Congestion Control](https://queue.acm.org/detail.cfm?id=3022184)——原始设计论文；另见 [BBR Congestion Control, draft-ietf-ccwg-bbr-07](https://datatracker.ietf.org/doc/html/draft-ietf-ccwg-bbr-07)中 BBRv3 依据带宽与最小 RTT 模型控制 pacing 和窗口的说明。后者仍是 Internet-Draft，并非正式 RFC，也不构成特定网络上的性能保证。

[^4]: [RFC 9000 §2、§5.1、§9、§9.5](https://www.rfc-editor.org/rfc/rfc9000.html#section-9)——QUIC 流、Connection ID、路径验证、连接迁移与地址变化时的 CID 规则。

[^quic-tls]: [RFC 9001 §4.6、§9.2](https://www.rfc-editor.org/rfc/rfc9001.html#section-4.6)——QUIC 中 TLS 的集成、0-RTT 条件、拒绝与重放风险。

[^quic-recovery]: [RFC 9002 §4–§7](https://www.rfc-editor.org/rfc/rfc9002.html#section-4)——QUIC 的丢失检测、探测超时与拥塞控制；流数据重发与新包号见 [RFC 9000 §13.3](https://www.rfc-editor.org/rfc/rfc9000.html#section-13.3)。

[^cubic]: [RFC 9438 §4](https://www.rfc-editor.org/rfc/rfc9438.html#section-4)——CUBIC 的窗口增长函数、拥塞响应及与经典 TCP 算法的关系。

[^5]: [Rust `TcpStream`](https://doc.rust-lang.org/std/net/struct.TcpStream.html)——半关闭、建连与读写超时、非阻塞操作及平台错误差异。

[^read]: [Rust `Read`](https://doc.rust-lang.org/std/io/trait.Read.html)——短读、非空缓冲的零返回值与 `read_exact` 的部分进度。

[^write]: [Rust `Write`](https://doc.rust-lang.org/std/io/trait.Write.html)——短写、`write_all` 的循环与错误边界。

[^tokio]: [Tokio `AsyncReadExt::read_exact`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncReadExt.html#method.read_exact)与[`AsyncWriteExt::write_all`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncWriteExt.html#method.write_all)——这两个异步组合操作在 `select!` 中的取消安全限制。

[^apple-netstat]: Apple `netstat` 的[连接表 `inet.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/inet.c)与[统计输出 `main.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/main.c)——队列使用 socket 缓冲的 `sb_cc`，`rxbytes` / `txbytes` 来自独立的收发统计字段。

[^send-man]: [Linux Programmer's Manual: send(2)](https://man7.org/linux/man-pages/man2/send.2.html)——`send`/`write` 成功返回仅表示数据已写入内核发送缓冲区，不代表对端已接收或处理。

[^shutdown]: [Linux Programmer's Manual: shutdown(2)](https://man7.org/linux/man-pages/man2/shutdown.2.html)——`SHUT_WR` 触发 FIN 发送以关闭写方向同时保留读方向（半关闭），与 `close(2)` 递减描述符引用计数的区别。

---
title: "计算机网络（四）：TCP、UDP、Socket 与可靠传输"
description: "对比 TCP 字节流与 UDP 数据报，解释连接状态、重传、窗口控制与 Socket 读写契约，用可运行的 Rust 程序演示分次读取、EOF 和半关闭，并界定 QUIC 多流与连接迁移的保证。"
publishDate: "21 Nov 2026"
tags: ["networking", "rust"]
---

上一篇[《计算机网络（三）：路由转发、NAT 与虚拟网络接口》](/posts/networking/routing-forwarding-nat-virtual-interfaces/)解释了数据包怎样抵达目标主机。网络层的 IP 提供尽力而为的交付：包可能丢失、乱序或重复；IP 地址也没有说明该由主机内哪个应用接收。

本篇先比较**传输控制协议**（Transmission Control Protocol，TCP）字节流与**用户数据报协议**（User Datagram Protocol，UDP）数据报，接着看 TCP 如何管理连接、确认、重传与窗口，以及这些机制如何反映在 Socket 的读写结果里。QUIC 一节再对照这些机制怎样用于 UDP 之上的可靠传输。示例用 Rust 标准库演示 `TcpStream` 的分次读取、EOF 与半关闭，连接状态观察以 macOS 与 Linux 为例。

## 传输层端点：端口、TCP 字节流与 UDP 数据报

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

## TCP 连接的建立与关闭

TCP 在两端为每条连接维护状态：本地与对端的地址和端口、发送与接收序号、窗口等。RFC 将保存这些变量的连接记录称为**传输控制块**（Transmission Control Block，TCB）；它描述的是协议实现需要维护的状态，不规定操作系统内部结构的布局[^tcb]。

### 连接建立：三次握手

通常的主动建连过程是：客户端发送 `SYN`，**初始序列号**（Initial Sequence Number，ISN）为 $x$；服务端回复 `SYN-ACK`，携带自身初始序号 $y$ 并确认 $x+1$；客户端再确认 $y+1$。这个交换使双方同步初始序号，并确认对方能够接收自己的序号信息；连接状态机还必须处理旧报文与重复报文，避免把滞留的连接请求误认为新的有效连接[^1]。

图中的被动端状态跟随本次连接，监听套接字仍可继续接收其他连接[^tcp-lifecycle]。

```mermaid title="TCP 三次握手：报文方向与两端状态" description="客户端主动打开，服务端被动打开。自上而下读三段报文，注记标记各端在相关发送或接收后进入的状态。本例三段的 TCP 载荷均为空，省略同时打开、重传与超时。"
sequenceDiagram
 participant C as 客户端
 participant S as 服务端
 Note over C: CLOSED
 Note over S: LISTEN
 C->>S: SYN · Seq=x
 Note over C: SYN-SENT
 Note over S: SYN-RECEIVED
 S->>C: SYN+ACK · Seq=y · Ack=x+1
 Note over C: ESTABLISHED
 C->>S: ACK · Seq=x+1 · Ack=y+1
 Note over S: ESTABLISHED
```

这里的确认号都在 TCP 头里。SYN 即使没有载荷也占用一个序号，纯 ACK 则不消耗序号。第三段 ACK 可以带数据，本例取纯 ACK。三个 TCP 控制段都能单独交给 IP，再由当前链路成帧，参见[封装路径对照](/posts/networking/layered-architecture-packet-journey/#同一条链路上的不同封装路径)[^1]。

### 连接关闭：FIN、半关闭与 TIME-WAIT

TCP 的两个方向可以分别结束。调用 `shutdown(Shutdown::Write)` 会关闭写方向。FIN 在该方向先前排队的字节之后占据一个序号，按序结束字节流。对端应用先读完此前的字节，再用非空缓冲区读取时会收到**文件结束**（End of File，EOF）[^shutdown][^1]。本端仍可以接收对方的响应，这称为**半关闭**（Half-Close）。正常关闭常画成四段报文，但 ACK 与 FIN 可以合并，也存在同时关闭，不能要求每次抓包都恰好出现四个包。

在通常的非同时关闭流程中，先发 FIN 的主动关闭端等待自己的 FIN 被确认，再接收对方 FIN 并发出最终 ACK，进入 `TIME-WAIT`。这取决于关闭顺序，客户端与服务端都可能成为这一端；同时关闭时也可能两端都进入该状态。规范中的等待长度为 `2 MSL`（**最大报文段生存时间**，Maximum Segment Lifetime，MSL），用于在对方重传 FIN 时重新确认，并让旧连接的残留报文在网络中失效；具体系统的计时与连接复用策略应按实现理解，不能从“等待几十秒”倒推所有平台的统一常量[^1]。

```mermaid title="TCP 四段关闭：两个方向分别结束" description="A 先关闭写方向，B 先单独确认，稍后才关闭自己的写方向。自上而下读四段控制报文，间距不表示耗时。半关闭期间 B 仍可向 A 发送数据。图中假设这期间无额外数据。"
sequenceDiagram
 participant A as 端点 A
 participant B as 端点 B
 Note over A,B: ESTABLISHED
 A->>B: FIN+ACK · Seq=m · Ack=n
 Note over A: FIN-WAIT-1
 Note over B: CLOSE-WAIT
 B->>A: ACK · Seq=n · Ack=m+1
 Note over A: FIN-WAIT-2
 Note over B: 写方向仍开放
 B->>A: FIN+ACK · Seq=n · Ack=m+1
 Note over B: LAST-ACK
 A->>B: ACK · Seq=m+1 · Ack=n+1
 Note over A: TIME-WAIT
 Note over B: CLOSED
 Note over A: 2 MSL 后 CLOSED
```

图中的 `m`、`n` 是两端关闭前各自的下一个发送序号，每个 FIN 占用一个序号。若两端同时关闭，`FIN-WAIT-1` 收到尚未确认本端 FIN 的对端 FIN 时可进入 `CLOSING`，等本端 FIN 获确认再进入 `TIME-WAIT`。其他状态转换见 RFC 9293 的连接状态图[^tcp-lifecycle]。

对已建立的连接，一端收到带复位标志（`RST`）的报文并按当前状态及序号规则接受它时，会在本地中止该连接。应用在哪次读写看到错误取决于接口与缓冲状态。`RST` 也可用于拒绝建连请求[^1]。已发出的请求仍可能在复位前被对端处理，重试需要考虑幂等性。意外断网可能没有 FIN 或 RST，需等超时或后续通信发现。

## TCP 的序号、确认与重传

TCP 为字节流分配序号，并通过确认与计时器判断传输进度：

- **累计确认**（Cumulative ACK）：ACK 序号表示下一个期望的字节序号，其前面的字节已经连续收到。确认由 TCP 接收端产生，不代表接收应用已经处理数据[^1]。
- **选择性确认**（Selective Acknowledgment，SACK）：接收方还可报告已收到的非连续字节块，帮助发送方选择需要重传的部分[^sack]。
- **重传超时**（Retransmission Timeout，RTO）：发送端根据**往返时延**（Round-Trip Time，RTT）测量估算超时阈值，超时后重传并按规范退避；并不是每个报文段都有一个彼此独立的简单闹钟[^rto]。
- **快速重传**（Fast Retransmit）：RFC 5681 描述的经典算法在收到三个重复 ACK 后重传疑似丢失的段。重复 ACK 是推断线索，并非丢包的绝对证明，现代实现也可能采用其他丢失检测机制[^3]。

把这些字段放进具体报文。沿用[第三篇无 NAT 的路由实验](/posts/networking/routing-forwarding-nat-virtual-interfaces/#同一个-ip-包经过三段以太网链路)：A 为 `192.168.1.10:50001`，B 为 `198.51.100.20:443`，两端 TCP 已建立。假设 A 下一个发送序号为 `1001`，B 下一个发送序号为 `7001`，接下来只有 A 向 B 发送数据。

```mermaid title="TCP 数据、累计确认与超时重传" description="已建立的连接，使用绝对示例序号。虚线标记途中丢失的报文，B 未收到。超时前没有后续数据，本例由 RTO 触发重传。各段均置 ACK 标志，Len 只计 TCP 载荷，间距不代表耗时。"
sequenceDiagram
 participant A as A · 端口 50001
 participant B as B · 端口 443
 A->>B: Seq=1001 · Ack=7001 · Len=100
 B->>A: Seq=7001 · Ack=1101 · Len=0
 A-->>B: 途中丢失 · Seq=1101 · Len=60
 Note over A: 未收到确认，RTO 到期
 A->>B: 重传 Seq=1101 · Ack=7001 · Len=60
 B->>A: Seq=7001 · Ack=1161 · Len=0
```

第一段占据序号 `1001…1100`，所以 B 回复 `Ack=1101`；第二段占据 `1101…1160`，补齐后回复 `Ack=1161`。`Ack` 是确认号字段，`ACK=1` 则表示确认标志置位；`Len` 只计 TCP 载荷，不包含 TCP 头。这里纯 ACK 不携带数据，也不含 SYN 或 FIN，因此不消耗发送序号，B 的 `Seq` 一直为 `7001`[^1]。

每个 A → B 包的 IP 头仍为 `192.168.1.10 → 198.51.100.20`，B → A 则相反；当前链路的 MAC 随路由转发而变化。中间路由器不因为转发数据就替 B 产生 TCP ACK。这个确认说明 B 的 TCP 已连续收到对应字节，不说明 B 的应用已经读取或处理；重传也不要求重新使用原来的 IP 标识、TTL 或以太网帧。

## TCP 的流量控制与拥塞控制

**流量控制**（flow control）保护接收端。接收端通告**接收窗口**（receive window，`rwnd`），告知发送端当前可接受的序号范围；应用迟迟不读，窗口可能收缩至零。窗口和接收缓冲区相关，但不宜把每次通告值机械地等同于某个工具显示的空闲缓冲字节数[^1]。

**拥塞控制**（congestion control）约束发送端给网络施加的负载。发送端维护**拥塞窗口**（congestion window，`cwnd`），根据 ACK 和检测到的丢包等反馈调整发送空间。若双方协商了经典**显式拥塞通知**（Explicit Congestion Notification，ECN），支持 ECN 的路由器可以标记 IP 包来通知拥塞，而不必丢掉这一个包；接收方再通过 TCP ACK 把标记反馈给发送方[^ecn]。RFC 5681 描述慢启动、拥塞避免、快速重传与快速恢复；它是经典机制的依据，不代表所有实现都只运行这一套算法[^3]。

在简化的窗口模型中，允许存在的未确认在途数据量受 $\min(\text{cwnd}, \text{rwnd})$ 约束；已有在途数据会占用额度，并不是每收到一个 ACK 都能重新发送一个完整窗口。这里限制的是传输中的序号范围，不规定应用每次 `read` 的缓冲区大小或返回多少字节。应用供数、发送缓冲与发送节奏还会进一步影响吞吐。[第八篇的带宽时延积](/posts/networking/network-diagnostics-performance-troubleshooting/#bdp-与单条-tcp-连接的吞吐边界)会用这条关系解释“带宽充足但单连接跑不满”。

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

第一篇的[Socket 边界](/posts/networking/layered-architecture-packet-journey/#操作系统边界socket-与网络接口)说明了应用怎样把字节交给操作系统。通过普通 TCP Socket，应用读写的是内核 TCP 处理过的连接字节流。通过[第三篇的 TUN 虚拟网络接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#虚拟网络接口tun-与-tap-如何接入协议栈)，用户态程序读写的是带 IP 头的包。下图沿一条 TCP 连接追踪发送应用与接收应用之间的字节交付。

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

**背压**会沿缓冲传导：对端应用不读，接收窗口可能变为零；本端发送缓冲随后可能耗尽，阻塞写入会等待，非阻塞写入则可能短写或返回 `WouldBlock`。TCP 必须支持**零窗口探测**（Zero-Window Probing）：即使窗口为零，发送端仍可用一个新字节（若有）或重传来探测，接收端用 ACK 报告当前窗口。这样，即使窗口重新开放的通知丢失，发送方也能发现窗口再次可用[^zero-window]。

### 运行一次半关闭：发送结束后继续接收

下面的完整程序在本机终端运行，只连接回环地址，不访问外网。客户端连续写两段字节后关闭发送方向。服务端每次调用 `read` 时传入一个 5 字节的用户态缓冲区，循环累积读到的字节，直到 EOF，再发送响应。这个缓冲区的大小只限制单次读取的上限，内核的 TCP 接收缓冲区另有配置。

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

读取 24 字节至少需要五次返回数据的 `read`，其中至少一次是短读。每次读到的字节数与网络上的 TCP 分段没有固定对应关系。服务端在 EOF 后发回响应，客户端关闭发送方向后仍能收到它。两端都用 `write_all` 处理写入进度，程序只演示分次读取、EOF 与半关闭。

### 超时与异步取消是另一层契约

示例的读写超时限制阻塞操作的等待，连接超时限制建连。它们不是整个业务请求共享的一份总期限。标准库还说明，读写超时在不同系统可能表现为 `WouldBlock` 或 `TimedOut`；错误分类要结合接口文档，不能只按名称推断[^5]。

Tokio 的 `AsyncReadExt::read_exact`、`AsyncWriteExt::write_all` 则是异步扩展接口。若在 `select!` 中取消它们，可能已有部分字节被读走或写出；重新创建操作不代表从原位置重新开始。对应保证应查 Tokio 文档，不能用同步 `std::net::TcpStream` 的文档代替[^tokio]。并发系列的[取消安全](/posts/concurrency/async-concurrency-task-lifecycle/#取消安全中断后能否重来)与[多阶段期限](/posts/concurrency/async-concurrency-task-lifecycle/#多阶段期限与关停责任)分别讨论如何保留进度及期限归属。

## QUIC：为什么在 UDP 之上重建可靠传输

**QUIC**（历史上源自 Quick UDP Internet Connections，IETF 标准 RFC 9000 将其确立为正式协议名称而非首字母缩写）以 UDP 为载体提供多路复用的安全传输。它说明“UDP 本身不保证可靠性”并不妨碍上层协议自行提供确认、重传与拥塞控制[^4]。

UDP 提供端口和数据报承载，使 QUIC 可以在现有 UDP 路径上部署新的传输逻辑，常见实现可随用户态库迭代。QUIC 自己维护包号、ACK、丢失检测、流偏移、流量控制和拥塞控制；丢失的流数据可放入新包号的包重发，不能理解成简单给 UDP 载荷加密。若直接叠在 TCP 上，仍会继承 TCP 整条字节流的按序交付约束，无法仅靠上层分流消除这个等待[^4][^quic-recovery]。

它主要改变了两项边界：

1. 跨流的按序等待：HTTP/2 多条应用流共享 TCP 字节流，缺失字节会阻止后续字节按序交付，即使后续字节属于其他请求（即传输层**队头阻塞**，Head-of-Line Blocking）。QUIC 的流各自维护偏移量；某条流等待重传时，其他已具备数据的流可以继续交付。但流之间仍共享连接的拥塞控制与部分资源，不能说彼此完全没有影响。
2. 连接与地址组合的关系：普通 TCP 连接依赖固定地址与端口组合；网络切换导致它们改变时，通常需要重新连接。QUIC 的**连接标识**（Connection ID，CID）将连接识别与固定 IP/端口组合解耦，为在条件允许时保留已有连接提供支持。

| 接收端的字节视图 | 首段 | 中段 | 后段 |
| --- | --- | --- | --- |
| HTTP/2 的共享 TCP 字节流 | 流 1 字节已交付 | **流 1 字节缺失** | 流 2 字节已到，但被前面的缺口挡住 |
| QUIC 流 1 | 已交付 | **缺失** | 后续字节等待流内缺口补齐 |
| QUIC 流 2 | 已交付 | 后续偏移连续，可继续交付 | 继续按本流偏移交付 |

每行从左到右按该行的字节偏移读。TCP 行使用连接级字节序号，QUIC 两行各有自己的偏移起点。这里选用 QUIC 流 2 的连续数据已通过其他包抵达、应用依赖也已就绪的情形。

以客户端从 Wi-Fi 切到蜂窝网络为例：主动迁移要等握手确认，并受服务端通告的迁移参数限制。服务端发现之前未验证的客户端地址时，需要验证新路径；CID 能识别原连接，却不能证明新路径可达。为避免跨路径关联，从不同本地地址发包不能复用同一个 CID。NAT 重绑定则可能在客户端没有主动换地址、也未换 CID 的情况下改变服务端看到的源地址或端口，仍需按规则验证未验证的地址。QUIC v1 通常由客户端发起迁移；服务端通过 `preferred_address` 通告备用地址是另有规则的情形[^quic-migration]。

QUIC 使用 TLS 1.3 协商密钥并认证对端。TLS 握手消息经 QUIC 的 `CRYPTO` 帧可靠送达，而应用字节流走 `STREAM` 帧，由 QUIC 保护包，不使用 TLS 记录层。通常不经 Retry 的完整握手中，客户端可在一次往返后开始发送受 1-RTT 密钥保护的应用数据。满足会话恢复条件时，客户端可以尝试发送**早期数据**（early data，0-RTT），但这不表示完整握手和身份认证在零往返内结束。早期数据可能被拒绝，还存在重放风险，应用必须限制适用操作[^quic-tls]。

QUIC 也有部署代价：UDP 可能受路径策略影响，高吞吐实现需要控制用户态处理和系统调用开销。浏览器能否回退到 TCP，还取决于是否存在可用的 HTTP/2 或 HTTP/1.1 服务以及客户端策略。[第六篇](/posts/networking/http-evolution-tls-handshake-https/)会继续比较这些 HTTP 传输方式。

## TCP 状态与队列观测实验

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

运行前面的半关闭程序后，可立即在 macOS 用系统自带的 `grep` 筛出回环连接：

```bash frame="code"
netstat -an -p tcp | grep -E '127\.0\.0\.1.*TIME_WAIT'
```

Linux 可用 `ss -tan state time-wait`。程序中的客户端先关闭写方向，因此本次运行若看到 `TIME_WAIT`，应把程序打印的服务端监听端口与该记录的对端端口核对。状态保留时间受实现影响，列表还可能包含其他进程的连接。`TIME_WAIT` 是正常关闭状态之一，其数量本身不等于发生故障。

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

[^1]: 〔RFC〕[RFC 9293 §2.2、§3.3–§3.6、§3.8](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2)——TCP 字节流、序号、连接状态、建立、复位、关闭与接收窗口。

[^tcb]: 〔RFC〕[RFC 9293 §3.3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.3.1)——TCB 概念及关键连接变量；[§3.10.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.10.1)另述处理 `OPEN` 时如何创建和初始化 TCB。

[^zero-window]: 〔RFC〕[RFC 9293 §3.8.6.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6.1)——对零窗口的探测，以及接收方确认和通告窗口的行为。

[^2]: 〔RFC〕[RFC 768: User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768.html)——UDP 头部与不保证交付、重复保护或顺序的服务。

[^udp-api]: 〔软件实现〕[Rust `UdpSocket::recv_from`](https://doc.rust-lang.org/std/net/struct.UdpSocket.html#method.recv_from)——单次接收一个数据报，缓冲区不足时超出字节可能被丢弃。

[^3]: 〔RFC〕[RFC 5681 §3](https://www.rfc-editor.org/rfc/rfc5681.html#section-3)——经典 TCP 拥塞控制与快速重传算法。

[^ecn]: 〔RFC〕[RFC 3168 §5、§6.1](https://www.rfc-editor.org/rfc/rfc3168.html#section-6.1)——经典 ECN 的 IP 层拥塞标记、TCP 两端的协商与反馈。

[^sack]: 〔RFC〕[RFC 2018 §3–4](https://www.rfc-editor.org/rfc/rfc2018.html#section-3)——SACK 选项与非连续已收字节块。

[^rto]: 〔RFC〕[RFC 6298 §2、§5](https://www.rfc-editor.org/rfc/rfc6298.html#section-2)——RTO 计算、计时器管理与超时退避。

[^bbr]: 〔研究资料与草案〕[ACM Queue: BBR — Congestion-Based Congestion Control](https://queue.acm.org/detail.cfm?id=3022184)——原始设计论文；另见 [BBR Congestion Control, draft-ietf-ccwg-bbr-07](https://datatracker.ietf.org/doc/html/draft-ietf-ccwg-bbr-07)中 BBRv3 依据带宽与最小 RTT 模型控制 pacing 和窗口的说明。后者仍是 Internet-Draft，并非正式 RFC，也不构成特定网络上的性能保证。

[^4]: 〔RFC〕[RFC 9000 §1、§2、§5.1](https://www.rfc-editor.org/rfc/rfc9000.html#section-1)——QUIC 的 UDP 承载、多路复用与连接标识。

[^quic-migration]: 〔RFC〕[RFC 9000 §8.2、§9、§9.5–§9.6](https://www.rfc-editor.org/rfc/rfc9000.html#section-9)——路径验证、主动迁移与 NAT 重绑定、CID 复用限制及服务端首选地址。

[^quic-tls]: 〔RFC〕[RFC 9001 §2–§4](https://www.rfc-editor.org/rfc/rfc9001.html#section-2)——完整握手、TLS 与 QUIC 的职责、`CRYPTO` 帧和包保护；[§4.6、§9.2](https://www.rfc-editor.org/rfc/rfc9001.html#section-4.6)解释 0-RTT 条件、拒绝与重放风险。

[^quic-recovery]: 〔RFC〕[RFC 9002 §4–§7](https://www.rfc-editor.org/rfc/rfc9002.html#section-4)——QUIC 的丢失检测、探测超时与拥塞控制；流数据重发与新包号见 [RFC 9000 §13.3](https://www.rfc-editor.org/rfc/rfc9000.html#section-13.3)。

[^cubic]: 〔RFC〕[RFC 9438 §4](https://www.rfc-editor.org/rfc/rfc9438.html#section-4)——CUBIC 的窗口增长函数、拥塞响应及与经典 TCP 算法的关系。

[^5]: 〔软件实现〕[Rust `TcpStream`](https://doc.rust-lang.org/std/net/struct.TcpStream.html)——半关闭、建连与读写超时、非阻塞操作及平台错误差异。

[^read]: 〔软件实现〕[Rust `Read`](https://doc.rust-lang.org/std/io/trait.Read.html)——短读、非空缓冲的零返回值与 `read_exact` 的部分进度。

[^write]: 〔软件实现〕[Rust `Write`](https://doc.rust-lang.org/std/io/trait.Write.html)——短写、`write_all` 的循环与错误边界。

[^tokio]: 〔软件实现〕[Tokio `AsyncReadExt::read_exact`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncReadExt.html#method.read_exact)与[`AsyncWriteExt::write_all`](https://docs.rs/tokio/latest/tokio/io/trait.AsyncWriteExt.html#method.write_all)——这两个异步组合操作在 `select!` 中的取消安全限制。

[^apple-netstat]: 〔平台与实现〕Apple `netstat` 的[连接表 `inet.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/inet.c)与[统计输出 `main.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/main.c)——队列使用 socket 缓冲的 `sb_cc`，`rxbytes` / `txbytes` 来自独立的收发统计字段。

[^send-man]: 〔平台与实现〕[Linux Programmer's Manual: send(2)](https://man7.org/linux/man-pages/man2/send.2.html)——`send`/`write` 成功返回仅表示数据已写入内核发送缓冲区，不代表对端已接收或处理。

[^shutdown]: 〔平台与实现〕[Linux Programmer's Manual: shutdown(2)](https://man7.org/linux/man-pages/man2/shutdown.2.html)——`SHUT_WR` 触发 FIN 发送以关闭写方向同时保留读方向（半关闭），与 `close(2)` 递减描述符引用计数的区别。

[^tcp-lifecycle]: 〔RFC〕[RFC 9293 图 5](https://www.rfc-editor.org/rfc/rfc9293.html#figure-5)给出状态机，[图 6](https://www.rfc-editor.org/rfc/rfc9293.html#figure-6)和[图 12–13](https://www.rfc-editor.org/rfc/rfc9293.html#figure-12)分别展示建连、正常关闭与同时关闭的报文交换。

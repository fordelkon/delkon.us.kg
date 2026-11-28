---
title: "计算机网络（四）：TCP、UDP、QUIC 与 Socket 接口"
description: "对比 TCP 字节流与 UDP 数据报，解释连接状态、重传、窗口控制与 Socket 读写契约，用可运行的 C 程序演示分次读取、EOF 和半关闭，并界定 QUIC 多流与连接迁移的保证。"
publishDate: "21 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（三）：路由转发、NAT 与虚拟网络接口》](/posts/networking/routing-forwarding-nat-virtual-interfaces/)追踪了 [IP 包的逐跳交付](/posts/networking/routing-forwarding-nat-virtual-interfaces/#逐跳转发时哪些字段会变)。IP 尽力把包送到目标主机：包可能丢失、乱序或重复；目的 IP 也不说明该把载荷交给哪个应用。本篇从传输层端点接着看。

本篇先比较 TCP 字节流与**用户数据报协议**（User Datagram Protocol，UDP）数据报，接着看 TCP 如何管理连接、确认、重传与窗口，以及这些机制如何反映在 Socket 的读写结果里。QUIC 一节再对照这些机制怎样用于 UDP 之上的可靠传输。示例用 POSIX Socket 演示 C 程序的分次读取、**文件结束**（End of File，EOF）与半关闭，连接状态观察以 macOS 与 Linux 为例。

## 传输层端点：端口、TCP 字节流与 UDP 数据报

传输层通过 16 位端口号（范围 `0–65535`）区分通信端点。同一个监听端口可以接受多条连接；在通常的 TCP/IP 讨论中，连接可用五元组 `(协议, 源 IP, 源端口, 目的 IP, 目的端口)` 区分，其中 TCP 自身使用两端地址与端口组成的四元组识别连接[^1]。

TCP 和 UDP 直接由 IP 承载；[QUIC](#quic为什么在-udp-之上重建可靠传输) 使用 UDP 承载自己的包，为应用提供另一套传输服务[^1][^2][^4]。

| 对比维度 | TCP | UDP | QUIC 的流服务 |
| --- | --- | --- | --- |
| 交付模型 | 每个方向一条可靠、有序的字节流 | 无连接、尽力而为的独立数据报 | 一条连接内复用多条可靠字节流，各流分别保证顺序 |
| 消息边界 | 不保留应用的写入边界 | 保留数据报边界；接收缓冲区不足时可能截断 | 不保留应用的写入边界；UDP 数据报不等于应用消息 |
| 传输头部 | 20–60 字节 | 固定 8 字节 | 在 UDP 载荷内另有 QUIC 包头，长度随包类型和字段变化 |
| 流量与拥塞控制 | 接收窗口与拥塞控制共同约束发送 | 协议本身不提供，由应用或上层协议负责 | 流级与连接级流量控制，拥塞控制由 QUIC 实现提供 |
| 典型应用 | HTTP/1.1、HTTP/2、SSH、数据库连接 | [传统 DNS 查询](/posts/networking/dns-resolution-caching-encrypted-queries/#dns-查询的报文与传输)、实时媒体 | HTTP/3、DNS over QUIC |

UDP 的“保留边界”不表示每次都能取得完整消息。使用 POSIX Socket 在 UDP 上接收时，如果数据报超过缓冲区大小，超出部分会被丢弃。需要检测截断时可使用 `recvmsg`，检查返回的 `msg_flags` 中是否有 `MSG_TRUNC`。一次成功发送也不保证对端收到该数据报[^2][^udp-api]。另外，对 UDP Socket 调用 `connect()` 不会发送握手包，而是在内核绑定默认对端四元组：之后既可直接用 `send`/`recv` 并过滤无关来源的包，也能让内核把 ICMP 端口不可达等异步差错以 `ECONNREFUSED` 投递给后续读写调用。

TCP 中，发送方分别写入 `"hello "` 和 `"world"`，接收方可能一次读到两者，也可能多次才读完。TCP 提供可靠、有序的字节流，连接仍可能报错或中断。默认启用的 **Nagle 算法**（在途尚有未确认数据时暂缓发送小于 MSS 的零碎小段，RFC 9293 §3.7.4）与接收端**延迟 ACK** 叠加时，连续小写入再等待读取甚至可能出现数十到上百毫秒的额外卡顿；延迟敏感的交互协议可通过禁用 Nagle（`TCP_NODELAY`）或合并写入来避免[^nagle]。应用需要**帧定界**（framing）才能从字节流识别出一条完整消息，常见做法是使用固定长度、长度前缀或分隔符。HTTP/1.1 的实例见[请求与响应的头部及正文边界](/posts/networking/http-evolution-tls-handshake-https/#一组-http-请求与响应)。

## TCP 连接的建立与关闭

TCP 在两端为每条连接维护状态：本地与对端的地址和端口、发送与接收序号、窗口等。RFC 9293 将保存这些变量的连接记录称为**传输控制块**（Transmission Control Block，TCB）；它描述的是协议实现需要维护的状态，不规定操作系统内部结构的布局[^tcb]。

### 连接建立：三次握手

通常的主动建连过程是：客户端发送带**同步序号标志**（Synchronize，`SYN`）的报文段，**初始序号**（Initial Sequence Number，ISN）为 $x$；服务端回复同时置位 `SYN` 和**确认标志**（Acknowledgment，`ACK`）的报文段，携带自身初始序号 $y$ 并确认 $x+1$；客户端再以 ACK 确认 $y+1$。这个交换使双方同步初始序号，并确认对方能够接收自己的序号信息；连接状态机还必须处理旧报文与重复报文，避免把滞留的连接请求误认为新的有效连接[^1]。

客户端发出 SYN 后进入 `SYN-SENT`，收到有效的 SYN+ACK 后进入 `ESTABLISHED`。服务端为本次请求建立的连接从 `SYN-RECEIVED` 进入 `ESTABLISHED`，原监听套接字仍可接受其他连接[^tcp-lifecycle]。

这里的确认号都在 TCP 头里。SYN 即使没有载荷也占用一个序号，纯 ACK 则不消耗序号。第三段 ACK 可以带数据，本例取纯 ACK。三个 TCP 控制段都能单独交给 IP，再由当前链路成帧，参见[封装路径对照](/posts/networking/layered-architecture-packet-journey/#同一条链路上的不同封装路径)[^1]。

### 初始 SYN 的报文布局

例如客户端从 `192.168.1.10:50001` 连接 `198.51.100.20:443`，初始序号仍记为 `x`。TCP 头里的数据偏移字段以 32 位字为单位。无选项时它的值为 `5`，表示 TCP 头占 20 字节[^tcp-header]。

在[同一次 HTTPS 访问的阶段对照](/posts/networking/layered-architecture-packet-journey/#按阶段对照报文与封装)中，DNS 答案提供目的 IPv4 地址，TCP 用自己的头部发出 SYN。建连后，TLS 才把 `ClientHello` 编码成记录字节写入 TCP 流。对照这两个发送动作，SYN 的控制信息位于 TCP 头部，TLS 记录的字节则位于后续段的 TCP 载荷。

若初始 SYN 不带载荷，且 IPv4 和 TCP 都没有选项，IPv4 包总长为 40 字节，其中 TCP 头置 `SYN=1`、`Seq=x`，ACK 标志未置位，确认号字段无效。SYN 可以携带**最大报文段长度**（Maximum Segment Size，MSS）选项，用来通告本端可接收的单个 TCP 报文段的数据长度上限。MSS 只计 TCP 数据，带此选项的 SYN 仍可以没有载荷，增加的是 TCP 头的长度[^mss]；路径上的 [MTU 与 MSS 预算](/posts/networking/network-diagnostics-performance-troubleshooting/#mtumss-与-pmtud-黑洞)在第八篇继续展开。纯 ACK 同样携带 TCP 头[^tcp-header]。

### 连接关闭：FIN、半关闭与 TIME-WAIT

TCP 的两个方向可以分别结束。调用 `shutdown(fd, SHUT_WR)` 会关闭写方向。**结束标志**（Finish，`FIN`）在该方向先前排队的字节之后占据一个序号，表示发送方已无后续数据。对端应用先读完此前的字节，再用非空缓冲区读取时会读到 EOF[^shutdown][^1]。本端仍可以接收对方的响应，这称为**半关闭**（Half-Close）。正常关闭常画成四段报文，但 ACK 与 FIN 可以合并，也存在同时关闭，不能要求每次抓包都恰好出现四个包。

在通常的非同时关闭流程中，先发 FIN 的主动关闭端等待自己的 FIN 被确认，再接收对方 FIN 并发出最终 ACK，进入 `TIME-WAIT`。这取决于关闭顺序，客户端与服务端都可能成为这一端；同时关闭时也可能两端都进入该状态。规范中的等待为**最大报文段生存时间**（Maximum Segment Lifetime，MSL）的两倍，用于在对方重传 FIN 时重新确认，并让旧连接的残留报文在网络中失效；具体系统的计时与连接复用策略应按实现理解，不能从“等待几十秒”倒推所有平台的统一常量[^1]。工程上，服务端重启监听原端口常因仍有旧连接处于 `TIME-WAIT` 而遇到 `EADDRINUSE`：为此监听前常配置 `SO_REUSEADDR` 允许重新绑定仍被 `TIME-WAIT` 占用的端口；而 `SO_REUSEPORT` 则是另一种允许多个套接字同时绑定相同地址和端口以分担接入负载的选项，两者作用不同。

例如 A 先关闭写方向。B 的 TCP 可以确认 A 的 FIN，无需等 B 的应用读到 EOF。此时 `FIN-WAIT-2` 表示 A 自己的 FIN 已获确认，仍等待 B 的 FIN；`CLOSE-WAIT` 表示 B 已收到 A 的 FIN，自己的写方向仍然开放。B 可以在这段时间继续写响应；等它也发出 FIN 才进入 `LAST-ACK`。下文的[半关闭程序](#运行一次半关闭发送结束后继续接收)正是先读到 EOF、再写回响应[^tcp-lifecycle]。

若两端同时关闭，`FIN-WAIT-1` 收到尚未确认本端 FIN 的对端 FIN 时可进入 `CLOSING`，等本端 FIN 获确认再进入 `TIME-WAIT`。其他状态转换见 RFC 9293 的连接状态图[^tcp-lifecycle]。

对已建立的连接，一端收到带**复位标志**（Reset，`RST`）的报文并按当前状态及序号规则接受它时，会在本地中止该连接。应用在哪次读写看到错误取决于接口与缓冲状态。`RST` 也可用于拒绝建连请求[^1]。已发出的请求仍可能在复位前被对端处理，重试需要考虑幂等性。意外断网可能没有 FIN 或 RST，需等超时或后续通信发现。

## TCP 的序号、确认与重传

### 序号、累计确认与重传机制

TCP 为字节流分配序号，并通过确认与计时器判断传输进度：

- **累计确认**（Cumulative ACK）：ACK 序号表示下一个期望的字节序号，其前面的字节已经连续收到。确认由 TCP 接收端产生，不代表接收应用已经处理数据[^1]。
- **选择性确认**（Selective Acknowledgment，SACK）：接收方还可报告已收到的非连续字节块，帮助发送方选择需要重传的部分[^sack]。
- **重传超时**（Retransmission Timeout，RTO）：发送端根据**往返时延**（Round-Trip Time，RTT）测量估算超时阈值，超时后重传并按规范退避；并不是每个报文段都有一个彼此独立的简单闹钟[^rto]。
- **快速重传**（Fast Retransmit）：RFC 5681 描述的经典算法在收到三个重复 ACK 后重传疑似丢失的段。重复 ACK 是推断线索，并非丢包的绝对证明，现代实现也可能采用其他丢失检测机制[^3]。

把这些字段放进具体报文。沿用第三篇中[无 NAT 的路由实验](/posts/networking/routing-forwarding-nat-virtual-interfaces/#同一个-ip-包经过三段以太网链路)：A 为 `192.168.1.10:50001`，B 为 `198.51.100.20:443`，两端 TCP 已建立。假设 A 下一个发送序号为 `1001`，B 下一个发送序号为 `7001`，接下来只有 A 向 B 发送数据。

第一段占据序号 `1001…1100`，所以 B 回复 `Ack=1101`；第二段的 60 字节（`1101…1160`）途中丢失。若没有后续数据，A 等到 RTO 再重传这 60 字节，B 收齐后回复 `Ack=1161`。`Ack` 是确认号字段，`ACK=1` 则表示确认标志置位；`Len` 只计 TCP 载荷，不包含 TCP 头。这里纯 ACK 不携带数据，也不含 SYN 或 FIN，因此不消耗发送序号，B 的 `Seq` 一直为 `7001`[^1]。

每个 A → B 包的 IP 头仍为 `192.168.1.10 → 198.51.100.20`，B → A 则相反；当前链路的 MAC 地址随路由转发而变化。中间路由器不因为转发数据就替 B 产生 TCP ACK。这个确认说明 B 的 TCP 已连续收到对应字节，不说明 B 的应用已经读取或处理；重传也不要求重新使用原来的 IP 标识、TTL或以太网帧。

### 用 TCB 的字段追踪发送进度

下例截取 RFC 9293 定义的三个 TCB 变量。假设 A 已收到对首段的 `Ack=1101`，随后发出的 60 字节段在途中丢失。这个时刻的发送状态可以写成[^tcb]：

```c
#include <stdint.h>

struct TcpSequenceState {
    uint32_t snd_una;  // Oldest unacknowledged sequence number.
    uint32_t snd_nxt;  // Next sequence number for new data.
    uint32_t rcv_nxt;  // Next expected sequence number from the peer.
};

const struct TcpSequenceState sender_after_loss = {
    .snd_una = 1101,  // The first byte not yet acknowledged.
    .snd_nxt = 1161,  // The next new byte follows the 60 already sent.
    .rcv_nxt = 7001,  // The peer has sent only ACKs since the handshake.
};
```

重传从 `1101` 开始，沿用原序号；收到 `Ack=1161` 才把 `snd_una` 推进到 `1161`。两端各有一份 TCB，连接状态、窗口和重传队列还要另行保存。示例取值未跨越序号回绕点；实际 32 位模 $2^{32}$ 空间采用半空间比较（即有符号差 `(int32_t)(b - a) > 0` 或无符号距离小于 $2^{31}$）判断先后，并在高速链路下借助 RFC 7323 时间戳与 **PAWS**（Protection Against Wrapped Sequences）防止旧回绕报文被误认[^1][^window]。

## TCP 的流量控制与拥塞控制

**流量控制**（flow control）保护接收端。接收端通告**接收窗口**（receive window，`rwnd`），告知发送端当前可接受的序号范围；应用迟迟不读，窗口可能收缩至零。窗口和接收缓冲区相关，但不宜把每次通告值机械地等同于某个工具显示的空闲缓冲字节数[^1]。此外，TCP 首部的窗口字段只有 16 位（最大 65,535 字节），现代长肥管道要在建连 SYN 阶段协商 RFC 7323 **窗口缩放**（Window Scale）选项才能突破这一上限[^window]。

**拥塞控制**（congestion control）约束发送端给网络施加的负载。发送端维护**拥塞窗口**（congestion window，`cwnd`），根据 ACK 和检测到的丢包等反馈调整发送空间。经典机制包含两个基本阶段：初始或超时后的**慢启动**以近似指数速率扩窗（每收到一个有效新 ACK 约增加 1 个 SMSS，直到触及慢启动阈值 `ssthresh` 或发生丢包）；随后的**拥塞避免**采用 **AIMD**（和式增加、乘式减小：约每 RTT 增加 1 个 SMSS，检测到丢包后把窗口按比例折减）[^3]。若双方协商了经典**显式拥塞通知**（Explicit Congestion Notification，ECN），支持 ECN 的路由器可以标记 IP 包来通知拥塞，而不必丢掉这一个包；接收方再通过 TCP ACK 把标记反馈给发送方[^ecn]。RFC 5681 描述慢启动、拥塞避免、快速重传与快速恢复；它是经典机制的依据，不代表所有实现都只运行这一套算法[^3]。

在简化的窗口模型中，允许存在的未确认在途数据量受 $\min(\text{cwnd}, \text{rwnd})$ 约束；已有在途数据会占用额度，并不是每收到一个 ACK 都能重新发送一个完整窗口。这里限制的是传输中的序号范围，不规定应用每次 `read` 的缓冲区大小或返回多少字节。应用供数、发送缓冲与发送节奏还会进一步影响吞吐。第八篇的[带宽时延积](/posts/networking/network-diagnostics-performance-troubleshooting/#bdp-与单条-tcp-连接的吞吐边界)会用这条关系解释“带宽充足但单连接跑不满”。

:::note[BBR 改变拥塞估计，不取消其他限制]
丢包型算法在某些大缓冲路径上可能形成较长排队。**BBR 算法**（Bottleneck Bandwidth and Round-trip propagation time，BBR）估计瓶颈带宽和往返传播时延来指导发送，具体效果取决于算法版本、竞争流量与路径条件，不能据此承诺开启后必然更快。即使拥塞控制更适合当前路径，也不能突破接收窗口不足或应用供数过慢的限制[^bbr]。
:::

常见拥塞控制的区别在于怎样估计和使用网络容量，而不是改变 TCP 的字节流服务：

| 机制 | 主要控制依据 | 需要保留的边界 |
| --- | --- | --- |
| Reno 风格的经典算法 | 慢启动、拥塞避免及丢失反馈，拥塞避免近似线性增窗 | RFC 5681 是基础机制，不是所有系统的默认实现 |
| CUBIC | 以距上次拥塞事件的时间和三次函数调整窗口 | RFC 9438；仍需丢失恢复、接收窗口与发送节奏配合[^cubic] |
| BBR | 估计瓶颈带宽与传播时延，控制 pacing 和在途数据 | 设计和效果随版本变化；引用的 BBRv3 文档是草案，不是正式 RFC[^bbr] |

## Socket 接口与内核缓冲区契约

第一篇的 [Socket 边界](/posts/networking/layered-architecture-packet-journey/#操作系统边界socket-与网络接口)说明了应用怎样把字节交给操作系统。通过普通 TCP Socket，发送应用调用 `write`/`send` 把字节写入本端发送缓冲，经 IP 交付到对端接收缓冲后由接收应用 `read`/`recv` 取走，对端 TCP 则独立发回累计确认。通过第三篇的 [TUN 虚拟网络接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#虚拟网络接口tun-与-tap-如何接入协议栈)，用户态程序读写的是带 IP 头的包。

`write`/`send` 成功返回 `n`，只说明本次调用接受了前 `n` 个字节；在普通缓冲式 TCP 实现中，这通常对应本机发送缓冲区的接纳，并不证明这些字节已经发出[^send-man]。[累计 ACK](#tcp-的序号确认与重传)确认的是对端 TCP 已连续收到相应的字节，不说明对端应用是否调用了 `read`。就算 `read` 已经把字节交给应用，也无法据此判断请求是否已处理或已提交。这个区别与并发系列中[消息入队和处理完成](/posts/concurrency/message-passing-workers-backpressure/#消息交付与处理完成)相同：如果发送方需要知道处理结果，要等应用协议定义的响应。

### POSIX C 怎样保存套接字地址

Beej 的 Socket 指南把三个角色分开：`getaddrinfo` 通过 `struct addrinfo` 返回候选地址链表，`sockaddr_in` 和 `sockaddr_in6` 存各自地址族的字段，`sockaddr_storage` 提供容纳不同地址族的通用空间[^beej-socket]。`struct sockaddr *` 是部分 Socket API 接收地址的通用指针类型，仍要配合长度使用。

```c
#define _POSIX_C_SOURCE 200809L

#include <netdb.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>

struct SocketEndpoint {
    struct sockaddr_storage address;
    socklen_t length;
};

// Select the first IPv4/IPv6 TCP candidate. Returns 0 or a getaddrinfo error code.
int first_tcp_endpoint(const char *host, const char *service,
                       struct SocketEndpoint *endpoint) {
    if (endpoint == NULL) {
        return EAI_FAIL;
    }

    // Query both IPv4 and IPv6 stream endpoints while avoiding duplicate socktypes.
    struct addrinfo hints = {
        .ai_family = AF_UNSPEC,
        .ai_socktype = SOCK_STREAM,
        .ai_protocol = IPPROTO_TCP,
    };
    struct addrinfo *results = NULL;
    int status = getaddrinfo(host, service, &hints, &results);
    if (status != 0) {
        return status;
    }

    status = EAI_FAMILY;
    for (const struct addrinfo *entry = results; entry; entry = entry->ai_next) {
        if ((entry->ai_family == AF_INET || entry->ai_family == AF_INET6) &&
            entry->ai_addr != NULL &&
            entry->ai_addrlen <= sizeof endpoint->address) {
            // Zero padding bytes and copy out so the endpoint outlives freeaddrinfo().
            *endpoint = (struct SocketEndpoint){0};
            memcpy(&endpoint->address, entry->ai_addr, entry->ai_addrlen);
            endpoint->length = entry->ai_addrlen;
            status = 0;
            break;
        }
    }
    freeaddrinfo(results);
    return status;
}
```

例如传入 `"127.0.0.1", "443"` 得到 IPv4 地址，传入 `"::1", "443"` 得到 IPv6 地址。这里复制地址和实际长度，使结果能在释放候选链表之后继续使用。地址结构内的端口已经是网络字节序。此函数只选一个候选供检查；实际连接应按候选的地址族、套接字类型和协议创建 Socket，并在连接失败时尝试合适的其他候选[^beej-socket]。

### 短读、短写、EOF 与暂不可用

在 POSIX Socket 上，`recv` 和 `send` 返回实际推进的字节数，失败时返回 `-1`，再检查 `errno`[^udp-api][^send-man]。

| 操作结果 | 应怎样解释 |
| --- | --- |
| `recv(fd, buf, capacity, 0)` 返回 `0 < n < capacity` | 短读，只处理缓冲区的前 `n` 字节 |
| `send(fd, data, length, 0)` 返回 `0 < n < length` | 短写，下次从 `data + n` 继续 |
| TCP 上使用非空缓冲区，`recv` 返回 `0` | 接收方向到达 EOF，仍可能可以发送 |
| 非阻塞读写失败，`errno` 为 `EAGAIN` 或 `EWOULDBLOCK` | 暂时不能推进，等待对应的读或写就绪（可移植代码两者均须判断） |
| 读写失败，`errno` 为 `EINTR` | 在尚未推进任何字节前被信号中断，可安全重试（`connect` 遇 `EINTR` 须改由 `poll`/`select` 检查 `SO_ERROR`） |

应用需要按协议判断消息是否收齐。累积读取固定长度字段时，短读继续补齐，提前遇到 EOF 则表示字段不完整。通过 `fcntl` 为套接字开启 `O_NONBLOCK` 进入非阻塞模式后，遇到 `EAGAIN` / `EWOULDBLOCK` 不能空转忙等，而应借助 `poll`、`epoll`（Linux）或 `kqueue`（macOS/BSD）等 I/O 多路复用等待可读或可写事件就绪。

向对端已关闭或复位（`RST`）的 TCP Socket 继续写入时，内核默认发送 `SIGPIPE` 信号终止进程。除了进程级 `signal(SIGPIPE, SIG_IGN)` 把错误转为返回 `-1` 且 `errno == EPIPE`，工程上更细粒度的隔离方式包括：Linux 在单次调用传 `send(..., MSG_NOSIGNAL)`，macOS/BSD 对套接字设置 `setsockopt(..., SOL_SOCKET, SO_NOSIGPIPE, ...)`[^send-man]。

**背压**（backpressure）会沿缓冲传导：对端应用不读，接收窗口可能变为零；本端发送缓冲随后可能耗尽，阻塞写入会等待，非阻塞写入则可能短写或返回 `EAGAIN` / `EWOULDBLOCK`。TCP 必须支持**零窗口探测**（Zero-Window Probing）：即使窗口为零，发送端仍可用一个新字节（若有）或重传来探测，接收端用 ACK 报告当前窗口。这样，即使窗口重新开放的通知丢失，发送方也能发现窗口再次可用[^zero-window]。

### 运行一次半关闭：发送结束后继续接收

下面的 C 程序连接本机 IPv4 回环地址。客户端和服务端在同一进程中各有一个 Socket，轮流读写。`listen(listener, 1)` 让内核维护等待三次握手完成的**半连接队列**（SYN queue）与已完成握手的**全连接队列**（accept queue，上限受 `min(backlog, somaxconn)` 约束），因此 `connect()` 在 `accept()` 之前即可在队列中完成三次握手而不死锁；两个方向的消息都很短，远小于内核套接字缓冲，因而可以先写入缓冲区再从另一端读取。接收端每次只传 5 字节的缓冲区故意触发多次短读，读到 EOF 后才结束校验；客户端用 `shutdown(fd, SHUT_WR)` 发送 FIN 并保留接收方向[^shutdown]。

```c frame="code"
#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static void require_success(int result, const char *operation) {
    if (result < 0) {
        perror(operation);
        exit(EXIT_FAILURE);
    }
}

static void send_all(int fd, const char *data, size_t length) {
    while (length > 0) {
        ssize_t written = send(fd, data, length, 0);
        // EINTR occurs only before any byte is copied into the kernel buffer.
        if (written < 0 && errno == EINTR) {
            continue;
        }
        if (written < 0) {
            perror("send");
            exit(EXIT_FAILURE);
        }
        if (written == 0) {
            fputs("send made no progress\n", stderr);
            exit(EXIT_FAILURE);
        }
        data += written;
        length -= (size_t)written;
    }
}

static void receive_until_eof(int fd, const char *expected) {
    size_t remaining = strlen(expected);
    // Deliberately tiny buffer to force multiple short reads across the byte stream.
    char buffer[5];
    for (;;) {
        ssize_t received = recv(fd, buffer, sizeof buffer, 0);
        if (received < 0 && errno == EINTR) {
            continue;
        }
        if (received < 0) {
            perror("recv");
            exit(EXIT_FAILURE);
        }
        if (received == 0 && remaining == 0) {
            return;
        }
        if (received == 0 || (size_t)received > remaining ||
            memcmp(buffer, expected, (size_t)received) != 0) {
            fputs("unexpected message or early EOF\n", stderr);
            exit(EXIT_FAILURE);
        }
        expected += received;
        remaining -= (size_t)received;
    }
}

int main(void) {
    // Bound the single-process demo so a blocking bug cannot hang indefinitely.
    alarm(5);
    // Convert writes to a closed/reset peer into EPIPE instead of killing the process.
    if (signal(SIGPIPE, SIG_IGN) == SIG_ERR) {
        perror("signal");
        return EXIT_FAILURE;
    }

    int listener = socket(AF_INET, SOCK_STREAM, 0);
    require_success(listener, "socket");
    // Leaving sin_port as 0 lets bind() assign an available ephemeral loopback port.
    struct sockaddr_in address = {.sin_family = AF_INET};
    if (inet_pton(AF_INET, "127.0.0.1", &address.sin_addr) != 1) {
        fputs("invalid loopback address\n", stderr);
        close(listener);
        return EXIT_FAILURE;
    }
    require_success(bind(listener, (struct sockaddr *)&address, sizeof address), "bind");
    require_success(listen(listener, 1), "listen");

    socklen_t address_length = sizeof address;
    require_success(getsockname(listener, (struct sockaddr *)&address, &address_length),
                    "getsockname");
    printf("server listening on 127.0.0.1:%u\n", (unsigned)ntohs(address.sin_port));

    int client = socket(AF_INET, SOCK_STREAM, 0);
    require_success(client, "socket");
    // Completes handshake inside the kernel accept queue before accept() runs.
    require_success(connect(client, (struct sockaddr *)&address, address_length), "connect");
    int server = accept(listener, NULL, NULL);
    require_success(server, "accept");
    close(listener);

    // Small payloads fit inside kernel socket buffers; large streams require concurrent I/O.
    const char first[] = "first-frame|";
    const char second[] = "second-frame";
    send_all(client, first, sizeof first - 1);
    send_all(client, second, sizeof second - 1);
    // Emit FIN while keeping the read half open to receive the server's reply.
    require_success(shutdown(client, SHUT_WR), "client shutdown");
    const char request[] = "first-frame|second-frame";
    receive_until_eof(server, request);
    printf("server received %zu bytes, then EOF\n", sizeof request - 1);

    const char reply[] = "response after EOF";
    send_all(server, reply, sizeof reply - 1);
    require_success(shutdown(server, SHUT_WR), "server shutdown");
    receive_until_eof(client, reply);
    printf("client received: %s\n", reply);

    close(server);
    close(client);
    return EXIT_SUCCESS;
}
```

在 macOS 或 Linux 上把代码保存为 `tcp_half_close.c`，编译后运行：

```bash frame="code"
cc -std=c17 -Wall -Wextra tcp_half_close.c -o tcp_half_close
./tcp_half_close
```

程序先打印系统分配的回环监听端口（端口随每次运行变化），随后输出完整结果：

```text
server listening on 127.0.0.1:54321
server received 24 bytes, then EOF
client received: response after EOF
```

服务端每次最多收 5 字节，读完 24 字节至少需要五次成功读取。它在读到 EOF 后仍能发送响应，客户端关闭发送方向后也仍能接收。单次读取的长度由当前可读数据和缓冲区容量决定，与应用写入次数或 TCP 分段没有固定对应关系。程序用 5 秒进程级闹钟限制整个实验的等待；第八篇的 [Wireshark 实验](/posts/networking/network-diagnostics-performance-troubleshooting/#wireshark-实验从一条连接验证阶段边界)会直接复用这段回环程序对照抓包报文。

## QUIC：为什么在 UDP 之上重建可靠传输

QUIC 在 UDP 之上提供多路复用的安全传输。QUIC v1 的三份规范分工不同：RFC 9000 定义传输协议本身，包括连接、流和报文格式；RFC 9001 定义如何使用 TLS 1.3 建立密钥并保护 QUIC 包；RFC 9002 描述如何检测丢失、计算探测超时与控制拥塞[^4][^quic-tls][^quic-recovery]。

UDP 提供端口和数据报承载，一个 UDP 数据报可以包含一个或多个 QUIC 包。QUIC 按包号确认收到了哪些包，按**流标识**（Stream Identifier，Stream ID）和偏移量重组应用字节。丢失的流数据可放到新包号的包里重发，原来的包号不会在同一包号空间复用。若直接把多流复用叠在 TCP 上，各流仍受同一条 TCP 字节流的按序交付约束，无法仅靠上层分流消除这个等待[^4][^quic-recovery]。

### 按流交付与队头阻塞

HTTP/2 的多条应用流共享 TCP 字节流。缺失的 TCP 字节会阻止后续字节按序交付，即使后续字节属于别的请求，这就是传输层的**队头阻塞**（Head-of-Line Blocking，HOL）。QUIC 为每条流维护偏移量，某条流等重传时，其他数据已经连续的流仍可交付；不过若同一个丢失的 QUIC 包同时承载了流 1 和流 2 的帧，两条流仍要各自等在新包号中重发，而且多条流共享的拥塞控制与连接级资源仍会彼此影响[^4][^quic-recovery]。RFC 9002 通过包号阈值、时间阈值与**探测超时**（Probe Timeout，PTO）检测丢包，包号永不复用也消除了原包与重传包之间的 RTT 采样二义性[^quic-recovery]。

| 接收端的字节视图 | 首段 | 中段 | 后段 |
| --- | --- | --- | --- |
| HTTP/2 的共享 TCP 字节流 | 流 1 字节已交付 | **流 1 字节缺失** | 流 2 字节已到，但被前面的缺口挡住 |
| QUIC 流 1 | 已交付 | **缺失** | 后续字节等待流内缺口补齐 |
| QUIC 流 2 | 已交付 | 后续偏移连续，可继续交付 | 继续按本流偏移交付 |

每行从左到右按该行的字节偏移读。TCP 行使用连接级字节序号，QUIC 两行各有自己的偏移起点。这里选用 QUIC 流 2 的连续数据已通过其他包抵达、应用依赖也已就绪的情形。

### 连接标识与路径迁移

普通 TCP 连接依赖固定的地址和端口组合。QUIC 使用**连接标识**（Connection Identifier，CID）识别连接，在路径发生变化时可在满足条件的情况下保留原连接[^quic-migration]。

以客户端从 Wi-Fi 切到蜂窝网络为例：主动迁移要等握手确认，并受服务端通告的迁移参数限制。服务端发现之前未验证的客户端地址时，需要验证新路径；CID 能识别原连接，却不能证明新路径可达。为避免跨路径关联，从不同本地地址发包不能复用同一个 CID。第三篇的 [NAT 映射](/posts/networking/routing-forwarding-nat-virtual-interfaces/#napt地址端口映射与回包转换)若重新分配外部地址或端口，服务端看到的对端也可能改变，即使客户端没有主动迁移或换 CID；这种 NAT 重绑定仍需按规则验证新路径。QUIC v1 通常由客户端发起迁移；服务端通过 `preferred_address` 通告备用地址是另有规则的情形[^quic-migration]。

### TLS 握手、应用数据与 0-RTT

QUIC 使用 TLS 1.3 协商密钥并认证对端。TLS 握手消息经 QUIC 的 `CRYPTO` 帧可靠送达，而应用字节流走 `STREAM` 帧，由 QUIC 保护包，不使用第一篇介绍的 [TLS 记录层](/posts/networking/layered-architecture-packet-journey/#tls-记录与-tcp-报文段两套独立的边界)。通常不经 Retry 的完整握手中，客户端可在一次往返后开始发送受 1-RTT 密钥保护的应用数据。满足会话恢复条件时，客户端可以在本次握手的第一次往返完成前尝试发送**早期数据**（early data），这就是 0-RTT 发送。即便使用 PSK 会话恢复时不必重发证书，服务端对本次连接的确认、具备前向保密的 1-RTT 密钥协商，以及拒绝或回退条件下的完整握手认证仍依赖后续交换；早期数据还存在重放风险，应用必须限制适用操作，具体安全边界见第六篇的 [TLS 会话恢复与早期数据](/posts/networking/http-evolution-tls-handshake-https/#tls-会话恢复与早期数据)[^quic-tls]。

QUIC 也有部署代价：UDP 可能受路径策略影响，高吞吐实现需要控制用户态处理和系统调用开销。浏览器能否回退到 TCP，还取决于是否存在可用的 HTTP/2 或 HTTP/1.1 服务以及客户端策略。应用如何利用底层流来复用请求，见[HTTP/2 与 HTTP/3 的连接和复用对照](/posts/networking/http-evolution-tls-handshake-https/#http11-到-http3-的连接与复用)。

## TCP 状态与队列观测实验

前面用程序演示了半关闭；下面通过系统的连接表与统计输出对照正在运行或刚关闭的套接字队列与状态。

### 实验一：分清队列与累计统计

macOS 可以运行：

```bash frame="code"
netstat -anv -p tcp
```

Linux 对应的基本观察命令是 `ss -tn`（含 `LISTEN` 状态则用 `ss -tln`）；需要扩展 TCP 信息时可使用 `ss -tin`，按该工具的版本解释输出。macOS 上述命令中应区分：

- `Local Address`、`Foreign Address`、`state`：地址、端口与本机连接状态。
- `Recv-Q`、`Send-Q`：当前接收、发送队列相关数量，具体统计口径依系统及连接状态而定（例如 Linux `ss -tln` 在 `LISTEN` 状态下分别表示当前全连接队列积压与最大 `backlog` 上限；macOS 可对照 `netstat -L` 查看监听队列）。
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

- TCP 提供可靠、有序且无消息边界的字节流；UDP 保留数据报边界，接收缓冲不足仍可能截断，且可通过 `connect()` 绑定默认四元组接收异步 ICMP 错误。
- TCP 连接状态机控制建连与关闭，主动关闭方经历 `TIME-WAIT` 保护旧段与末次确认；本机状态与队列仅反映本地视角，不能取代应用确认。
- 接收窗口保护接收端，拥塞控制约束网络负载；ACK、Socket 写入成功和业务处理完成是不同事件。
- Socket 程序需要分别处理短读、短写、EOF、`EINTR`、非阻塞就绪和 `SIGPIPE`；半关闭允许发送结束后继续接收。
- QUIC 在 UDP 之上提供独立流与连接迁移机制，路径验证、CID 规则和早期数据的重放边界仍需明确。

端口区分主机上的端点，但应用最初往往只有一个域名。[《计算机网络（五）：DNS 解析、缓存层级与加密查询》](/posts/networking/dns-resolution-caching-encrypted-queries/)先解释域名怎样得到连接所用的地址，再对照 [DNS 的 UDP 查询与 TCP 回退](/posts/networking/dns-resolution-caching-encrypted-queries/#dns-的-udp-大小限制与-tcp-回退)，以及加密 DNS 如何选择传输通道。

## 延伸阅读

- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/)——系统阅读非阻塞 I/O、`poll`/`select`、UDP `connect` 与服务端并发处理模型
- [Linux Programmer's Manual: tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)与 [socket(7)](https://man7.org/linux/man-pages/man7/socket.7.html)——查阅 `SO_REUSEADDR`、`SO_REUSEPORT`、`TCP_NODELAY` 与内核队列配置细节

[^1]: 〔RFC〕[RFC 9293 §2.2、§3.3–§3.6、§3.8](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2)——TCP 字节流、模 32 位序号空间比较、连接状态、建立、复位、关闭与接收窗口。

[^nagle]: 〔RFC〕[RFC 9293 §3.7.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.7.4)——Nagle 算法合并小报文段的发送条件及对交互延迟的影响。

[^window]: 〔RFC〕[RFC 7323 §2–§5](https://www.rfc-editor.org/rfc/rfc7323.html#section-2)——Window Scale 突破 16 位窗口限制，以及 Timestamps 与 PAWS 防止高速链路上的序号回绕冲突。

[^mss]: 〔RFC〕[RFC 9293 §3.7.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.7.1)——MSS 的通告及其与报文段数据长度的关系。

[^tcb]: 〔RFC〕[RFC 9293 §3.3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.3.1)——TCB 概念及关键连接变量；[§3.10.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.10.1)另述处理 `OPEN` 时如何创建和初始化 TCB。

[^zero-window]: 〔RFC〕[RFC 9293 §3.8.6.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6.1)——对零窗口的探测，以及接收方确认和通告窗口的行为。

[^2]: 〔RFC〕[RFC 768: User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768.html)——UDP 头部与不保证交付、重复保护或顺序的服务。

[^udp-api]: 〔平台与实现〕[Linux `recv(2)`](https://man7.org/linux/man-pages/man2/recv.2.html)与 [POSIX `recv(3p)`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/recv.html)——短读、EOF、非阻塞错误、`EINTR`、数据报截断与 `recvmsg` 的 `MSG_TRUNC` 标志（macOS BSD 接口行为一致）。

[^3]: 〔RFC〕[RFC 5681 §3](https://www.rfc-editor.org/rfc/rfc5681.html#section-3)——慢启动、拥塞避免（AIMD）、快速重传与快速恢复算法。

[^ecn]: 〔RFC〕[RFC 3168 §5、§6.1](https://www.rfc-editor.org/rfc/rfc3168.html#section-6.1)——经典 ECN 的 IP 层拥塞标记、TCP 两端的协商与反馈。

[^sack]: 〔RFC〕[RFC 2018 §3–4](https://www.rfc-editor.org/rfc/rfc2018.html#section-3)——SACK 选项与非连续已收字节块。

[^rto]: 〔RFC〕[RFC 6298 §2、§5](https://www.rfc-editor.org/rfc/rfc6298.html#section-2)——RTO 计算、计时器管理与超时退避。

[^bbr]: 〔研究资料与草案〕[ACM Queue: BBR — Congestion-Based Congestion Control](https://queue.acm.org/detail.cfm?id=3022184)——原始设计论文；另见 [BBR Congestion Control, draft-ietf-ccwg-bbr-07](https://datatracker.ietf.org/doc/html/draft-ietf-ccwg-bbr-07)中 BBRv3 依据带宽与最小 RTT 模型控制 pacing 和窗口的说明。后者仍是 Internet-Draft，并非正式 RFC，也不构成特定网络上的性能保证。

[^4]: 〔RFC〕[RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)——QUIC v1 传输协议；§1.2、§2、§4.1、§5.1、§12.3 与 §17 分别说明 UDP 承载、流、流量控制、连接标识、包号与包头。

[^quic-migration]: 〔RFC〕[RFC 9000 §8.2、§9、§9.5–§9.6](https://www.rfc-editor.org/rfc/rfc9000.html#section-9)——路径验证、主动迁移与 NAT 重绑定、CID 复用限制及服务端首选地址。

[^quic-tls]: 〔RFC〕[RFC 9001 §2–§4](https://www.rfc-editor.org/rfc/rfc9001.html#section-2)——完整握手、TLS 与 QUIC 的职责、`CRYPTO` 帧和包保护；[§4.6、§9.2](https://www.rfc-editor.org/rfc/rfc9001.html#section-4.6)解释 0-RTT 条件、拒绝与重放风险。

[^quic-recovery]: 〔RFC〕[RFC 9002 §4–§7](https://www.rfc-editor.org/rfc/rfc9002.html#section-4)——QUIC 的丢失检测、探测超时与拥塞控制；流数据重发与新包号见 [RFC 9000 §13.3](https://www.rfc-editor.org/rfc/rfc9000.html#section-13.3)。

[^cubic]: 〔RFC〕[RFC 9438 §4](https://www.rfc-editor.org/rfc/rfc9438.html#section-4)——CUBIC 的窗口增长函数、拥塞响应及与经典 TCP 算法的关系。

[^apple-netstat]: 〔平台与实现〕Apple `netstat` 的[连接表 `inet.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/inet.c)与[统计输出 `main.c`](https://github.com/apple-oss-distributions/network_cmds/blob/main/netstat.tproj/main.c)——队列使用 socket 缓冲的 `sb_cc`，`rxbytes` / `txbytes` 来自独立的收发统计字段。

[^send-man]: 〔平台与实现〕[Linux `send(2)`](https://man7.org/linux/man-pages/man2/send.2.html)与 [POSIX `send(3p)`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/send.html)——`send`/`write` 成功返回仅表示数据已写入内核发送缓冲区，并说明 `MSG_NOSIGNAL`；macOS 使用 `SO_NOSIGPIPE` 套接字选项。

[^shutdown]: 〔平台与实现〕[Linux `shutdown(2)`](https://man7.org/linux/man-pages/man2/shutdown.2.html)与 [POSIX `shutdown(3p)`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/shutdown.html)——`SHUT_WR` 触发 FIN 发送以关闭写方向同时保留读方向（半关闭），与 `close(2)` 递减描述符引用计数的区别。

[^tcp-lifecycle]: 〔RFC〕[RFC 9293 图 5](https://www.rfc-editor.org/rfc/rfc9293.html#figure-5)给出状态机，[图 6](https://www.rfc-editor.org/rfc/rfc9293.html#figure-6)和[图 12–13](https://www.rfc-editor.org/rfc/rfc9293.html#figure-12)分别展示建连、正常关闭与同时关闭的报文交换。

[^tcp-header]: 〔RFC〕[RFC 9293 §3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.1)——TCP 头字段、数据偏移、控制标志与选项。

[^beej-socket]: 〔编程指南〕[Beej’s Guide to Network Programming §3.3、§5.1](https://beej.us/guide/bgnet/html/split/ip-addresses-structs-and-data-munging.html#structs)与[系统调用章节](https://beej.us/guide/bgnet/html/split/system-calls-or-bust.html#getaddrinfo)——地址族、通用存储、候选链表及释放方式。

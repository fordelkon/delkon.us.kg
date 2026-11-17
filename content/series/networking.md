---
tags: [networking]
order:
  - post/networking/layered-architecture-packet-journey
  - post/networking/ip-addressing-subnet-lan-delivery
  - post/networking/routing-forwarding-nat-virtual-interfaces
  - post/networking/transport-tcp-udp-socket-quic
  - post/networking/dns-resolution-caching-encrypted-queries
  - post/networking/http-evolution-tls-handshake-https
  - post/networking/proxies-tunnels-transparent-interception
  - post/networking/network-diagnostics-performance-troubleshooting
title: "计算机网络系列"
description: "从分层封装、局域网寻址、路由转发与传输控制，到域名解析、TLS 加密边界、代理隧道接管与分层故障诊断。"
---

一次网络访问既要把应用消息转换成能够在物理链路上传输的分组，也要在跨网转发、丢包重传、名字解析与代理介入时保持明确的职责边界。本系列围绕一次客户端访问远端服务的主线，从协议分层与本地链路出发，逐步讨论跨网路由、端到端传输、域名解析、Web 加密通信、流量接管与分层排障。

## 阅读路线

| 阶段 | 篇章 | 核心问题 |
| ---- | ---- | -------- |
| 分层模型与本地交付 | [① 协议分层与请求路径](/posts/networking/layered-architecture-packet-journey/)、[② IP 寻址与局域网通信](/posts/networking/ip-addressing-subnet-lan-delivery/) | 一次请求经过哪些协议层与设备？主机怎样获得地址、判断同网段并在局域网内完成二层交付？ |
| 跨网转发与可靠传输 | [③ 路由、NAT 与虚拟接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/)、[④ TCP、UDP 与 Socket](/posts/networking/transport-tcp-udp-socket-quic/) | 数据包如何跨越子网与公私网边界？内核怎样通过 Socket 向应用提供可靠字节流或数据报服务？ |
| 名字解析与安全通信 | [⑤ DNS 解析、缓存与加密查询](/posts/networking/dns-resolution-caching-encrypted-queries/)、[⑥ HTTP 演进、TLS 与加密边界](/posts/networking/http-evolution-tls-handshake-https/) | 应用如何把域名解析为地址与连接参数？HTTP 怎样组织消息，TLS 又如何建立认证与加密边界？ |
| 流量接管与分层排障 | [⑦ 代理协议、透明接管与分流实现](/posts/networking/proxies-tunnels-transparent-interception/)、[⑧ 网络诊断、性能指标与分层排障](/posts/networking/network-diagnostics-performance-troubleshooting/) | 显式代理与 TUN 透明接管如何改写解析与连接关系？面对连不上、打不开或传输慢，如何按层定位根因？ |

八篇按机制依赖连续展开，阅读顺序不等于一次请求的实际发生顺序：先在第四篇建立 TCP、UDP 与 QUIC 的传输语义，第五篇才能对比传统 DNS 与 DoT、DoH、DoQ 的传输差异；第六篇讨论 TLS 握手、SNI 与 ECH 时，再回接第五篇的 HTTPS/SVCB 记录与第四篇的队头阻塞。第七篇以 Mihomo 为例组装前面的路由、TUN、DNS 与代理协议，第八篇则用可复现的受控实验收束全系列的诊断方法。

需要具备基本命令行经验；Rust 和 Go 的完整回环程序分别用于展示 TCP 半关闭与 SOCKS5/HTTP 代理转发，Python 标准库用于构造可控制的 DNS、TLS 与诊断对照实验。命令以 macOS 为主，同时给出 Linux（`iproute2` / `ss`）对应写法。实验说明会交代环境前提、观察重点与判断边界，本机输出不必与示例逐字一致。

本系列以客户端、主机协议栈与日常工程排障为范围，重点建立地址作用域、下一跳决策、连接状态机、加密可见性与代理接管路径的分析方法。数据中心交换与生成树协议、OSPF/BGP 等动态路由协议细节、组播以及无线物理层调制，属于进一步展开的主题。

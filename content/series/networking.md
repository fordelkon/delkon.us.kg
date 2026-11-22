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
| 协议体系与本地网络交付 | [① 协议分层、封装与一次请求的路径](/posts/networking/layered-architecture-packet-journey/)、[② IP 寻址、子网划分与局域网通信](/posts/networking/ip-addressing-subnet-lan-delivery/) | 一次请求经过哪些协议层与设备？主机怎样获得地址并把帧交给下一跳？ |
| 网络层转发与端到端传输 | [③ 路由转发、NAT 与虚拟网络接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/)、[④ TCP、UDP、QUIC 与 Socket 接口](/posts/networking/transport-tcp-udp-socket-quic/) | 路由和 NAT 怎样逐包处理？传输端点又如何向应用提供字节流或数据报服务？ |
| 域名解析与 Web 通信安全 | [⑤ DNS 解析、缓存层级与加密查询](/posts/networking/dns-resolution-caching-encrypted-queries/)、[⑥ HTTP 演进、TLS 握手与加密边界](/posts/networking/http-evolution-tls-handshake-https/) | 应用如何取得地址与连接参数？HTTP 怎样组织消息，TLS 又如何建立认证与加密边界？ |
| 代理流量处理与网络诊断 | [⑦ 代理协议、透明接管与分流实现](/posts/networking/proxies-tunnels-transparent-interception/)、[⑧ 网络诊断、性能指标与分层排障](/posts/networking/network-diagnostics-performance-troubleshooting/) | 代理如何改变解析路径和连接端点？又该在哪一段取证，区分连接失败、请求失败和传输缓慢？ |

八篇按知识依赖排列，不等于一次请求的实际发生顺序。第二篇先回答主机怎样把包交给本地下一跳，第三篇再追踪网关如何决定下一段路径；第四篇换到端点视角，区分传输协议与 Socket 接口。第五篇用这套传输模型比较传统 DNS、DoT、DoH 和 DoQ，并引入 HTTPS/SVCB 服务参数；第六篇再区分 DNS 发布 ECH 配置与 TLS 握手实际使用该配置。第七篇以 Mihomo 为例，把选路、DNS、传输端点和 TLS 边界放回同一条代理路径；第八篇用受控实验检验这些环节能从哪里观察、各项证据能说明什么。

需要具备基本命令行经验；Rust 和 Go 程序分别展示 TCP 半关闭与 HTTP CONNECT 转发，Python 标准库用于回环验证和响应计时对照。命令以 macOS 为主，同时给出 Linux（`iproute2` / `ss`）对应写法。实验说明会交代环境前提、观察重点与判断边界，本机输出不必与示例逐字一致。

## 覆盖范围与延伸学习

本系列以客户端、主机协议栈与日常工程排障为范围。第七篇的代理与透明接管是对选路、传输、DNS 和 TLS 的工程应用。

- 从本地交付继续学习：VLAN、Trunk、STP、无线接入、组播与物理层。
- 从静态与策略路由继续学习：OSPF、BGP，以及防火墙、ACL 和连接状态的策略设计。
- 从代理与隧道继续学习：IPsec、VPN 的密钥管理和跨站组网。

系列日期用于计划发布，阅读路线由上面的知识依赖决定。

## 本地实验与平台命令

第二篇的[子网计算](/posts/networking/ip-addressing-subnet-lan-delivery/#算清一个-27-子网)、第四篇的[半关闭程序](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)、第七篇的[CONNECT 回环验证](/posts/networking/proxies-tunnels-transparent-interception/#回环验证预读载荷与半关闭)和第八篇的[响应等待对照](/posts/networking/network-diagnostics-performance-troubleshooting/#控制变量实验只改变服务端响应前的等待)均不依赖外网，适合先在本机运行。抓包实验另需捕获权限，并注意接口、过滤器和捕获时机。

Windows 读者可先查第八篇的[平台命令对照](/posts/networking/network-diagnostics-performance-troubleshooting/#平台命令对照)，再回到对应机制。平台命令是功能上的近似对应；Linux 的策略路由、TPROXY 与 Apple Network Extension 有各自的系统边界。

做实验时先记录操作系统、工具版本、权限以及代理与地址族。保留命令、代表性输出和退出状态，再说明这些观测能排除什么、还需要在哪一段补证据。回环实验无需公网，真实连接与抓包实验则以当次网络和接口为准。

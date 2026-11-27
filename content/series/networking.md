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

从[一次冷启动 HTTPS 访问](/posts/networking/layered-architecture-packet-journey/#冷启动时客户端会发哪些报文)开始。先顺着时序图看客户端分别与解析器、网关和网站交换什么，再用[报文与封装对照表](/posts/networking/layered-architecture-packet-journey/#按阶段对照报文与封装)找出每次交换使用的承载协议。

## 阅读路线

| 主题 | 篇章 | 核心问题 |
| ---- | ---- | -------- |
| 协议体系与本地网络交付 | [① 协议分层、封装与一次请求的路径](/posts/networking/layered-architecture-packet-journey/)、[② IP 寻址、子网划分与局域网通信](/posts/networking/ip-addressing-subnet-lan-delivery/) | 一次请求经过哪些协议层与设备？主机怎样获得地址并把帧交给下一跳？ |
| 网络层转发与端到端传输 | [③ 路由转发、NAT 与虚拟网络接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/)、[④ TCP、UDP、QUIC 与 Socket 接口](/posts/networking/transport-tcp-udp-socket-quic/) | 路由和 NAT 怎样逐包处理？传输端点又如何向应用提供字节流或数据报服务？ |
| 域名解析与 Web 通信安全 | [⑤ DNS 解析、缓存层级与加密查询](/posts/networking/dns-resolution-caching-encrypted-queries/)、[⑥ HTTP 演进、TLS 握手与加密边界](/posts/networking/http-evolution-tls-handshake-https/) | 应用如何取得地址与连接参数？HTTP 怎样组织消息，TLS 又如何建立认证与加密边界？ |
| 代理流量处理与网络诊断 | [⑦ 代理协议、透明接管与分流实现](/posts/networking/proxies-tunnels-transparent-interception/)、[⑧ 网络诊断、性能指标与分层排障](/posts/networking/network-diagnostics-performance-troubleshooting/) | 代理如何改变解析路径和连接端点？又该在哪一段取证，区分连接失败、请求失败和传输缓慢？ |

八篇按知识依赖排列。第二至第六篇展开直连示例中的机制，第七篇引入[应用侧连接与代理出站](/posts/networking/proxies-tunnels-transparent-interception/#tun-代理如何建立出站并交付回包)，第八篇把各个通信环节落实到[诊断时可以取得的证据](/posts/networking/network-diagnostics-performance-troubleshooting/#按请求阶段选择观测点)。

示例使用 C17。Socket 实验使用 POSIX 接口，可在 macOS 或 Linux 上用 `cc` 编译。命令以 macOS 为主，并给出 Linux 的对应写法。

## 覆盖范围与延伸学习

本系列以客户端、主机协议栈与日常工程排障为范围。第七篇的代理与透明接管是对选路、传输、DNS 和 TLS 的工程应用。

- 从本地交付继续学习：VLAN、Trunk、STP、无线接入、组播与物理层。
- 从静态与策略路由继续学习：OSPF、BGP，以及防火墙、ACL 和连接状态的策略设计。
- 从代理与隧道继续学习：IPsec、VPN 的密钥管理和跨站组网。

## 本地实验与平台命令

先在本机运行第二篇的[子网计算](/posts/networking/ip-addressing-subnet-lan-delivery/#算清一个-27-子网)和第四篇的[回环半关闭程序](/posts/networking/transport-tcp-udp-socket-quic/#运行一次半关闭发送结束后继续接收)。第八篇的 [Wireshark 实验](/posts/networking/network-diagnostics-performance-troubleshooting/#wireshark-实验从一条连接验证阶段边界)复用同一程序，对照应用输出与 TCP 报文，需要回环捕获权限。第七篇的 [curl 代理对照](/posts/networking/proxies-tunnels-transparent-interception/#命令行验证先确认入站再对照解析位置)依赖已配置的本机代理和可达的目标网站。

Windows 读者可先查第八篇的[平台命令对照](/posts/networking/network-diagnostics-performance-troubleshooting/#平台命令对照)，再回到对应机制。平台命令是功能上的近似对应；Linux 的策略路由、TPROXY 与 Apple Network Extension 有各自的系统边界。

做实验时先记录操作系统、工具版本、权限以及代理与地址族。保留命令、代表性输出和退出状态，再说明这些观测能排除什么、还需要在哪一段补证据。回环实验无需公网，真实连接与抓包实验则以当次网络和接口为准。

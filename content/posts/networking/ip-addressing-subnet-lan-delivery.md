---
title: "计算机网络（二）：IP 寻址、子网划分与局域网通信"
description: "区分公网、私网与共享地址空间，用 CIDR 解释直连子网，追踪 DHCP 配置获取以及 ARP、NDP 与交换机如何把数据交给同链路目标或下一跳。"
publishDate: "19 Nov 2026"
tags: ["networking"]
---

上一篇[《计算机网络（一）：协议分层、封装与一次请求的路径》](/posts/networking/layered-architecture-packet-journey/)建立了四层模型，并区分了[主机、交换机与路由器的分工](/posts/networking/layered-architecture-packet-journey/#端到端与逐跳主机交换机与路由器的分工)。本篇把请求离开本机之前的准备补齐。先看接口需要哪些配置，再用这些参数决定要把帧交给谁。

普通业务发包时，主机先按目的 IP 选出下一跳，再在以太网上找到该下一跳的 MAC。本篇按这个顺序从三层的地址与前缀讲到二层的帧交付，再回到 DHCP 和 IPv6 自动配置。二层、三层沿用第一篇说明的 [OSI 层号](/posts/networking/layered-architecture-packet-journey/#为什么需要分层模型)。

## 接入网络：先认清配置清单

在第一篇的[冷启动场景](/posts/networking/layered-architecture-packet-journey/#冷启动时客户端会发哪些报文)中，主机在发出第一个帧之前已经有以下配置。

| 配置项                          | 回答的问题                               | 示例                      |
| ------------------------------- | ---------------------------------------- | ------------------------- |
| 本机 IP 地址                    | 本接口使用什么三层地址？                 | `192.168.1.10`            |
| 前缀长度 / 子网掩码             | 本机直连子网的地址范围是什么？           | `255.255.255.0`，即 `/24` |
| **默认网关**（Default Gateway） | 没有更具体路由时，把包交给哪个下一跳？   | `192.168.1.1`             |
| DNS 服务器地址                  | 需要查询域名时，把查询交给哪个解析服务？ | `192.168.1.53`            |

**域名系统**（Domain Name System，DNS）提供名字到地址等信息的查询。这里的“DNS 参数”主要指主机配置的解析服务地址：应用要访问 `example.com` 时，可由系统向该服务查询目标 IP；查询返回后，仍需按路由和链路规则发送请求[^dns-config]。DNS 服务器与默认网关可以是不同设备，也可以由同一设备同时提供服务。解析器角色、本地[缓存层级与解析路径选择](/posts/networking/dns-resolution-caching-encrypted-queries/#缓存层级与-ttl)，见第五篇的[递归与迭代](/posts/networking/dns-resolution-caching-encrypted-queries/#递归与迭代一次查询如何穿越层级)与缓存说明。

下面先假定这些配置已经可用，追踪普通业务数据怎样交付；它们来自手工设置还是自动分配，在[配置获取一节](#主机怎样自动获得网络配置)再解释。

## IP 地址的作用范围：公网、私网与共享地址

IP 单播地址通常标识网络中的通信接口，而不是设备永久不变的身份。一台主机可以有多个接口，一个接口也可以同时拥有多个地址。IPv4 使用 32 位地址，通常写作点分十进制 `192.168.1.10`；IPv6 使用 128 位地址，例如文档示例地址 `2001:db8::1`。两者有各自的头部格式、路由和邻居发现机制，排查双栈故障时应分别检查[^delivery][^documentation-addresses][^ipv6-basics]。

| 地址类型 | IPv4 示例或范围 | IPv6 对应概念 | 作用范围 |
| --- | --- | --- | --- |
| 公网单播地址 | 已分配且允许全球路由的地址 | IANA 当前的全局单播分配位于 `2000::/3`；前缀内也有特殊用途保留段[^global-v6] | 可用于全球路由；实际可达性仍取决于路由与策略 |
| 私网地址 | `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` | `fc00::/7` 的**唯一本地地址**（Unique Local Address，ULA），其中 `fd00::/8` 用于本地分配 | 用于内部网络，不应作为普通源或目的地址在公网传播[^1] |
| 共享地址 | `100.64.0.0/10` | 无直接对应地址段 | 常用于**运营商级网络地址转换**（Carrier-Grade Network Address Translation，CGNAT，RFC 6888 简称 CGN）的接入网络[^2][^cgn] |
| 链路本地地址 | `169.254.0.0/16` | `fe80::/10` | 限于当前链路，不由路由器转发到其他链路[^link-local] |
| 环回地址 | `127.0.0.0/8`，常见 `127.0.0.1` | `::1/128` | 用于本机内部通信[^ipv4-special][^delivery] |

“公网地址”不等于“任何人都能访问”：没有可用路由、入口防火墙阻止连接或服务没有监听，都会使它不可达。类似地，私网地址可以通过专线、VPN 等在组织内部跨多个子网路由；它们并非只能用于一台家用交换机连接的范围。下文用 `198.51.100.20` 表示假想的远端目标；它与 `2001:db8::1` 都取自文档专用地址段，不适合作为公网连通性探测目标[^documentation-addresses]。

不同家庭可以重复使用 `192.168.1.10`，因为这些地址位于不同的地址域内。家庭网络访问公网 IPv4 时常通过下一篇的 [NAT](/posts/networking/routing-forwarding-nat-virtual-interfaces/#nat多台内网设备如何共用一个公网-ip) 转换地址。如果路由器 WAN 地址位于 `100.64.0.0/10`，通常说明还有运营商侧转换，仅配置家庭路由器的端口转发不足以建立完整入站路径；是否可用还需核对运营商的映射与防火墙策略。

环回地址 `127.0.0.1` 的流量在本机协议栈内交付，不经物理网卡发往局域网。除此之外，还有几种常见写法容易在配置、路由表和抓包中混淆[^ipv4-special][^delivery][^3]：

| 写法 | 含义 |
| --- | --- |
| `0.0.0.0` / `::` | 分别表示未指定的 IPv4 地址（如 DHCPv4 获取前）与 IPv6 **未指定地址**（`::/128`，如 DAD 探测源地址）；监听套接字中常表示通配绑定本地地址 |
| `0.0.0.0/0` / `::/0` | 默认路由的目的前缀，分别匹配任意 IPv4 或 IPv6 目的地址，更具体的匹配优先 |
| `224.0.0.0/4` | IPv4 组播地址范围，目的地址标识接收组 |
| `255.255.255.255` | IPv4 有限广播地址，限于本地链路，不由路由器转发 |

:::note[测试地址与 Fake-IP]
`198.18.0.0/15` 是网络设备基准测试保留段，不用于普通全球公网路由；在隔离测试网络中仍可实际使用，不能解释成“没有主机会使用”。透明代理也可能从这一范围分配 Fake-IP，把地址作为本地的域名映射标识。该地址的意义取决于代理维护的映射，具体处理留到[Fake-IP 的地址分配与域名映射](/posts/networking/proxies-tunnels-transparent-interception/#fake-ip在-dns-阶段建立映射)[^special]。
:::

## 子网掩码、CIDR 与同网段判定

**无类别域间路由**（Classless Inter-Domain Routing，CIDR）用 `地址/前缀长度` 表示网络范围。对 IPv4，`/24` 表示高 24 位为网络前缀，剩余 8 位区分范围内的地址；对应的子网掩码为 `255.255.255.0`[^3]。

**子网划分**（Subnetting）就是把一个地址范围按更长的网络前缀分成多个较小范围。前缀覆盖的部分称为**网络位**（Network Bits），用来标识所属子网；剩余部分称为**主机位**（Host Bits），用来区分子网内的地址。**子网掩码**（Subnet Mask）把网络位写成 `1`、主机位写成 `0`。对地址与掩码做**按位与**（Bitwise AND，记作 `&`）时，只有对应的两位都是 `1`，结果才为 `1`，因此网络位被保留，主机位被清零[^subnet]。

主机用**路由表**（Routing Table）选择出接口与**下一跳**（Next Hop，即本次直接交付的同链路目标或网关）。本篇只用到两种结果：**直连路由**（Connected Route）指示在本链路上交付，**默认路由**（Default Route）在没有更具体匹配时指向网关。完整的条目结构与选择规则见第三篇的[路由表与最长前缀匹配](/posts/networking/routing-forwarding-nat-virtual-interfaces/#路由表与最长前缀匹配)。

以下先讨论一张普通局域网接口、直连路由和默认路由的配置：本机是 `192.168.1.10/24`，默认网关是 `192.168.1.1`，没有更具体的路由或策略规则。在这个模型里，由于发送方并不知道目标主机配置了什么掩码，发送方只能用**自己的子网掩码**分别对本机 IP 和目标 IP 做按位与，借此解释目标是否匹配直连路由：

1. 计算 `本机 IP & 子网掩码`。
2. 计算 `目标 IP & 子网掩码`。
3. 比较两者是否相等。

| 目标 | 按 `/24` 计算的前缀 | 本例的交付方式 |
| --- | --- | --- |
| 打印机 `192.168.1.50` | `192.168.1.0` | 匹配直连路由，直接交给打印机 |
| 假想远端 `198.51.100.20` | `198.51.100.0` | 不匹配直连路由，经默认网关转发 |

**实际出接口与下一跳以路由选择结果为准**。配置地址通常会建立相应的直连路由，因而上面的掩码模型能解释最常见的结果；如果另有 `192.168.1.50/32` 主机路由，目标即使属于这个 `/24`，也可能经另一个网关转发。

### 家庭局域网的地址怎样分配

沿用 `192.168.1.0/24`。掩码 `255.255.255.0` 留出 8 位主机位，共 256 个地址。主机位全 `0` 的**网络地址**（Network Address）标识整个子网，主机位全 `1` 的**广播地址**（Broadcast Address）用于子网定向广播。扣除这两个地址，常规主机地址是 `192.168.1.1` 至 `192.168.1.254`，共 254 个，路由器的 LAN 接口也占用其中一个[^subnet][^delivery]。

| 地址或范围 | 本例用途 |
| --- | --- |
| `192.168.1.0` | 网络地址，路由表以 `192.168.1.0/24` 表示这个直连子网 |
| `192.168.1.1` | 路由器 LAN 接口，同时作为默认网关和 DHCP 服务器 |
| `192.168.1.10`、`192.168.1.50` | 分别配置给电脑和打印机 |
| `192.168.1.53` | 本例的 DNS 服务器 |
| `192.168.1.100` 至 `192.168.1.200` | 管理员为 DHCP 动态租约划定的地址池 |
| `192.168.1.255` | 本子网的定向广播地址，实际收发受设备和防火墙配置影响 |

网关、DHCP 服务器、DNS 服务器和地址池都由网络配置决定。普通以太网局域网的默认网关通常使用本子网内可直达的一个主机地址，例如尚未被占用的 `192.168.1.254` 也可以配置给能转发的路由器。路由器如果同时提供 DNS 转发，主机也可以把 DNS 指向 `192.168.1.1`。DNS 还可以配置为能经路由访问的外部地址[^dns-config]。静态地址应避开动态地址池和其他设备已占用的地址[^6]。

访问同网段的打印机时，电脑通过 [ARP](#ipv4-的地址解析arp) 查询 `192.168.1.50` 的 MAC。访问前面的假想远端时，电脑查询的是网关 `192.168.1.1` 的 MAC，并把它填进以太网帧的目的 MAC 字段，帧内数据报的目的 IP 仍是远端地址。广播也分两层，`192.168.1.255` 和 `255.255.255.255` 是目的 IPv4 地址，`ff:ff:ff:ff:ff:ff` 是[目的 MAC 地址](#先区分地址层次再看接收范围)[^delivery]。

### 算清一个 /27 子网

把本机改为 `192.168.10.37/27`，仍限定只有普通直连与默认路由。IPv4 共 32 位，`/27` 表示前 27 位是网络位，后 5 位是主机位，所以每个子网包含 $2^{32-27}=2^5=32$ 个地址。

前三个字节都属于网络位，最后一字节用 `|` 分开 3 位网络位与 5 位主机位。IP 与掩码按位与得到网络地址；保留网络位并将 5 位主机位全置 `1`，得到广播地址：

```text
                           Net | Host
IP         192.168.10.37   001 | 00101
Mask       255.255.255.224 111 | 00000
Network    192.168.10.32   001 | 00000
Broadcast  192.168.10.63   001 | 11111
```

`37 & 224 = 32`，所以子网从 `.32` 开始。主机位从 `00000` 变到 `11111`，覆盖 `.32` 至 `.63`；本机的 `.37` 只是其中一个地址。

```mermaid title="把一个 /24 地址范围划成 /27 子网" description="192.168.10.0/24 可分成八个 /27，每个含 32 个地址；图只展开前三个，其余范围见正文。连线表示范围包含关系，不表示实际网络连线；框的宽度不代表地址数量。本机 .37 与目标 .62 位于 .32 至 .63，.64 则是下一子网的网络地址。"
flowchart TB
 block["192.168.10.0/24<br/>最后一字节：0…255"]
 block --> first["192.168.10.0/27<br/>.0…31"]
 block --> local["192.168.10.32/27<br/>.32…63 · 本机所在子网"]
 block --> next["192.168.10.64/27<br/>.64…95"]
 local --> network[".32 网络地址<br/>主机位全 0"]
 local --> hosts[".33…62 常规主机地址<br/>含本机 .37、目标 .62"]
 local --> broadcast[".63 广播地址<br/>主机位全 1"]
 class local state
 class hosts result
```

每个 `/27` 占连续的 32 个地址，因此子网起点依次是 `.0`、`.32`、`.64`、`.96`、`.128`、`.160`、`.192`、`.224`，不是从本机地址 `.37` 开始再数 32 个。本例两端分别是网络地址和广播地址，不分配给普通主机。

| 项目 | 计算结果 |
| --- | --- |
| 子网掩码 | `255.255.255.224` |
| 网络地址 | `192.168.10.32` |
| 广播地址 | `192.168.10.63` |
| 常规主机范围 | `192.168.10.33` 至 `192.168.10.62`，共 30 个 |
| 目标 `.62` / `.64` | `.62` 属于该前缀；`.64` 属于下一个 `/27` |

下面这张图把全文的两次判断连起来。先对 `.62` 和 `.64` 分别应用本机的 `/27` 掩码选出下一跳，再查询这一跳的 MAC。下图假设默认网关为本子网内可用的 `192.168.10.33`，邻居缓存尚无可用映射；图中的 [ARP 地址解析](#ipv4-的地址解析arp)用于查询下一跳 IP 对应的 MAC，具体流程在局域网交付一节展开：

```mermaid title="目标 .62 和 .64 怎样选择下一跳" description="本机为 192.168.10.37/27，只有直连路由和经 .33 的默认路由，无策略路由或更具体的路由，且邻居缓存尚无映射。箭头表示计算与交付步骤；ARP 用于解析选出的下一跳，IP 目的地址保持为最终目标。.64 不在本机子网内，但能否访问仍取决于网关及后续网络。"
flowchart TB
 local["本机 .37/27<br/>网络地址 .32"]
 local --> near["目标 .62<br/>62 AND 224 = 32"]
 local --> far["目标 .64<br/>64 AND 224 = 64"]
 near --> direct["同一前缀：匹配直连路由<br/>ARP 解析目标 .62 的 MAC"]
 far --> gateway["不同前缀：使用默认路由<br/>ARP 解析网关 .33 的 MAC"]
 direct --> frame1["帧交给目标<br/>目的 IP = .62<br/>目的 MAC = .62 的 MAC"]
 gateway --> frame2["帧交给网关转发<br/>目的 IP = .64<br/>目的 MAC = .33 的 MAC"]
 class local actor
 class near,far state
 class direct,frame1,gateway,frame2 result
```

`.64` 不在本机直连子网内，不等于它必然不可达；应由网关及后续路由继续决定交付。不过在把 `192.168.10.64/27` 配成另一个常规子网的网络中，`.64` 本身是网络地址，不能当作普通主机地址；下一子网的常规主机范围是 `.65` 至 `.94`。同一交换机上的设备也可能配置在不同 IP 子网，物理上接在一起并不等于会直接解析对方 MAC。

再固定本机地址为 `192.168.10.37`，只改变前缀长度，并始终比较 `.62` 和 `.64`：

| 本机与前缀         | 网络地址与广播地址 | `.62` 在本机前缀内？ | `.64` 在本机前缀内？ |
| ------------------ | ------------------ | -------------------- | -------------------- |
| `192.168.10.37/24` | `.0` 与 `.255`     | 是                   | 是                   |
| `192.168.10.37/26` | `.0` 与 `.63`      | 是                   | 否                   |
| `192.168.10.37/27` | `.32` 与 `.63`     | 是                   | 否                   |
| `192.168.10.37/28` | `.32` 与 `.47`     | 否                   | 否                   |

两个 IP 的数字相近并不能说明它们属于同一子网，必须结合前缀长度；前缀越长，固定的网络位越多，包含的地址越少。

下面的 POSIX C 程序把接口配置抽象成 `Ipv4Prefix`：一个 IPv4 地址和一个前缀长度。地址和掩码采用无符号 32 位整数 `uint32_t`，以保证按位与、取反和左移不涉及有符号符号位溢出。用 `inet_pton` 把文本读入 `struct in_addr`，再用 `ntohl` 转为主机字节序的整数做掩码运算。打印时走相反方向，用 `htonl` 和 `inet_ntop` 转回文本[^beej-ip]。

```c
#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

struct Ipv4Prefix {
    uint32_t address;
    unsigned length;
};

static void print_ipv4(uint32_t address) {
    // Convert host-order integer back to network byte order for inet_ntop.
    struct in_addr wire = {.s_addr = htonl(address)};
    char text[INET_ADDRSTRLEN];
    if (inet_ntop(AF_INET, &wire, text, sizeof text) == NULL) {
        exit(EXIT_FAILURE);
    }
    fputs(text, stdout);
}

int main(void) {
    struct in_addr local;
    // inet_pton returns 1 on success, 0 on invalid input, -1 on unsupported family.
    if (inet_pton(AF_INET, "192.168.10.37", &local) != 1) {
        return EXIT_FAILURE;
    }
    struct Ipv4Prefix prefix = {.address = ntohl(local.s_addr), .length = 27};
    if (prefix.length > 32) {
        return EXIT_FAILURE;
    }

    // Guard length == 0 because shifting a 32-bit uint32_t by 32 bits is UB in C17.
    uint32_t mask = prefix.length == 0 ? 0 : UINT32_MAX << (32 - prefix.length);
    uint32_t network = prefix.address & mask;

    fputs("mask=", stdout);
    print_ipv4(mask);
    fputs("\nnetwork=", stdout);
    print_ipv4(network);
    printf("/%u\nbroadcast=", prefix.length);
    // Upper bound serves as a subnet broadcast address only on conventional <= /30 subnets.
    print_ipv4(network | ~mask);
    putchar('\n');

    const char *targets[] = {"192.168.10.62", "192.168.10.64"};
    for (size_t i = 0; i < sizeof targets / sizeof targets[0]; ++i) {
        struct in_addr target;
        if (inet_pton(AF_INET, targets[i], &target) != 1) {
            return EXIT_FAILURE;
        }
        uint32_t target_network = ntohl(target.s_addr) & mask;
        printf("target=%s same_prefix=%s\n", targets[i],
               target_network == network ? "true" : "false");
    }
    return EXIT_SUCCESS;
}
```

把代码保存为 `ipv4_prefix.c`，在 macOS 或 Linux 用 `cc -std=c17 ipv4_prefix.c -o ipv4_prefix` 编译，再运行 `./ipv4_prefix`。`/0` 单独返回零掩码，避免把 32 位整数左移 32 位。`broadcast` 一行解释本例的 `/27`，`/31` 与 `/32` 的地址用途见下一节。

预期输出如下。

```text
mask=255.255.255.224
network=192.168.10.32/27
broadcast=192.168.10.63
target=192.168.10.62 same_prefix=true
target=192.168.10.64 same_prefix=false
```

`same_prefix=true` 表示目标地址经掩码计算后落在同一前缀。地址能否分配给普通主机取决于子网的地址规则，实际下一跳仍由路由决定。

### IPv4 子网地址计数与 /31、/32 的用法

IPv4 前缀长度为 $n$ 时，剩余的 $32-n$ 位给出 $2^{32-n}$ 个地址。在前缀长度不超过 30 的常规 IPv4 多址子网中，主机位全 `0` 的地址表示网络本身，全 `1` 的地址用于子网广播，因此常规可用主机地址数是 $2^{32-n}-2$。

| CIDR 前缀 | 子网掩码          | 地址总数 | 可用主机地址数 | 常见用途           |
| --------- | ----------------- | -------- | -------------- | ------------------ |
| `/24`     | `255.255.255.0`   | 256      | 254            | 家庭与小型办公网络 |
| `/26`     | `255.255.255.192` | 64       | 62             | 部门或虚拟化网段   |
| `/27`     | `255.255.255.224` | 32       | 30             | 本文的子网划分示例 |
| `/30`     | `255.255.255.252` | 4        | 2              | 点对点互联链路     |
| `/31`     | `255.255.255.254` | 2        | 点对点链路上为 2 | 点对点互联链路     |
| `/32`     | `255.255.255.255` | 1        | 不适用减二规则 | 单个地址的主机路由 |

在 `/31` 点对点链路上，两个地址都可分配给端点[^31]。例如 `192.0.2.10/31` 的端点可以是 `.10` 和 `.11`。上面程序仍能计算 `/31` 的位范围，但打印为 `broadcast` 的范围上界在这种链路中不具有子网广播语义。`/32` 则固定全部 32 位，主机路由用它精确匹配一个目的地址[^3]。IPv6 没有 IPv4 式的子网广播地址[^delivery]。

### IPv6 地址表示法与 /64 前缀原则

IPv6 地址共 128 位，写成 8 组 16 位十六进制数（以冒号分隔）。每组可省略前导零；整串中连续全零的若干组可用一个 `::` 压缩（一个地址里至多出现一次 `::`，否则无法唯一还原）。例如后文示例 `2001:db8::12:3456` 展开后是 `2001:0db8:0000:0000:0000:0000:0012:3456`[^ipv6-basics]。

普通以太网局域网的 IPv6 前缀通常固定划分为 `/64`（高 64 位为网络前缀，低 64 位为**接口标识符**，Interface Identifier，IID），而不是像 IPv4 那样按设备数量切出 `/26`、`/27` 来节省地址。原因有三点：一是无状态自动配置（SLAAC）要求 64 位 IID 空间；二是 IPv6 没有子网广播地址，也不必扣除广播地址，而全零 IID 保留给子网路由器任播地址（Subnet-Router Anycast）；三是点对点路由器互联链路在现代部署中常采用 `/127`，以避免 `/64` 上巨大空间带来的邻居表耗尽风险[^ipv6-basics][^ipv6-p2p]。

## 局域网交付：MAC 地址、交换机与 ARP / NDP

上一节用三层 IP 前缀判断下一跳是目标自身还是网关；现在进入二层，解决“怎样在当前链路把帧送给这个下一跳”。[以太网帧的封装图](/posts/networking/layered-architecture-packet-journey/#以太网帧的封装与结构)展示了帧头、内部的 IP 数据报和帧尾校验。这里的以太网帧头使用 48 位 MAC 地址，因此主机需要把“下一跳 IP”关联到链路层地址。这里讨论以太网式局域网；点对点或 [TUN 接口](/posts/networking/routing-forwarding-nat-virtual-interfaces/#tun-与-tap用户态读写哪些数据)不一定需要后文的 ARP 地址解析。

IP 地址服务于跨网寻址，MAC 地址服务于当前二层链路的帧交付。MAC 可以由硬件提供，也可以由系统配置或为隐私而随机生成。经过路由器时，旧链路头被移除，下一段链路重新封装，原主机的 MAC 不会作为端到端地址一路保留。

### 先区分地址层次，再看接收范围

**单播**（Unicast）以一个指定接收者为目标，**广播**（Broadcast）面向指定范围内的所有接收者，**组播**（Multicast）面向一个接收组。这些概念在 MAC 层与 IP 层都有对应含义，必须先说明讨论的是帧的目的 MAC，还是 IP 包的目的地址，不能把它们当成同一个字段：

| 接收方式 | 以太网帧的目的 MAC（二层）                           | IP 包的目的地址（三层）                                                                            |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 单播     | 某个接口的单播 MAC，例如 `00:00:5e:00:53:01`         | 某个接口的单播 IP，例如 `192.168.1.10`                                                             |
| 广播     | `ff:ff:ff:ff:ff:ff`，面向当前二层广播域              | IPv4 的 `255.255.255.255` 是有限广播；`192.168.1.255` 在 `/24` 下是子网定向广播地址；IPv6 没有广播 |
| 组播     | 组地址，例如 IPv6 邻居发现使用的 `33:33:ff:XX:XX:XX` | IPv4 使用 `224.0.0.0/4` 的组播地址；IPv6 使用 `ff00::/8`，例如后文的被请求节点组播地址             |

IP 广播与组播的范围由相应协议规定，不能一概解释为“当前交换机上的所有接口”[^delivery]。其中，`ff:ff:ff:ff:ff:ff` 是**以太网广播地址**（Ethernet Broadcast Address）：6 个字节各为十六进制 `ff`，即十进制 255、二进制 `11111111`，合起来 48 位全为 `1`。它是特殊的目的 MAC，不属于某一张网卡[^mac]。

**广播域**（Broadcast Domain）是二层广播能传播到的范围。交换机可用**虚拟局域网**（Virtual Local Area Network，VLAN）隔离不同广播域，普通路由器不会把一侧的二层广播直接转发到另一侧。IP 子网描述三层地址范围，广播域描述二层传播范围；常见局域网将两者对应配置，但它们是不同概念。

### 交换机怎样交付以太网帧

交换机通过帧的源 MAC 学习“哪个 MAC 位于哪个端口”，再查询目的 MAC 决定转发端口。如果目的 MAC 是单播地址，但表里没有对应位置，就称为**未知单播**（Unknown Unicast）。交换机通常在所属 VLAN 内执行**泛洪**（Flooding）：把该帧复制到除入端口外的其他可转发端口[^flooding]。这是交换机的转发动作，并不会把帧的目的地址改成广播地址；其他主机收到后，通常会丢弃目的 MAC 不属于自己的单播帧。广播帧也会在所属广播域内传播，不能据此推断整个组织的所有设备都会收到。

| 帧的目的地址与查表结果     | 普通二层交换的交付动作                                   |
| -------------------------- | -------------------------------------------------------- |
| 已知单播，目的位于另一端口 | 从对应端口转发；若目的就在入端口后方，则不再转发回该端口 |
| 未知单播                   | 通常在该 VLAN 内向除入端口外的其他可转发端口泛洪         |
| 广播 MAC                   | 在该广播域内向除入端口外的其他可转发端口复制转发         |
| 组播 MAC                   | 按组播转发表及配置决定出口；缺少相应状态时也可能泛洪     |

因此，“单播”不保证交换机只向一个端口发送，“组播”也不保证其他端口绝不会看到帧。目的地址说明预期接收范围，实际复制到哪些端口还取决于交换机的表项和配置[^flooding]。交换机的 MAC 表项还会按计时器老化；设备更换端口或重启长时间未通信后表项失效，都会重新触发学习或未知单播泛洪。

### IPv4 的地址解析：ARP

IPv4 在以太网上通过**地址解析协议**（Address Resolution Protocol，ARP）解析下一跳 MAC[^4]。例如本机 `192.168.1.10` 经网关 `192.168.1.1` 访问远端时，要解析的是网关的 MAC；若邻居缓存已有可用映射，可以直接封装，而不必先发 ARP 广播。

ARP Request 直接封装在以太网帧里，`EtherType` 为 `0x0806`，不经过 IPv4 头部。请求中虽然有“发送方 IP”和“目标 IP”，它们是 ARP 的字段。因此，ARP 广播使用的是帧头中的目的 MAC `ff:ff:ff:ff:ff:ff`，并不是向 IPv4 目的地址 `255.255.255.255` 发送一个 IP 包[^4]。

假设同一 VLAN 内的 A、B、C 都配置 `/24`，交换机最初没有它们的 MAC 表项，A 的邻居缓存也没有 B。使用文档专用的单播 MAC，避免把组地址误用为普通主机地址[^mac]：

| 设备 | IPv4 地址      | MAC 地址            |
| ---- | -------------- | ------------------- |
| A    | `192.168.1.10` | `00:00:5e:00:53:01` |
| B    | `192.168.1.11` | `00:00:5e:00:53:03` |
| C    | `192.168.1.12` | `00:00:5e:00:53:04` |

#### ARP 请求的帧布局

A 查路由后确定 B 在直连链路上，需要知道 B 的 MAC。这个请求的帧头与 ARP 消息各自携带地址[^4]。

```mermaid title="以太网广播帧直接承载 ARP 请求" description="以太网头的目的 MAC 全为 ff，用于广播。ARP 消息内的目标 MAC 此时未知，本例填全零；目标 IPv4 是要解析的 B。ARP 直接位于帧载荷，没有独立的 IPv4 头。省略部分字段、填充和 FCS。"
flowchart TB
 subgraph frame[Ethernet II 帧]
  eth["帧头 · EtherType=0x0806<br/>目的 MAC<br/>ff:ff:ff:ff:ff:ff<br/>源 MAC<br/>00:00:5e:00:53:01"]
  subgraph arp[ARP 请求]
   format["硬件类型=1 · 以太网<br/>协议类型=0x0800 · IPv4<br/>地址长度：MAC 6 · IPv4 4<br/>操作码=1 · Request"]
   sender["发送方 MAC<br/>00:00:5e:00:53:01<br/>发送方 IPv4：192.168.1.10"]
   target["目标 MAC<br/>00:00:00:00:00:00<br/>目标 IPv4：192.168.1.11"]
   format --- sender --- target
  end
  eth --- format
 end
 linkStyle default stroke:none
```

请求表达的是“谁拥有 `192.168.1.11`？请把 MAC 告诉 `192.168.1.10`”。外层广播让同一广播域内的设备有机会收到请求。交换机按外层目的 MAC 转发，收到请求的主机再检查 ARP 消息中的目标 IPv4[^4]。

#### ARP 请求与应答的时序

```mermaid title="ARP 广播怎样经交换机找到目标 MAC" description="A、B、C 位于同一 VLAN，均为 /24；A 无 B 的邻居缓存，交换机初始无相关 MAC 表项，无代理 ARP。箭头表示报文与处理顺序，不表示耗时。交换机从源 MAC 学习端口；广播请求到达 B、C，B 单播回复后，A 才发送原 IPv4 包。"
sequenceDiagram
 participant A as 主机 A
 participant S as 二层交换机
 participant B as 主机 B
 participant C as 主机 C
 A->>S: ARP Request：广播 MAC<br/>谁拥有 192.168.1.11？
 Note over S: 学习 A 的源 MAC 与端口
 S->>B: 复制广播帧
 S->>C: 复制广播帧
 Note over C: 目标 IP 不是自己<br/>不回复
 B->>S: ARP Reply：单播到 A<br/>.11 对应 B 的 MAC
 Note over S: 学习 B 的端口<br/>查到 A 的端口
 S->>A: 向 A 的端口转发回复
 Note over A: 缓存 B 的 IP 与 MAC 映射
 A->>S: 原 IPv4 包：目的 IP 为 B<br/>外层帧：目的 MAC 为 B
 S->>B: 查表，向 B 的端口转发
```

这里有两张用途不同的表：主机的**邻居表**（Neighbor Table）关联下一跳 IP 与 MAC，交换机的 **MAC 地址表**（MAC Address Table）关联 MAC 与端口。交换机转发 ARP 请求不需要理解其中的目标 IPv4，也不会代替 B 回答；它只根据帧头完成当前 VLAN 内的交付。

如果 A 访问远端，前面的路由表会选出网关，此时把例子里的 B 换成网关即可：ARP 查询网关 MAC，随后数据帧的目的 MAC 是网关，而 IPv4 包的目的地址仍是远端。本文实验里的网关 `192.168.1.1` 使用文档 MAC `00:00:5e:00:53:02`。

### 从 ARP 结果到实际发出的帧

沿用 A、B 和网关的地址，比较 A 发出的两份 IPv4 包：一份给同链路的 B（`192.168.1.11`），另一份给远端服务器（文档示例地址 `198.51.100.20`）。仍假定只有普通 `/24` 直连路由与默认路由，没有代理 ARP 或更具体路由；所需的 ARP 解析已经完成。

| 出站字段 | 直连 B | 经默认网关 |
| --- | --- | --- |
| 下一跳 IPv4 | `192.168.1.11` | `192.168.1.1` |
| 以太网目的 MAC | `00:00:5e:00:53:03`（B） | `00:00:5e:00:53:02`（网关） |
| 以太网源 MAC | `00:00:5e:00:53:01` | `00:00:5e:00:53:01` |
| EtherType | `0x0800` | `0x0800` |
| IPv4 目的地址 | `192.168.1.11` | `198.51.100.20` |
| IPv4 源地址 | `192.168.1.10` | `192.168.1.10` |

发往远端的帧先交给网关，是因为目的 MAC 填了网关的地址；网关取出里面的 IPv4 包后，仍按 `198.51.100.20` 继续选路。A 无需取得远端服务器的 MAC。交换机只在当前 VLAN 内交付这个帧，经过路由器之后的下一份帧见第三篇的[三跳包头对照](/posts/networking/routing-forwarding-nat-virtual-interfaces/#同一个-ip-包经过三段以太网链路)。

[一次冷启动 HTTPS 访问](/posts/networking/layered-architecture-packet-journey/#冷启动时客户端会发哪些报文)会先后用到这两种交付方式。若两个映射都未缓存，发 DNS 查询前先对直连解析器 `192.168.1.53` 发 ARP，向远端网站发 SYN 前再对网关 `192.168.1.1` 发 ARP。两次 ARP 都由以太网单独承载，得到的 MAC 分别填入后续 DNS 帧和 SYN 帧的目的 MAC 字段。

### IPv4 地址冲突检测：ARP 探测与地址公告

在使用候选 IPv4 地址前，主机可以用 ARP 检查同一链路上是否已有设备在使用该地址。RFC 5227 分别定义使用前的 `ARP Probe` 与探测成功后的 `ARP Announcement`[^acd]。工程讨论中的“免费 ARP”一词容易混淆这两种报文。

| 报文 | 发送方 IP | 目标 IP | 主要用途 |
| --- | --- | --- | --- |
| ARP Probe | `0.0.0.0` | 待使用地址 | 使用前检查是否与其他主机冲突；发送方填 `0.0.0.0` 以免在确认无冲突前污染局域网其他主机的 ARP 缓存 |
| ARP Announcement | 本机地址 | 同一个本机地址 | 公告地址使用，更新邻居的地址映射 |

两者都使用广播 ARP Request，但字段与阶段不同。公告还可用于使用期间的地址防御；探测成功也不能保证以后不会出现地址冲突。高可用切换时，公告可以帮助邻居更新 IP 到 MAC 的映射，交换机则通过帧的源 MAC 学习所在端口，两种更新不是同一张表。

:::caution[ARP 回复不是身份凭证]
经典 ARP 没有内建的发送者身份认证，恶意主机可能伪造映射。看到一条 ARP Reply 只能证明收到了该声明，不能单独证明发送者就是可信网关。这里的地址探测也不提供防欺骗保证。
:::

### IPv6 的邻居发现：NDP

IPv6 使用基于 ICMPv6 的**邻居发现协议**（Neighbor Discovery Protocol，NDP），不使用 ARP，也没有 IPv4 式广播。需要在以太网上解析下一跳的 MAC 且没有可用映射时，主机发送**邻居请求**（Neighbor Solicitation，NS）。IPv6 包的目的不是所有节点组播 `ff02::1`，而是给目标地址对应的**被请求节点组播地址**（Solicited-Node Multicast Address）：把目标 IPv6 地址的低 24 位拼到 `ff02::1:ff00:0/104` 后；以太网则用 `33:33` 加上该 IPv6 **组播地址**的低 32 位作为目的 MAC[^5][^ndp-multicast]。

例如解析同链路的 `2001:db8::12:3456` 时，NS 内的 `Target Address` 仍是 `2001:db8::12:3456`，IPv6 目的地址是 `ff02::1:ff12:3456`，帧的目的 MAC 是 `33:33:ff:12:34:56`。低 24 位相同的多个地址可能加入同一组，收到 NS 的节点仍需看完整的 `Target Address`。普通地址解析中，目标用单播**邻居通告**（Neighbor Advertisement，NA）回复请求方，并在选项中提供自己的链路层地址；已有缓存时，邻居不可达检测还可用单播 NS 探测[^5][^ndp-multicast]。

NDP 也定义路由器发现和前缀发现。地址自动配置使用其中的 RA 等信息，但 SLAAC 地址生成与重复地址检测的具体规则由另一份规范定义，下面会继续区分。

无论 IPv4 的 ARP 还是 IPv6 的 NDP，邻居缓存项都不是简单的“有或无”，而是有自己的状态生命周期。按照 RFC 4861 的**邻居不可达检测**（Neighbor Unreachability Detection，NUD）模型（Linux `ip neigh` 与 macOS `ndp -an` 也采用类似状态划分）[^5][^neighbor-tools]：

| 状态（macOS `ndp` / Linux） | 含义 | 发送业务包时的行为 |
| --- | --- | --- |
| `INCOMPLETE`（`I` / `(incomplete)`） | 已发出请求，尚未收到解析应答 | 缓存待发报文并等待解析结果 |
| `REACHABLE`（`R`） | 近期收到前向可达性确认 | 直接封装并发送，不额外探测 |
| `STALE`（`S`） | 已超过 `ReachableTime`，但仍保留旧 MAC | 仍先按旧 MAC 发送，并转入 `DELAY` |
| `DELAY`（`D`） | 短暂等待上层或对端带来被动确认 | 超时未获确认则进入主动探测 |
| `PROBE`（`P`） | 正在周期性发送单播 NS 主动确认 | 多次失败后表项失效或删除（Linux 常见 `FAILED`） |

手工配置的静态映射或本机接口自身在工具输出中常标为 `PERMANENT`（`permanent`）。看清这些状态，后面实验里才能分清“有表项”和“当前真的可达”是两回事。

## 主机怎样自动获得网络配置

现在回到开头的[配置清单](#接入网络先认清配置清单)：这些参数如何到达主机？普通家庭或办公网络往往通过**动态主机配置协议**（Dynamic Host Configuration Protocol，DHCPv4）自动下发 IPv4 地址、子网掩码、网关和 DNS 服务器地址；手工静态配置是另一种来源[^dns-config]。

### DHCPv4 的租约获取与续租

首次获取租约通常经历四步，也称 DORA（Discover、Offer、Request、Acknowledgment）。对应报文为 `DHCPDISCOVER`、`DHCPOFFER`、`DHCPREQUEST` 和 `DHCPACK`。客户端使用 UDP 端口 `68`，服务器使用 `67`[^6]：

初始客户端尚无可用 IPv4 地址，Discover 通常从 `0.0.0.0:68` 发到 `255.255.255.255:67`，在以太网内使用广播。普通路由器不会把这份局域网广播直接转发到另一子网；DHCP 中继接收后填写 `giaddr` 等信息并转交服务器，服务器据此选择地址池和回复路径。`0.0.0.0` 在这里是尚未配置地址时的协议用法，不是已经租到的主机地址[^6]。

| 阶段 | 作用 | 常见交付方式 |
| --- | --- | --- |
| Discover | 寻找可用服务器 | 客户端通常广播 |
| Offer | 提供地址与配置报价 | 尚未配置可用 IP 的客户端可置位请求中的广播标志（Broadcast Flag），提示服务器或中继按广播或单播返回 |
| Request | 选择某一服务器的报价 | 选择阶段通常广播，让其他服务器也知道选择结果 |
| ACK | 确认配置与租约 | 服务器按交付条件单播或广播 |

这是一套消息流程，不能总结为“四步广播”。存在 DHCP 中继时，服务器还可能先把回复发给中继，再由它向客户端交付；续租等状态下的 DHCPREQUEST 也不必广播。若收到 `DHCPACK` 后的冲突检测发现地址已被占用，客户端可回复 `DHCPDECLINE` 放弃该租约；若服务器拒绝续租请求并返回 `DHCPNAK`，客户端则须停止用址并重新发起 Discover[^6]。

租约带有期限。默认 T1 为租期的 50%，客户端向原服务器单播续租；默认 T2 为 87.5%，仍未成功时进入重新绑定阶段，广播尝试联系其他服务器。服务器可以指定不同的 T1、T2，且须早于租期结束。到期仍未获得 ACK，客户端必须停止使用该地址并重新获取配置[^6]。

```mermaid title="DHCPv4 从首次租约到续租与重绑定" description="限定无中继的一种首次获取路径，省略广播域内其他接收者。Offer 与 ACK 按客户端状态及广播标志单播或广播，不能把 DORA 统称为四次广播。T1、T2 以本轮租期起点计时，50% 与 87.5% 是默认值；后半图选择 T1 续租未获 ACK 的分支，T2 才广播重绑定。任何成功 ACK 都会按新租约重新计时；箭头和间距不代表真实租期比例。"
sequenceDiagram
 participant Client as 客户端 UDP 68
 participant Original as 原服务器 UDP 67
 participant Other as 其他 DHCP 服务器
 Client->>Original: Discover：广播寻找服务器
 Original->>Client: Offer：报价，单播或广播
 Client->>Original: Request：选择报价，通常广播
 Original->>Client: ACK：确认租约，单播或广播
 Note over Client: 开始使用地址并记录租期
 Client->>Original: T1 默认 50%：单播 Request 续租
 Note over Client,Original: 本分支假设没有收到续租 ACK
 Client->>Other: T2 默认 87.5%：广播 Request 重绑定
 Note over Original,Other: 广播域内可用服务器均可收到
 Other->>Client: 若接受续租，返回 ACK
 Note over Client: 成功则重置租期；否则到期停止用址
```

回到[家庭局域网的配置](#家庭局域网的地址怎样分配)：假设客户端从动态池租到 `192.168.1.100`，在完成适用的[地址冲突检查](#ipv4-地址冲突检测arp-探测与地址公告)后启用该地址[^6]。在本篇的简化模型中，ACK 下发的掩码对应直连路由 `192.168.1.0/24`，网关选项给出默认下一跳 `192.168.1.1`；DNS 选项则告诉解析器向 `192.168.1.53` 查询[^dns-config]。

此后每次发包仍按普通交付规则选路。目的 IP 是打印机 `192.168.1.50`，就直接交给打印机；目的 IP 是示例远端 `198.51.100.20`，就先交给网关。没有可用的邻居映射时，主机用 [ARP](#ipv4-的地址解析arp) 查询选出的下一跳，再用其 MAC 封装帧；DHCP 提供 IP 配置，不负责把业务包送到下一跳。

### IPv6 的 RA、SLAAC 与 DNS 参数

**无状态地址自动配置**（Stateless Address Autoconfiguration，SLAAC）允许主机根据**路由器通告**（Router Advertisement，RA）中的信息自行生成地址，但“收到一个前缀”到“拥有可用地址”之间仍有状态转换：

1. 主机通过路由器通告 RA 发现路由器；默认路由是否有效取决于通告中的 Router Lifetime 等信息。
2. RA 中的前缀信息选项若允许自主配置，主机可把前缀与生成的接口标识符组合为候选地址。用于 SLAAC 的前缀与默认路由信息承担不同职责。
3. 接受**重复地址检测**（Duplicate Address Detection，DAD）的地址在检测完成前处于 tentative 状态，不能按普通可用地址使用。DAD 发现冲突时不得分配该地址；接口配置也可能按规范关闭 DAD。
4. 地址通过检测后，还受 preferred lifetime 与 valid lifetime 约束：首选期限到期后进入 deprecated 状态，既有通信可继续使用；有效期限到期后地址失效[^slaac]。

RA 还可通过**递归 DNS 服务器选项**（Recursive DNS Server，RDNSS）通告递归 DNS 服务器，通过**DNS 搜索列表**（DNS Search List，DNSSL）通告搜索域；这些选项有自己的有效期，不能与默认路由或地址前缀的有效期混为一谈[^rdnss]。网络也可以使用 DHCPv6 提供地址或其他参数，但 IPv6 默认路由通常仍来自 RA。

| 需要的配置 | 主要机制 | 排障时分别检查 |
| --- | --- | --- |
| 默认路由 | RA 的路由器信息与 Router Lifetime | 有全局地址不代表存在有效默认路由；RA 源地址是路由器的链路本地地址 |
| 链路上前缀 | RA 前缀选项的 `L`（On-Link）标志 | 判断前缀是否 on-link，与能否生成地址分开 |
| SLAAC 地址 | RA 前缀选项的 `A`（Autonomous Address-Configuration）标志、地址生成及 DAD | 普通以太网 SLAAC 通常使用 `/64`；`A` 与 `L` 不是同一个开关 |
| DHCPv6 地址或参数 | 有状态四步交互（Solicit / Advertise / Request / Reply）或无状态 `Information-request` / `Reply` | RA 中的 `M`（Managed Address Configuration，有状态地址分配）与 `O`（Other Configuration，获取 DNS 等其他参数）标志提供配置线索，客户端使用 UDP 546 端口、服务器使用 UDP 547 端口；不能套用 DHCPv4 DORA |
| DNS 服务 | RA RDNSS、DHCPv6 或本机配置 | 取得地址、路由和 DNS 是不同的成功条件 |

主机可以先向所有路由器组播地址 `ff02::2` 发送**路由器请求**（Router Solicitation，RS）促使路由器回复 RA，也可以接收路由器发往所有节点组播地址 `ff02::1` 的周期性 RA[^ra]。DHCPv6 的地址分配不能代替 RA 的默认路由发现；因此“一律屏蔽 ICMPv6”可能同时破坏邻居解析、路由发现和第八篇说明的[路径 MTU 反馈](/posts/networking/network-diagnostics-performance-troubleshooting/#ipv4-与-ipv6-的路径-mtu-反馈)[^ra][^dhcpv6][^pmtu6]。

一个接口还可同时持有稳定地址与定期更换的**临时地址**（Temporary Address）。RFC 8981 的临时地址扩展减少长期使用同一接口标识符造成的关联，但不会隐藏网络前缀，也不等于匿名；具体是否生成、优先选择哪个源地址，要看系统策略。不要假定每个 IPv6 地址都由网卡 MAC 推导，也不要把地址变化直接认作另一台设备上线[^privacy]。

地址、前缀、默认网关与 DNS 服务应分别核对。下图只整理配置来源，获得地址之后，主机仍需根据实际选路完成邻居解析或下一跳交付。

```mermaid title="IPv4 与 IPv6 的配置职责" description="独立的 IPv4 和 IPv6 配置路径。实线表示基础请求或路由器发现主路径，虚线表示依赖通告选项或标志的条件触发。DHCPv4 可同时提供地址、前缀、网关和 DNS 参数；IPv6 的 NDP 提供路由器发现和邻居解析，SLAAC 与 DHCPv6 可共同存在，DHCPv6 不通告默认路由。"
flowchart TB
 v4["IPv4 主机"] -->|请求租约| dhcp4["DHCPv4<br/>地址、掩码、网关、DNS"]
 v6["IPv6 主机"] -->|接收或请求 RA| ndp["NDP 路由器发现<br/>默认路由与链路前缀"]
 ndp -.->|前缀允许自主配置（A 标志）| slaac["SLAAC 生成地址<br/>执行适用的 DAD"]
 ndp -.->|含 RDNSS 选项| dns["配置递归 DNS"]
 ndp -.->|M / O 标志线索| dhcp6["DHCPv6<br/>地址或其他参数"]
 v6 -->|依网络和本机策略| dhcp6
 dhcp6 -.->|含 DNS 参数| dns
 class v4,v6 actor
 class ndp state
 class dhcp4,slaac,dhcp6,dns result
```

## 观察本机寻址与邻居表：实验与边界

先查看实际配置，再解释一次业务请求使用了哪个接口。下面的地址与 MAC 仅用于说明字段，请以实际接口配置为准。这些命令观察本机操作系统，抓包还需要接口权限；它们应在本机终端运行，在线 Playground 无法呈现你的邻居表。后面的 `ping` 会向实际网关发送探测，和前面的纯计算示例有不同的运行条件。

### 实验一：查看接口地址、掩码与 MAC

macOS 可先用 `route -n get default` 查看 IPv4 默认路由的接口，再检查对应接口；`en0` 只是常见示例，不能保证是你的出口。Linux 对应使用 `ip route show default` 和 `ip addr show`，直接以 CIDR 形式（如 `192.168.1.10/24`）和 `link/ether` 列出前缀与 MAC。

```bash frame="code"
route -n get default
ifconfig en0
```

在接口输出中对应以下字段：

- `ether`：接口当前的 MAC 地址，可能是系统随机化地址。
- `inet ... netmask 0xffffff00`：IPv4 地址及 `/24` 掩码，可用来计算该直连前缀。
- `inet6 fe80::...%en0`：链路本地 IPv6 地址，`%en0` 标识该地址所在的作用域区，用于区分不同链路上可能重复的地址[^link-local]。

默认路由只是起点。VPN、TUN 或主机路由存在时，实际目标可能使用其他接口。查看完整路由表、针对具体目标查询下一跳，以及解释输出字段的方法，统一见第三篇的[路由查询实验](/posts/networking/routing-forwarding-nat-virtual-interfaces/#实验一查看完整路由表与特定目标的选路结果)。这些查询读取本机选路结果，不证明目标可达。

用[家庭局域网的示例](#家庭局域网的地址怎样分配)对照这些输出。macOS 的 `route -n get default` 会把 `192.168.1.1` 显示为 `gateway`，Linux 的 `ip route show default` 则会显示 `default via 192.168.1.1`。接口上的 `192.168.1.10/24` 对应直连前缀 `192.168.1.0/24`，按前缀可算出广播地址 `192.168.1.255`。

### 实验二：观察 ARP 与 NDP 邻居表

macOS 可用 `-n` 显示数字地址，避免查询主机名干扰观察。Linux 对应 `ip -4 neigh show` 和 `ip -6 neigh show`[^neighbor-tools]：

```bash frame="code"
arp -an
ndp -an
```

在本例经默认网关访问远端目标的配置中，本机解析的是网关 MAC，通常不会为远端地址建立 ARP 条目。是否需要邻居解析取决于实际选出的下一跳与链路类型；不能把“公网地址永远不会出现在 ARP 表里”当作所有配置下的规则。

:::important[邻居表不是在线设备清单]
这些命令显示本机已知的邻居状态。未曾需要解析的设备可能不在表中；离线设备的记录也可能尚未老化。表项是否存在、当前状态（如前面的 `R`/`S`/`I`）和设备是否可达，需要分别判断。
:::

### 实验三：观察一次 ARP 解析

把接口和网关替换为前面查到的值，再针对该链路抓取 ARP 报文。抓包时建议加上 `-n`（禁用地址和端口反向解析，免得输出卡顿）与 `-e`（打印二层以太网头部），否则看不到帧头的目的 MAC；抓包通常需要管理员权限：

```bash frame="code"
sudo tcpdump -i en0 -nn -e arp
```

抓包开始后，在另一终端对实际网关运行一次有限探测，例如 `ping -n -c 1 192.168.1.1`。探测只产生一次通信需求：若已有可用映射，它不保证触发新的 ARP 请求。下面仅是报文格式示意：

```text
00:00:5e:00:53:01 > ff:ff:ff:ff:ff:ff, ethertype ARP (0x0806): Request who-has 192.168.1.1 tell 192.168.1.10
00:00:5e:00:53:02 > 00:00:5e:00:53:01, ethertype ARP (0x0806): Reply 192.168.1.1 is-at 00:00:5e:00:53:02
```

重点观察请求的广播目的 MAC、回复的单播目的 MAC，以及 ARP 内的目标 IP。用 `arp -an` 保存探测前后的表项；若第一次探测触发解析，可趁表项可用时再探测一次，比较是否复用映射。若起初已有可用表项且没有捕获新的请求，可记录为缓存命中；想观察首次解析，可改用已知可达、在同一链路上且本机没有可用映射的测试设备，不必清缓存，也不靠等待触发请求。没有捕获到 ARP 也可能是抓错接口或流量经虚拟接口处理，不能直接解释为“没有发包”。结束后按 Ctrl+C 停止抓包。

### 实验四：对照 NDP 的 IPv6 与 MAC 目的地址

有 IPv6 同链路测试设备时，可用 `ndp -an` 记录表项，再在实际以太网接口抓取 ICMPv6：

```bash frame="code"
sudo tcpdump -i en0 -nn -e icmp6
```

在另一终端用 macOS 的 `ping6 -n -c 1`（现代 Linux 发行版通常使用 `ping -6 -n -c 1`）探测该设备；指定链路本地目标时，在地址后加实际接口名（如 `%en0`）。若捕获到初次地址解析的 NS，分别核对其完整目标地址、IPv6 组播目的地址与以太网组播目的 MAC，再查看对应 NA 和邻居表的新映射。该过滤器也会捕获其他 ICMPv6 流量；例如，源地址为 `::` 的 NS 可能用于 DAD，不是这次探测的普通邻居解析。已有缓存时可能只有探测流量，或出现用于可达性检测的单播 NS[^5][^slaac][^neighbor-tools]。

## 总结

- 地址作用范围决定它适合出现在哪类网络中，实际可达性仍由路由、策略与服务状态决定。
- 常规 IPv4 子网的网络地址和广播地址由前缀决定。默认网关占用一个可用主机地址，DHCP 地址池和 DNS 服务地址由网络配置决定；IPv6 局域网则以 `/64` 为主，没有子网广播地址。
- 掩码比较解释普通直连子网，实际下一跳以路由选择结果为准；ARP/NDP 解析的是选中的同链路邻居，表项还受 NUD 状态约束。
- ARP Probe 与 Announcement 分别负责使用前探测和地址公告，邻居缓存不能代替在线设备发现。
- DHCPv4 首次租约通常经历 DORA，但四条消息并非全部广播；IPv6 的路由发现、地址生成、DAD 与 DNS 参数各有自己的状态和期限。

本篇到本地链路交付为止：主机选出下一跳，再按出接口的链路方式交付。下一篇[《计算机网络（三）：路由转发、NAT 与虚拟网络接口》](/posts/networking/routing-forwarding-nat-virtual-interfaces/)解释多条路由同时匹配时怎样选路，以及网关收到远端包后怎样逐跳转发、何时改写地址。

## 延伸阅读

- [IANA IPv6 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml)——系统查阅 IPv6 特殊地址范围的作用域、可转发性与保留用途
- [RFC 8200: Internet Protocol, Version 6 (IPv6) Specification](https://www.rfc-editor.org/rfc/rfc8200.html)——进一步查阅完整的 IPv6 首部结构、扩展头及协议规范

[^1]: 〔RFC〕[RFC 1918 §3、§5](https://www.rfc-editor.org/rfc/rfc1918.html#section-3)——IPv4 私网范围及公共互联网路由边界；[RFC 4193 §3、§4.1](https://www.rfc-editor.org/rfc/rfc4193.html#section-3)另行定义 IPv6 ULA 的 `fc00::/7` 范围与外部路由过滤要求。

[^cgn]: 〔RFC 与实现〕[RFC 6888 §2](https://www.rfc-editor.org/rfc/rfc6888.html#section-2)与[Cisco: Configure CGNAT IPs](https://www.cisco.com/c/en/us/support/docs/security/umbrella/225267-configure-cgnat-carrier-grade-nat-ips.html)——运营商网络中共享公网 IPv4 的机制，以及 CGN、CGNAT 两种写法。

[^2]: 〔RFC〕[RFC 6598 §4](https://www.rfc-editor.org/rfc/rfc6598.html#section-4)——运营商共享地址空间 `100.64.0.0/10` 及使用限制。

[^3]: 〔RFC〕[RFC 4632 §3.1](https://www.rfc-editor.org/rfc/rfc4632.html#section-3.1)——CIDR 前缀长度表示和地址聚合。

[^subnet]: 〔RFC〕[RFC 950 §2.1、§2.2](https://www.rfc-editor.org/rfc/rfc950.html#section-2.1)——子网掩码与按位与计算网络前缀的基本方法；本文使用 CIDR 前缀记法，不沿用其早期分类地址分配限制。

[^flooding]: 〔平台与实现〕[Cisco：Unicast Flooding in Switched Campus Networks](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6000-series-switches/23563-143.html)——未知单播的含义，以及在所属 VLAN 内除入端口外向其他可转发端口复制帧的行为；[RFC 4541 §1、§2.1.2](https://www.rfc-editor.org/rfc/rfc4541.html#section-1)另行说明组播泛洪与按成员端口转发的区别。

[^delivery]: 〔RFC〕[RFC 1122 §3.2.1.3](https://www.rfc-editor.org/rfc/rfc1122.html#section-3.2.1.3)——IPv4 单播、有限广播与定向广播地址；[RFC 1112 §2、§4](https://www.rfc-editor.org/rfc/rfc1112.html#section-2)——IPv4 组播地址范围；[RFC 4291 §2、§2.7](https://www.rfc-editor.org/rfc/rfc4291.html#section-2)——IPv6 单播与组播地址，以及不使用广播的规定。

[^ipv6-basics]: 〔RFC〕[RFC 4291 §2.2、§2.5、§2.6](https://www.rfc-editor.org/rfc/rfc4291.html#section-2.2)及 [RFC 5952 §4](https://www.rfc-editor.org/rfc/rfc5952.html#section-4)——IPv6 地址的冒号十六进制文本表示、`::` 压缩规范、`/64` 接口标识符与子网路由器任播地址。

[^ipv6-p2p]: 〔RFC〕[RFC 6164 §3、§5](https://www.rfc-editor.org/rfc/rfc6164.html#section-3)——在路由器点对点互联链路上采用 `/127` 前缀的原因及安全性边界。

[^pmtu6]: 〔RFC〕[RFC 8201 §3](https://www.rfc-editor.org/rfc/rfc8201.html#section-3)与 [RFC 4443 §3.2](https://www.rfc-editor.org/rfc/rfc4443.html#section-3.2)——ICMPv6 Packet Too Big 报文与 IPv6 路径 MTU 发现机制。

[^4]: 〔RFC〕[RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.html)——以太网上的 ARP 请求、回复及地址映射更新流程。

[^5]: 〔RFC〕[RFC 4861 §4.3、§7.2.2、§7.2.4、§7.3.2](https://www.rfc-editor.org/rfc/rfc4861.html#section-7.2.2)——NS 的目标字段与组播发送、NA 的应答及链路层地址选项、邻居缓存 NUD 五态模型与单播可达性探测。

[^ndp-multicast]: 〔RFC〕[RFC 4291 §2.7.1](https://www.rfc-editor.org/rfc/rfc4291.html#section-2.7.1)定义 IPv6 被请求节点组播地址；[RFC 2464 §7](https://www.rfc-editor.org/rfc/rfc2464.html#section-7)定义 IPv6 组播到以太网组播 MAC 的映射。

[^6]: 〔RFC〕[RFC 2131 §3.1、§4.1、§4.4.5](https://www.rfc-editor.org/rfc/rfc2131.html#section-3.1)——首次获取租约及使用配置前的最终检查，单播、广播和中继交付条件，以及续租计时与到期行为。

[^dns-config]: 〔RFC〕[RFC 1034 §5.3](https://www.rfc-editor.org/rfc/rfc1034.html#section-5.3)——解析器代表应用查询名字与地址等信息；[RFC 2132 §3.3、§3.5、§3.8](https://www.rfc-editor.org/rfc/rfc2132.html#section-3.3)——DHCP 的子网掩码、路由器与 DNS 服务器选项，DNS 配置地址与网关配置承担不同用途。

[^special]: 〔RFC〕[RFC 6890 §2.2.2](https://www.rfc-editor.org/rfc/rfc6890.html#section-2.2.2)——特殊地址登记属性与 `198.18.0.0/15` 基准测试范围；Fake-IP 是应用对该地址的使用方式，并非这份 RFC 定义的协议。

[^ipv4-special]: 〔登记表与平台文档〕[IANA IPv4 特殊用途地址登记表](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)列出未指定、环回、链路本地与有限广播等 IPv4 地址，[Linux ip(7) 手册](https://man7.org/linux/man-pages/man7/ip.7.html)说明 `INADDR_ANY` 的通配绑定用法。

[^global-v6]: 〔IANA 登记表〕[IPv6 Global Unicast Address Assignments](https://www.iana.org/assignments/ipv6-unicast-address-assignments/ipv6-unicast-address-assignments.xhtml)记录 `2000::/3` 内的分配及保留段。

[^link-local]: 〔RFC〕[RFC 3927 §2.7](https://www.rfc-editor.org/rfc/rfc3927.html#section-2.7)与[RFC 4291 §2.5.6](https://www.rfc-editor.org/rfc/rfc4291.html#section-2.5.6)——IPv4 和 IPv6 链路本地地址的转发限制。[RFC 4007 §11](https://www.rfc-editor.org/rfc/rfc4007.html#section-11)说明 `%` 之后的作用域区标识。

[^documentation-addresses]: 〔RFC〕[RFC 5737 §3](https://www.rfc-editor.org/rfc/rfc5737.html#section-3)与[RFC 3849 §2](https://www.rfc-editor.org/rfc/rfc3849.html#section-2)——IPv4 与 IPv6 的文档示例地址范围。

[^neighbor-tools]: 〔平台与实现〕Apple 发布的 [`arp(8)` 手册](https://github.com/apple-oss-distributions/network_cmds/blob/main/arp.tproj/arp.8)、[`ndp(8)` 手册](https://github.com/apple-oss-distributions/network_cmds/blob/main/ndp.tproj/ndp.8)与[`ping6(8)` 手册](https://github.com/apple-oss-distributions/network_cmds/blob/main/ping6.tproj/ping6.8)；Linux 的地址族选择见 iproute2 [`ip(8)` 手册](https://man7.org/linux/man-pages/man8/ip.8.html)。

[^31]: 〔RFC〕[RFC 3021 §2.1](https://www.rfc-editor.org/rfc/rfc3021.html#section-2.1)——IPv4 `/31` 点对点链路使用两个端点地址的规则。

[^mac]: 〔RFC〕[RFC 9542 §2.1.1、§2.1.4](https://www.rfc-editor.org/rfc/rfc9542.html#section-2.1.4)——MAC 单播/组地址位与 `00:00:5e:00:53:00` 至 `00:00:5e:00:53:ff` 文档专用范围。

[^acd]: 〔RFC〕[RFC 5227 §2.1.1、§2.3、§2.4](https://www.rfc-editor.org/rfc/rfc5227.html#section-2.1.1)——ARP Probe、Announcement 和地址使用期间的冲突检测与防御。

[^slaac]: 〔RFC〕[RFC 4862 §5.4、§5.5.3、§5.5.4](https://www.rfc-editor.org/rfc/rfc4862.html#section-5.4)——SLAAC 候选地址、DAD 及地址首选/有效期限。

[^rdnss]: 〔RFC〕[RFC 8106 §5、§6.1](https://www.rfc-editor.org/rfc/rfc8106.html#section-5)——RA 中的 RDNSS/DNSSL 选项及其独立有效期。

[^ra]: 〔RFC〕[RFC 4861 §4.2、§4.6.2、§6](https://www.rfc-editor.org/rfc/rfc4861.html#section-4.2)——RA 的链路本地源地址、Router Lifetime、M/O 标志、前缀 A/L 标志与路由器发现。

[^dhcpv6]: 〔RFC〕[RFC 9915 §1、§5、§18](https://www.rfc-editor.org/rfc/rfc9915.html#section-1)——DHCPv6 的地址及其他参数配置、消息类型与交互；2026 年 1 月取代 RFC 8415，默认路由发现仍由 NDP 负责。

[^privacy]: 〔RFC〕[RFC 8981 §3、§4](https://www.rfc-editor.org/rfc/rfc8981.html#section-3)——临时地址的生成、更换、生命周期和隐私限制。

[^beej-ip]: 〔编程指南〕[Beej’s Guide to Network Programming §3.2–3.4](https://beej.us/guide/bgnet/html/split/ip-addresses-structs-and-data-munging.html)——字节序转换、`in_addr`、`inet_pton` 与 `inet_ntop`。

import type { Scene } from "./types.ts";

const encapsulation: Scene = {
	title: "分层承载与协议边界",
	section: "封装解封装与数据单元",
	description:
		"HTTPS over TCP、IPv4、以太网。箭头表示下层承载上层字节，不表示一条消息恰好对应一条记录、一个段或一个帧；二层、三层、四层沿用 OSI 层号。",
	caption: "下层负责运输上层字节，不必保留上层的数据单元边界。",
	diagram: `flowchart TB
 http["HTTP<br/>消息或 HTTP/2 帧"]
 tls["TLS<br/>受保护记录"]
 tcp["TCP（四层）<br/>有序字节流与报文段"]
 ip["IP（三层）<br/>最终目的 IP"]
 link["以太网（二层）<br/>本跳目的 MAC"]
 http -->|应用字节| tls
 tls -->|记录编码字节| tcp
 tcp -->|段作为载荷| ip
 ip -->|包作为载荷| link
 class http actor
 class tls,tcp state
 class ip resource
 class link result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["http", "tls"],
			activeEdges: [0],
			durationMs: 5000,
			note: "先看上层边界：HTTP 定义消息，TLS 封装应用字节。一条 HTTP 消息可跨记录，一条记录也可容纳不同消息或帧的字节。",
		},
		{
			boxes: [],
			activeNodes: ["tls", "tcp"],
			activeEdges: [1],
			durationMs: 5000,
			note: "再看最容易混淆的边界：TLS 记录不是 TCP 段。一条记录可跨多个段，一个段也可横跨记录边界；接收端依据 TLS 记录头恢复记录。",
		},
		{
			boxes: [],
			activeNodes: ["tcp", "ip", "link"],
			activeEdges: [2, 3],
			durationMs: 5000,
			note: "TCP 段装进 IP 包，IP 包再装进当前链路的帧。最终目的 IP 与本跳目的 MAC 分工不同；下一场景只聚焦跨越路由器时哪一层改变。",
		},
	],
};

const hops: Scene = {
	title: "跨路由器为什么要换帧",
	section: "端到端与逐跳主机交换机与路由器的分工",
	description:
		"无 NAT、无代理的 IPv4 以太网示例，服务端位于路由器的另一条直连链路。H、G、R、S 是接口 MAC 代号。实线表示交付路径，虚线把帧头信息关联到所在链路；间距不表示耗时。",
	caption: "IP 指向最终目标，MAC 只负责本跳；交换机转帧，路由器拆帧后重新封装。",
	diagram: `flowchart TB
 host["客户端 H"] --> sw["二层交换机"]
 sw --> router["路由器<br/>入口 G / 出口 R"]
 router --> server["服务端 S"]
 lan["本地链路<br/>MAC H → G · TTL 64"] -.-> sw
 remote["出口链路<br/>MAC R → S · TTL 63"] -.-> server
 class host actor
 class sw,router resource
 class lan,remote state
 class server result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["host", "sw", "lan"],
			activeEdges: [0, 1, 3],
			durationMs: 5000,
			note: "客户端封装发给网关 G 的帧。交换机按目的 MAC 转发，既不把 MAC 改成自己的地址，也不递减 IP 的 TTL。",
		},
		{
			boxes: [],
			activeNodes: ["router", "lan", "remote"],
			durationMs: 5000,
			note: "路由器接收旧帧，移除二层头，按目的 IP 选择出口，并把 TTL 从 64 减到 63。此例没有 NAT，源、目的 IP 保持不变。",
		},
		{
			boxes: [],
			activeNodes: ["router", "server", "remote"],
			activeEdges: [2, 4],
			durationMs: 5000,
			note: "路由器为出口重新封装 R → S 的帧。改变的是当前链路的 MAC；目的 IP 仍是同一服务端。回程会独立选路，不保证沿去程原路返回。",
		},
	],
};

export const scene: Scene = {
	...encapsulation,
	legend:
		"紫：协议／帧头状态 · 橙：网络转发 · 绿：链路交付；箭头含义见场景说明。高亮只聚焦当前解释的边界，停留时间不代表耗时。",
	chapters: [encapsulation, hops],
};

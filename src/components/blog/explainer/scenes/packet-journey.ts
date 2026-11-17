import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "先固定一条无 NAT、无代理的路径。应用写入 Socket，内核准备发往 198.51.100.20 的 IP 包；H、G、R、S 分别代表主机、网关入口、路由器出口与服务端的 MAC。",
		active: "host",
		frame: "尚未封装",
		ttl: "64",
	},
	{
		note: "路由查找选中网关。解析网关的 MAC 后，主机封装 H → G 的以太网帧；IP 目的地址仍是远端服务，而不是网关。",
		active: "host",
		frame: "H → G",
		ttl: "64",
	},
	{
		note: "交换机在这个局域网内按目的 MAC 转发。它不把目的 MAC 改成自己的地址，也不递减 IP 的 TTL。",
		active: "switch",
		frame: "H → G",
		ttl: "64",
	},
	{
		note: "路由器接收并去掉旧二层头，查下一跳路由，转发时将 TTL 从 64 减到 63。这里把服务端画在它的另一条直连链路上。",
		active: "router",
		frame: "旧二层头已移除",
		ttl: "63",
	},
	{
		note: "路由器为出口链路重新封装 R → S 的帧。源、目的 IP 保持不变；若经过 NAT，地址或端口会在那个边界另行改写。",
		active: "router",
		frame: "R → S",
		ttl: "63",
	},
	{
		note: "服务端解封装后按传输协议和 Socket 地址分用数据。图中的箭头表示转发顺序；播放停留时间不代表链路耗时。",
		active: "server",
		frame: "S 接收并解封装",
		ttl: "63",
	},
];

export const scene: Scene = {
	title: "逐链路换帧，沿路径转发 IP 包",
	diagramHeight: 296,
	caption: "交换机转发帧，路由器换二层头并递减 TTL。此例没有 NAT 或代理，源、目的 IP 保持不变。",
	description:
		"主机经交换机与一台路由器到达服务端。逐步比较两条链路上的 MAC 和 IP：H 到 G 的帧经过交换机后不变，路由器拆帧、递减 TTL，再封装 R 到 S 的新帧。底部显示当前帧与源、目的 IP，不展开重传、分片或地址转换。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("host", 8, 8, 156, ["主机 H", "192.168.1.10"], step.active === "host"),
			box("switch", 196, 8, 156, ["交换机", "按 MAC 转发"], step.active === "switch"),
			box("server", 8, 88, 156, ["服务端 S", "198.51.100.20"], step.active === "server"),
			box("router", 196, 88, 156, ["路由器 G / R", "两个链路接口"], step.active === "router"),
			box("ethernet", 8, 176, 344, ["以太网帧 · 本跳 MAC", step.frame], true),
			box("ip", 8, 240, 344, [`IP · TTL ${step.ttl}`, "192.168.1.10 → 198.51.100.20"]),
		],
		edges: [
			edge("lan", "M164 32 H190", step.active === "switch"),
			edge("gateway", "M274 56 V82", step.active === "router"),
			edge("delivery", "M196 112 H170", step.active === "server"),
		],
	})),
};

import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "本机是 192.168.1.10/24。先看目标 192.168.1.50：在这张只有直连与默认路由的简化表中，直连 /24 路由优先，下一跳就是目标自身。",
		destination: "192.168.1.50",
		nextHop: "192.168.1.50",
		mac: "尚未查询",
		remote: false,
	},
	{
		note: "若邻居缓存没有可用记录，ARP 广播询问谁拥有 192.168.1.50。得到应答后，以太网帧直接写入目标设备的 MAC；缓存命中时不必再次广播。",
		destination: "192.168.1.50",
		nextHop: "192.168.1.50",
		mac: "目标设备的 MAC",
		remote: false,
	},
	{
		note: "切换到独立的一次发送：目标是 198.51.100.20。它不匹配直连 /24，默认路由把下一跳设为网关 192.168.1.1。真实系统应以路由查找结果为准。",
		destination: "198.51.100.20",
		nextHop: "192.168.1.1",
		mac: "尚未查询",
		remote: true,
	},
	{
		note: "缺少邻居记录时，ARP 问的是网关 192.168.1.1 的 MAC，不会向本地广播域查询远端 198.51.100.20 的 MAC。",
		destination: "198.51.100.20",
		nextHop: "192.168.1.1",
		mac: "网关的 MAC",
		remote: true,
	},
	{
		note: "发给网关的帧承载着发给远端的 IP 包。二层目的与三层目的解决不同范围内的交付问题，不能把网关地址填成 IP 目的地址。",
		destination: "198.51.100.20",
		nextHop: "192.168.1.1",
		mac: "网关的 MAC",
		remote: true,
	},
];

export const scene: Scene = {
	title: "直连目标与网关，ARP 究竟问谁",
	caption:
		"路由先选下一跳，ARP 再解析它的 MAC。跨网段发送时，IP 目的仍是远端，帧目的却是本跳网关。",
	description:
		"对比同一台 192.168.1.10/24 主机的两次独立发送。直连路由把 192.168.1.50 自身作为下一跳；默认路由把远端 198.51.100.20 交给 192.168.1.1。下方始终并列显示 IP 目的与帧目的 MAC。限定 IPv4 以太网及简单路由表，IPv6 使用邻居发现。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("host", 8, 8, 156, ["本机 /24", "192.168.1.10"]),
			box("route", 196, 8, 156, [step.remote ? "默认路由 /0" : "直连路由 /24", "先查路由表"], true),
			box("neighbor", 8, 100, 344, ["下一跳 · ARP 的查询对象", step.nextHop], true),
			box("ip", 8, 188, 156, ["IP 目的", step.destination]),
			box("frame", 196, 188, 156, ["帧目的", step.mac], true),
		],
		edges: [
			edge("lookup", "M164 32 H190", true),
			edge("next-hop", "M274 56 V76 H180 V94", true),
			edge("resolve", "M180 148 V168 H274 V182", true),
		],
	})),
};

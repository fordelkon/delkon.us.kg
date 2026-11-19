import type { Scene } from "./types.ts";

const subnet: Scene = {
	title: "子网边界决定哪种下一跳",
	section: "算清一个-27-子网",
	description:
		"本机 192.168.10.37/27，默认网关 .33；只有直连与默认路由，地址均为 192.168.10.x。两条分支比较不同目标，不是连续发送的两个阶段，也不保证目标 .64 可达。",
	caption: "先固定本机的网络前缀，再判断目标是否匹配直连路由；不能只看 IP 数字是否接近。",
	diagram: `flowchart TB
 local["本机 .37/27<br/>37 AND 224 = 32"]
 local --> range["本机网络 .32/27<br/>地址范围 .32…63"]
 range -->|目标 .62 在范围内| direct["直连路由<br/>下一跳是目标 .62"]
 range -->|目标 .64 在范围外| gateway["默认路由<br/>下一跳是网关 .33"]
 class local actor
 class range state
 class direct result
 class gateway resource`,
	frames: [
		{
			boxes: [],
			activeNodes: ["local", "range"],
			activeEdges: [0],
			note: "/27 固定 27 个网络位，剩 5 个主机位，共 32 个地址。子网从 .32 开始，不是从本机 .37 开始数；常规主机范围是 .33 至 .62。",
		},
		{
			boxes: [],
			activeNodes: ["range", "direct"],
			activeEdges: [1],
			note: "只看目标 .62：它匹配本机直连前缀，下一跳就是目标自身。后续要取得目标 MAC，才能在以太网上直接交付。",
		},
		{
			boxes: [],
			activeNodes: ["range", "gateway"],
			activeEdges: [2],
			note: "换成目标 .64：它进入下一个 /27，本例交给默认网关 .33。这里说明选路，不代表 .64 是可用主机地址；它在下一个 /27 中是网络地址。",
		},
	],
};

const neighbor: Scene = {
	title: "最终目标 IP 与下一跳 MAC",
	section: "ipv4-的地址解析arp",
	description:
		"独立的跨网段 IPv4 单播示例：目标 198.51.100.20，下一跳网关 192.168.1.1；普通以太网，无代理 ARP。实线是数据交付，虚线是缓存查询或 ARP 解析的控制路径，两条缓存分支不会先后全部执行。",
	caption: "ARP 找到的是本跳网关 MAC；最终目的 IP 留在原 IP 包里。",
	diagram: `flowchart TB
 ip["IP 包的最终目标<br/>198.51.100.20"]
 next["路由选出网关<br/>下一跳 192.168.1.1"]
 arp["缓存未命中：ARP 请求 / 回复<br/>只解析网关 .1 的 MAC"]
 frame["发送数据帧<br/>目的 MAC = 网关 MAC<br/>目的 IP = 198.51.100.20"]
 ip --> next
 next -->|已有映射，直接成帧| frame
 next -.->|没有映射| arp
 arp -.->|取得映射后成帧| frame
 class ip actor
 class next resource
 class arp state
 class frame result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["ip", "next"],
			activeEdges: [0],
			note: "先按最终目的 IP 查路由，结果选出本链路上的网关。下一跳不同于最终目标，这正是三层选路与二层交付的衔接点。",
		},
		{
			boxes: [],
			activeNodes: ["next", "frame"],
			activeEdges: [1],
			note: "若邻居缓存已有可用网关映射，就直接成帧，不必每次广播 ARP。主机邻居表保存 IP 到 MAC，交换机 MAC 表保存 MAC 到端口。",
		},
		{
			boxes: [],
			activeNodes: ["next", "arp"],
			activeEdges: [2],
			note: "若没有映射，ARP 用二层广播 MAC ff:ff:ff:ff:ff:ff 询问网关，收到通常为单播的回复后更新缓存。ARP 自身不封装在 IPv4 包里。",
		},
		{
			boxes: [],
			activeNodes: ["arp", "frame"],
			activeEdges: [3],
			note: "最终发出的帧以网关 MAC 为目的，里面的 IP 包仍发给远端。交换机按帧的目的 MAC 交付；这次 ARP 广播不会跨路由器寻找远端 MAC。",
		},
	],
};

export const scene: Scene = {
	...subnet,
	legend:
		"紫：前缀／邻居解析状态 · 橙：下一跳 · 绿：交付结果；高亮箭头聚焦当前解释的关系，分支代表不同条件。",
	chapters: [subnet, neighbor],
};

import { chain, logicalFlow, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const cases: [string, string, string, string, string][] = [
	[
		"192.168.1.50",
		"直连 /24 → 192.168.1.50",
		"先查缓存",
		"未开始 ARP",
		"本机 192.168.1.10/24 查询路由表，目标 192.168.1.50 匹配直连 /24；它比默认 /0 更具体。下一跳是目标自身，然后才查看邻居缓存。",
	],
	[
		"192.168.1.50",
		"下一跳 192.168.1.50",
		"ARP Request · 广播",
		"Dst MAC = ff:ff:ff:ff:ff:ff",
		"缓存未命中，ARP Request 广播询问谁拥有下一跳地址。广播停留在当前广播域，不穿越路由器去寻找远端 MAC。",
	],
	[
		"192.168.1.50",
		"下一跳 192.168.1.50",
		"ARP Reply · 通常单播",
		"保存 IP → MAC 邻居记录",
		"拥有该 IPv4 地址的邻居通常单播回复请求者，主机据此更新邻居表。这一步独立于后续数据帧的发送。",
	],
	[
		"192.168.1.50",
		"下一跳 192.168.1.50",
		"缓存命中 → 直接成帧",
		"不再发送本次 ARP Request",
		"再一次发送时，若邻居缓存可用，就直接使用 MAC。缓存状态、过期与可达性维护影响是否重新解析，不能期待每次访问都有 ARP 广播。",
	],
	[
		"198.51.100.20",
		"默认 /0 → 192.168.1.1",
		"解析网关 MAC",
		"Request 广播 → Reply 通常单播",
		"切换到跨网段发送：目标不匹配直连 /24，默认路由选网关。若缓存未命中，ARP 查询 192.168.1.1，而不是远端 IP。",
	],
	[
		"198.51.100.20",
		"下一跳 192.168.1.1",
		"Dst MAC = 网关 MAC",
		"Dst IP = 198.51.100.20",
		"发给网关的帧承载发给远端的 IP 包。二层目的与三层目的并不相同：路由先决定下一跳，邻居解析只负责本地链路交付。",
	],
];

const ipv4: Scene = {
	title: "路由表与 ARP",
	diagramHeight: 312,
	description:
		"本图假设：IPv4 以太网，本机 192.168.1.10/24，只有直连 /24 与默认 /0 两条路由。各帧对比同网段、跨网段与缓存命中。",
	caption: "目标 IP → 路由匹配 → 下一跳 → 邻居缓存／ARP → 成帧；ARP 广播不会跨过路由器。",
	frames: cases.map(([destination, next, action, state, note], index) => ({
		note: note,
		boxes: [
			node("destination", 8, 8, 344, ["目标 IP", destination], "client", true),
			node(
				"on-link",
				8,
				72,
				344,
				["192.168.1.0/24 → On-link", index < 4 ? next : "未选中"],
				"processing",
				index < 4,
			),
			node(
				"default",
				8,
				136,
				344,
				["0.0.0.0/0 → 192.168.1.1", index >= 4 ? next : "未选中"],
				"processing",
				index >= 4,
			),
			node("arp", 8, 200, 344, [action, state], "delivery", true),
			node("boundary", 8, 264, 344, ["本地广播域边界", "路由器不转发此 ARP 广播"], "processing"),
		],
		edges: [
			edge("lookup", "M180 56 V66", true),
			edge("route-neighbor", index < 4 ? "M352 96 H358 V224 H352" : "M180 184 V194", true),
		],
	})),
};

const ipv6: Scene = {
	title: "IPv6 自动配置与 NDP",
	diagramHeight: 312,
	description:
		"本图假设：支持 SLAAC 的 IPv6 以太网，RA 提供适用前缀。邻居解析演示缓存未命中情形；RA、DAD、NS/NA 均属于 ICMPv6 相关流程，IPv6 不使用 ARP 广播。",
	caption: "RA 提供路由器与前缀信息；SLAAC 生成地址，NDP 还承担地址检查、邻居解析和可达性维护。",
	frames: [
		chain(
			[
				["Router Advertisement", "路由器 → 主机：前缀与路由信息"],
				["SLAAC", "按适用前缀生成地址并执行 DAD"],
				["默认路由", "通过有效的 RA 学习路由器"],
				["DHCPv6（可选）", "地址或其他配置；不替代 RA 默认路由"],
				["隐私地址", "临时地址可轮换，策略依实现"],
			],
			0,
			"主机可发送 RS 请求 RA，也可收到周期性 RA。RA 的前缀、标志和路由器生存期有不同职责；SLAAC 地址还需检查重复，不能把收到前缀当成地址已可用。",
			["processing", "client", "processing", "processing", "client"],
			false,
		),
		chain(
			[
				["目标 IPv6 地址", "先查询路由与下一跳"],
				["邻居缓存未命中", "解析本链路下一跳的链路层地址"],
				["Neighbor Solicitation", "通常发往 solicited-node 组播"],
				["Neighbor Advertisement", "正常解析应答通常单播返回"],
				["链路层交付", "保存映射并发送 IPv6 包"],
			],
			2,
			"普通地址解析中 NS 通常发往被请求节点组播地址，NA 通常单播回复；DAD、主动通告和邻居可达性探测的地址与标志规则不同。NDP 不只是换名的 ARP。",
			["client", "processing", "processing", "delivery", "delivery"],
		),
		chain(
			[
				["路由选下一跳", "IPv4 与 IPv6 都先确定交付对象"],
				["IPv4", "ARP Request / Reply → MAC"],
				["IPv6", "ICMPv6 NS / NA → 链路层地址"],
				["缓存命中", "两者均可能省去本次解析"],
				["职责差异", "NDP 还含路由器发现、DAD、NUD"],
			],
			4,
			"对照的是邻居解析职责，图中的 IPv4 与 IPv6 行不是串行操作。NDP 还支持路由器发现、重复地址检测与邻居不可达检测，DHCPv6 则解决另一些配置问题。",
			["client", "processing", "processing", "delivery", "delivery"],
			false,
		),
	],
};

export const scene: Scene = { ...ipv4, chapters: [logicalFlow(ipv4), logicalFlow(ipv6)] };

const sections = ["ipv4-的地址解析arp", "ipv6-的-raslaac-与-dns-参数"];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

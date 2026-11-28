import { label, mark } from "./examples.ts";
import type { Frame, Scene } from "./types.ts";

function lookup(hostRoute: boolean): Frame {
	return {
		note: hostRoute
			? "三个前缀都匹配 .99。/32 最具体，下一跳是指定网关 192.168.1.254。"
			: "只撤去 /32，同一目的地址仍匹配 /24 和 /0。/24 更具体，主机直接向 .99 交付。",
		boxes: [
			label("target", 180, 14, "目的 IP　192.168.1.99", 340),
			mark("default", 8, 36, 344, 148, "", "cell"),
			label("default-label", 180, 55, "/0　默认网关", 310),
			mark("lan", 26, 77, 308, 94, "", "cell", !hostRoute),
			label("lan-label", 180, 96, "192.168.1.0/24　直连", 290),
			hostRoute
				? mark("host", 46, 119, 268, 38, "192.168.1.99/32　经网关", "cell", true)
				: label("host-removed", 180, 138, "已撤去 /32 条目", 260),
		],
	};
}

export const scene: Scene = {
	title: "目的地址相同，为什么下一跳会变",
	diagramHeight: 192,
	caption:
		"同一张 IPv4 路由表里，嵌套的框表示包含同一目的地址的前缀。最内层仍有效的条目决定这一跳。",
	description:
		"192.168.1.99 同时落在 /0 默认路由、192.168.1.0/24 直连路由和 192.168.1.99/32 主机路由内。有 /32 时经 192.168.1.254 转发，撤去 /32 后选中 /24，直接交付。",
	frames: [lookup(true), lookup(false)],
};

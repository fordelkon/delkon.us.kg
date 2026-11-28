import { label, mark } from "./examples.ts";
import type { Scene } from "./types.ts";

function ethernetFrame(id: string, y: number, destination: string, ttl: number) {
	return [
		mark(`${id}-frame`, 8, y, 344, 84, "", "cell"),
		label(`${id}-mac`, 180, y + 18, destination, 330),
		mark(`${id}-ip`, 24, y + 36, 312, 36, `IPv4　A 到 B　·　TTL ${ttl}`, "cell", true),
	];
}

export const scene: Scene = {
	title: "经过路由器前后的同一个 IP 包",
	diagramHeight: 236,
	caption: "帧只走一跳。路由器转发时换上下一段链路的帧头。这里没有 NAT，包里的目的 IP 始终指向 B。",
	description:
		"主机 A 经路由器 R 向 B 发送一个 IPv4 包，两段都是以太网，无 NAT 或分片。第一帧的目的 MAC 属于 R 的入口，第二帧的目的 MAC 属于 B。两个帧内都是 A 到 B 的 IP 包，TTL 从 64 减到 63。",
	frames: [
		{
			note: "以太网两跳，无 NAT 或分片。粗框内是每一跳承载的 IPv4 包。",
			boxes: [
				label("incoming", 180, 12, "A 发出的帧", 300),
				...ethernetFrame("first", 26, "目的 MAC：路由器 R 的入口", 64),
				label("outgoing", 180, 130, "R 转发给 B 的帧", 300),
				...ethernetFrame("second", 144, "目的 MAC：主机 B 的接口", 63),
			],
		},
	],
};

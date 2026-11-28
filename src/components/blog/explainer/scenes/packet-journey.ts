import { controlEdge, node } from "./diagram-layout.ts";
import { label, mark } from "./examples.ts";
import { type Box, edge, type Frame, type Scene } from "./types.ts";

function slice(
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	text: string,
	tone: NonNullable<Box["tone"]>,
	active = false,
	muted = false,
): Box {
	return { ...mark(id, x, y, width, height, text, "cell", active), tone, muted };
}

const byteTicks: Box[] = [
	label("t0", 20, 34, "0", 24),
	label("t6", 140, 34, "6", 24),
	label("t10", 220, 34, "10", 24),
	label("t12", 260, 34, "12", 24),
	label("t16", 340, 34, "16", 24),
];

const frames: Frame[] = [
	{
		note: "上层 HTTP/TLS 先把连续 16 字节切为两条独立记录：记录 A 占 0..9（10 字节），记录 B 占 10..15（6 字节）。",
		boxes: [
			label("title", 180, 14, "同一段 16 字节：TLS 按记录划分", 340),
			...byteTicks,
			slice("tls-a", 20, 48, 200, 40, "TLS 记录 A (10B)", "client", true),
			slice("tls-b", 220, 48, 120, 40, "记录 B (6B)", "client", true),
			slice("tcp-raw", 20, 108, 320, 40, "下层 TCP 尚未分段（连续字节流）", "secure", false, true),
			node(
				"summary",
				8,
				174,
				344,
				["记录边界由 TLS 记录头定义", "TCP 只接收编码后的字节，不解释记录格式"],
				"client",
				true,
			),
		],
	},
	{
		note: "TCP 按分段预算把同一批 16 字节切成 3 个段：段 2（6..11）同时装着记录 A 末尾与记录 B 开头，TLS 边界落在段载荷内部。",
		boxes: [
			label("title", 180, 14, "同一段 16 字节：TCP 按段切分载荷", 340),
			...byteTicks,
			slice("tls-a", 20, 48, 200, 40, "TLS 记录 A (10B)", "client"),
			slice("tls-b", 220, 48, 120, 40, "记录 B (6B)", "client"),
			slice("tcp-1", 20, 108, 120, 40, "TCP 段 1 (6B)", "secure"),
			slice("tcp-2", 140, 108, 120, 40, "TCP 段 2 (6B)", "secure", true),
			slice("tcp-3", 260, 108, 80, 40, "段3·4B", "secure"),
			node(
				"summary",
				8,
				174,
				344,
				["记录边界 ≠ 报文段边界", "接收端先靠 TCP 补齐字节，再由 TLS 按头恢复"],
				"secure",
				true,
			),
		],
		edges: [controlEdge("cross", "M220 46 V150", true)],
	},
	{
		note: "段 2 装入端到端 IPv4（H → S）并加上本跳 MAC 帧头。经过路由器时只拆换外层 MAC 并减 TTL，目的 IP 保持不变。",
		boxes: [
			label("title", 180, 14, "IPv4 端到端不变，外层 MAC 逐跳重封", 344),
			slice("hop1-frame", 8, 38, 344, 48, "", "delivery"),
			slice("hop1-mac", 12, 44, 96, 36, "MAC H→G", "delivery", true),
			slice("hop1-ip", 112, 44, 132, 36, "IP H→S TTL64", "processing"),
			slice("hop1-tcp", 248, 44, 100, 36, "TCP 段 2", "secure"),
			label("hop-lbl", 262, 100, "路由器换帧 · TTL-1", 156),
			slice("hop2-frame", 8, 114, 344, 48, "", "delivery"),
			slice("hop2-mac", 12, 120, 96, 36, "MAC R→S", "delivery", true),
			slice("hop2-ip", 112, 120, 132, 36, "IP H→S TTL63", "processing", true),
			slice("hop2-tcp", 248, 120, 100, 36, "TCP 段 2", "secure"),
			node(
				"summary",
				8,
				176,
				344,
				["端到端 IP 与逐跳 MAC 各司其职", "交换机按 MAC 转发；路由器拆旧帧并重封出接口帧"],
				"processing",
				true,
			),
		],
		edges: [edge("hop", "M180 88 V110", true)],
	},
];

export const scene: Scene = {
	title: "跨层独立字节边界与逐跳成帧",
	section: "封装解封装与数据单元",
	legend: "蓝：TLS 记录 · 紫：TCP 段 · 橙：IPv4 端到端 · 绿：当前跳 MAC；横宽按字节比例划分。",
	caption: "上层记录边界与下层分段边界彼此独立；经过路由器时只更换本跳外层 MAC，IP 指向最终目标。",
	description:
		"用同一段 16 字节说明跨层边界独立性：TLS 将其切为 10B 与 6B 两条记录，而 TCP 切成 6B、6B、4B 三个段，TLS 边界落在段 2 内部；随后展示段 2 装入 IPv4 与 MAC 帧后经过路由器时外层 MAC 逐跳更换、TTL 递减而最终目的 IP 不变。",
	frames,
};

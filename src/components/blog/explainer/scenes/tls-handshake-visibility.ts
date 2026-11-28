import { node } from "./diagram-layout.ts";
import { label, mark } from "./examples.ts";
import { type Box, edge, type Frame, type Scene } from "./types.ts";

function cell(
	id: string,
	x: number,
	y: number,
	width: number,
	text: string,
	tone: NonNullable<Box["tone"]>,
	active = false,
	muted = false,
): Box {
	return { ...mark(id, x, y, width, 40, text, "cell", active), tone, muted };
}

const frames: Frame[] = [
	{
		note: "HTTP/2 在传输层仍是一条 TCP 有序字节流：流 A 与流 B 的帧交错复用，字节全部齐备时都可按序交付。",
		boxes: [
			label("mode", 180, 14, "HTTP/2 over TCP：单条有序字节流", 344),
			node("src-a", 8, 38, 164, ["HTTP/2 流 A", "帧 A1、A2"], "client", true),
			node("src-b", 188, 38, 164, ["HTTP/2 流 B", "帧 B1、B2"], "secure", true),
			cell("tcp-lbl", 8, 108, 92, "TCP 队列", "state"),
			cell("s0", 108, 108, 58, "A1", "delivery", true),
			cell("s1", 170, 108, 58, "B1", "delivery", true),
			cell("s2", 232, 108, 58, "A2", "delivery", true),
			cell("s3", 294, 108, 58, "B2", "delivery", true),
			node(
				"summary",
				8,
				174,
				344,
				["无丢包时多路复用正常推进", "但所有流共享同一个 TCP 序号空间"],
				"delivery",
				true,
			),
		],
		edges: [edge("in-a", "M90 86 V104", true), edge("in-b", "M270 86 V104", true)],
	},
	{
		note: "一旦承载 A1 的 TCP 字节丢失，缺口后的 B1、A2、B2 即使已经抵达，也必须全部停在 Recv-Q 等待补齐。",
		boxes: [
			label("mode", 180, 14, "HTTP/2 队头阻塞：A1 丢失卡住整条连接", 344),
			node("src-a", 8, 38, 164, ["HTTP/2 流 A", "A1 字节丢失"], "processing", true),
			node("src-b", 188, 38, 164, ["HTTP/2 流 B", "B1、B2 已到达"], "secure"),
			cell("tcp-lbl", 8, 108, 92, "TCP 队列", "state"),
			cell("s0", 108, 108, 58, "缺 A1", "processing", true),
			cell("s1", 170, 108, 58, "B1 停", "state", false, true),
			cell("s2", 232, 108, 58, "A2 停", "state", false, true),
			cell("s3", 294, 108, 58, "B2 停", "state", false, true),
			node(
				"summary",
				8,
				174,
				344,
				["TCP 跨流队头阻塞 (HOL Blocking)", "A1 缺口补齐前，完整到达的流 B 也无法交付"],
				"processing",
				true,
			),
		],
		edges: [edge("in-b", "M270 86 V104")],
	},
	{
		note: "HTTP/3 改走 QUIC 独立流偏移：A1 丢失只让流 A 的 A2 等待，流 B 的 B1、B2 可立即向上交付（仍共享拥塞控制与 QPACK 依赖）。",
		boxes: [
			label("mode", 180, 14, "HTTP/3 over QUIC：按流独立交付", 344),
			cell("qa-lbl", 8, 42, 92, "QUIC 流 A", "processing", true),
			cell("qa-0", 108, 42, 76, "缺 A1", "processing", true),
			cell("qa-1", 190, 42, 76, "A2 等", "state", false, true),
			label("qa-st", 313, 62, "A 等待", 78),
			cell("qb-lbl", 8, 104, 92, "QUIC 流 B", "delivery", true),
			cell("qb-0", 108, 104, 76, "B1 齐", "delivery", true),
			cell("qb-1", 190, 104, 76, "B2 齐", "delivery", true),
			label("qb-st", 313, 124, "B 交付", 78),
			node(
				"summary",
				8,
				174,
				344,
				["QUIC 按流分别维护有序偏移", "消除了 TCP 字节流引发的跨流阻塞，流 B 立即交付"],
				"delivery",
				true,
			),
		],
		edges: [edge("deliver-b", "M266 124 H284", true)],
	},
];

export const scene: Scene = {
	title: "HTTP/2 单流阻塞 vs HTTP/3 独立流交付",
	section: "http11-到-http3-的连接与复用",
	legend: "蓝：流 A · 紫：队列与等待 · 橙：缺口阻塞 · 绿：可交付数据。",
	caption: "关键区别在于传输层按序交付的范围：整条 TCP 字节流，或各条独立的 QUIC 流。",
	description:
		"用水平帧轨道对照 HTTP/2 与 HTTP/3 的队头阻塞差异：在 HTTP/2 下，流 A 的 A1 丢失会令同一 TCP Recv-Q 中的流 B 帧一起冻结；在 HTTP/3 下，QUIC 为每条流维护独立偏移，流 A 等待的同时流 B 可立即交付。",
	frames,
};

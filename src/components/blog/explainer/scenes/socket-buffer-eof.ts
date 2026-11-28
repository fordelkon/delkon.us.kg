import { controlEdge, node } from "./diagram-layout.ts";
import { label, mark } from "./examples.ts";
import { type Box, edge, type Frame, type Scene } from "./types.ts";

function queueRow(
	id: string,
	y: number,
	values: string[],
	toneFor: (value: string, index: number) => NonNullable<Box["tone"]>,
	activeFor: (value: string, index: number) => boolean,
): Box[] {
	return values.map((value, index) => ({
		...mark(`${id}-${index}`, 84 + index * 36, y, 36, 34, value, "cell", activeFor(value, index)),
		tone: toneFor(value, index),
		muted: value === "·",
	}));
}

const frames: Frame[] = [
	{
		note: '应用先后调用 write("ABC") 与 write("DEF")，两组字节直接并入 Send-Q 形成连续流；TCP 不保留两次 write 之间的分界。',
		boxes: [
			node("app-tx", 8, 8, 164, ["发送应用", "write ABC 后 write DEF"], "client", true),
			node("app-rx", 188, 8, 164, ["接收应用", "尚未调用 read"], "delivery"),
			label("send-q-lbl", 42, 87, "Send-Q", 68),
			...queueRow(
				"send",
				70,
				["A", "B", "C", "D", "E", "F", "·"],
				() => "client",
				(value) => value !== "·",
			),
			label("recv-q-lbl", 42, 147, "Recv-Q", 68),
			...queueRow(
				"recv",
				130,
				["·", "·", "·", "·", "·", "·", "·"],
				() => "delivery",
				() => false,
			),
			node(
				"boundary",
				8,
				180,
				344,
				["写入边界已消失", "write 成功只代表本机 Send-Q 接纳，不代表对端收到"],
				"state",
				true,
			),
		],
		edges: [edge("write", "M90 56 V68", true)],
	},
	{
		note: "TCP 将连续字节送达对端 Recv-Q 并回复累计确认 ACK 106。此时接收应用还没 read，说明内核 ACK 不等于应用已消费。",
		boxes: [
			node("app-tx", 8, 8, 164, ["发送应用", "收到内核 ACK 106"], "client"),
			node("app-rx", 188, 8, 164, ["接收应用", "仍未调用 read"], "delivery"),
			label("send-q-lbl", 42, 87, "Send-Q", 68),
			...queueRow(
				"send",
				70,
				["·", "·", "·", "·", "·", "·", "·"],
				() => "client",
				() => false,
			),
			label("recv-q-lbl", 42, 147, "Recv-Q", 68),
			...queueRow(
				"recv",
				130,
				["A", "B", "C", "D", "E", "F", "·"],
				() => "secure",
				(value) => value !== "·",
			),
			label("wire-lbl", 268, 117, "TCP 交付 · ACK 106", 148),
			node(
				"boundary",
				8,
				180,
				344,
				["内核 ACK ≠ 应用已读取", "一次 read 可读走 ABCDE，也可能只读出部分字节"],
				"processing",
				true,
			),
		],
		edges: [edge("deliver", "M138 106 V128", true), controlEdge("ack", "M174 128 V106", true)],
	},
	{
		note: "接收应用先读走 ABCDE，剩余 F 留在 Recv-Q；同时发送端调用 shutdown(WR)，将有序结束标记 FIN 排在待发队列末尾。",
		boxes: [
			node("app-tx", 8, 8, 164, ["发送应用", "调 shutdown(WR)"], "client", true),
			node("app-rx", 188, 8, 164, ["接收应用", "read 读走 ABCDE"], "delivery", true),
			label("send-q-lbl", 42, 87, "Send-Q", 68),
			...queueRow(
				"send",
				70,
				["·", "·", "·", "·", "·", "·", "FIN"],
				() => "processing",
				(value) => value === "FIN",
			),
			label("recv-q-lbl", 42, 147, "Recv-Q", 68),
			...queueRow(
				"recv",
				130,
				["·", "·", "·", "·", "·", "F", "FIN"],
				(value) => (value === "FIN" ? "processing" : "delivery"),
				(value) => value !== "·",
			),
			label("wire-lbl", 184, 117, "FIN 排在字节后", 140),
			node(
				"boundary",
				8,
				180,
				344,
				["半关闭写方向 · 反向仍可读", "FIN 按序号排在最后，不会越过前面的 F"],
				"state",
				true,
			),
		],
		edges: [
			edge("fin-wire", "M318 106 V128", true),
			edge("read-part", "M338 147 Q356 102 340 58", true),
		],
	},
	{
		note: "接收应用在循环中先读出最后一个字节 F，下一次 read 才遇到末尾的 FIN 并返回 0（EOF），确认这个方向的字节流已经结束。",
		boxes: [
			node("app-tx", 8, 8, 164, ["发送应用", "写方向已关闭"], "client"),
			node("app-rx", 188, 8, 164, ["接收应用", "读 F → 再读得 0 (EOF)"], "delivery", true),
			label("send-q-lbl", 42, 87, "Send-Q", 68),
			...queueRow(
				"send",
				70,
				["·", "·", "·", "·", "·", "·", "·"],
				() => "client",
				() => false,
			),
			label("recv-q-lbl", 42, 147, "Recv-Q", 68),
			...queueRow(
				"recv",
				130,
				["·", "·", "·", "·", "·", "·", "EOF"],
				() => "delivery",
				(value) => value === "EOF",
			),
			node(
				"boundary",
				8,
				180,
				344,
				["读尽全部字节才触发 EOF", "recv 返回 0 仅结束本方向，服务端仍可写回响应"],
				"delivery",
				true,
			),
		],
		edges: [edge("read-eof", "M338 147 Q356 102 340 58", true)],
	},
];

export const scene: Scene = {
	title: "字节流并轨、Send-Q / Recv-Q 与 FIN 尾部语义",
	section: "socket-接口与内核缓冲区契约",
	legend: "蓝：发送方／Send-Q · 紫：内核缓冲状态 · 橙：确认与 FIN 边界 · 绿：接收方与 EOF。",
	caption:
		"TCP 保留字节顺序，不保留 write 边界；内核 ACK 不等于应用已读，FIN 排在数据之后触发 EOF。",
	description:
		'在同一条 TCP 连接上追踪 write("ABC") 与 write("DEF") 如何合并进 Send-Q、经 TCP 交付并由内核 ACK 后留在 Recv-Q，以及 shutdown(WR) 把 FIN 排在末尾，使接收方按序读完 F 才收到 EOF (0)。',
	frames,
};

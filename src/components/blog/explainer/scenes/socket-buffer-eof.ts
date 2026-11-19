import { withRoles } from "./diagram-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "客户端 write_all 成功，表示全部字节已被本机接收进发送路径。它不承诺对端应用已经收到，更不承诺一次 read 对应一次 write。",
		client: "write_all 成功",
		clientBuffer: "first + second",
		serverBuffer: "尚未交付",
		server: "等待 read",
		phase: "进入本机发送路径",
	},
	{
		note: "TCP 发送并由对端内核确认。未确认的在途数据受拥塞窗口 cwnd 和接收窗口 rwnd 共同约束；ACK 仍不表示服务端应用已经处理。",
		client: "仍可读写",
		clientBuffer: "发送 / 等待 ACK",
		serverBuffer: "first + second",
		server: "尚未消费字节",
		phase: "在途上限 ≈ min(cwnd, rwnd)",
	},
	{
		note: "客户端 shutdown(Write) 后不再写入，仍可读取响应。FIN 排在此前排队的字节之后有序发送；服务端读完这些字节后才会读到 EOF。",
		client: "只关闭写方向",
		clientBuffer: "先前字节 → FIN",
		serverBuffer: "数据先于 EOF",
		server: "循环读取",
		phase: "半关闭 · 反方向仍然开放",
	},
	{
		note: "服务端用循环拼接字节，直到 read 返回 0。这个 EOF 只结束客户端到服务端的字节流；下方切换到反方向队列，服务端仍可发送响应。",
		client: "读取响应",
		clientBuffer: "等待读取响应",
		serverBuffer: "写入响应字节",
		server: "write_all 响应",
		phase: "EOF 不会关闭反方向",
	},
	{
		note: "本例服务端读到 EOF、写完响应后才关闭自己的写方向。客户端读完响应再收到 EOF；双方的发送方向都结束后，连接才能完成关闭。",
		client: "响应读完 → EOF",
		clientBuffer: "响应 → EOF",
		serverBuffer: "响应 → FIN",
		server: "关闭写方向",
		phase: "两个方向分别结束",
	},
	{
		note: "在这里固定的正常关闭顺序中，客户端先主动关闭，收到服务端 FIN 并发出最终 ACK 后进入 TIME_WAIT，通常保留 2MSL。换一种关闭顺序，承担该状态的一端也可能改变。",
		client: "TIME_WAIT",
		clientBuffer: "响应已读完",
		serverBuffer: "发送方向已关闭",
		server: "完成关闭",
		phase: "本例客户端保留关闭状态 · 2MSL",
	},
];

const closing: Scene = {
	title: "半关闭与 EOF",
	caption:
		"写成功、内核 ACK、应用读完是三个时点。shutdown(Write) 只关闭一个方向，EOF 出现在此前字节之后。",
	description:
		"上方是客户端和服务端应用，下方先显示客户端发送与服务端接收队列，第四帧起切换为反方向队列。依次展示写入、内核接收、客户端半关闭、服务端读到 EOF 后回复、服务端半关闭，以及此关闭顺序下客户端的 TIME_WAIT。框内是逻辑阶段，不模拟分段、缓冲占用或真实耗时，FIN 表示有序关闭标记。",
	frames: steps.map((step, index) => ({
		note: step.note,
		boxes: [
			box("client", 8, 8, 156, ["客户端应用", step.client], true),
			box("server", 196, 8, 156, ["服务端应用", step.server], index >= 3),
			box(
				"client-buffer",
				8,
				100,
				156,
				[index < 3 ? "客户端 Send-Q" : "客户端 Recv-Q", step.clientBuffer],
				true,
			),
			box(
				"server-buffer",
				196,
				100,
				156,
				[index < 3 ? "服务端 Recv-Q" : "服务端 Send-Q", step.serverBuffer],
				index > 0,
			),
			box("phase", 8, 188, 344, ["交付与关闭边界", step.phase]),
		],
		edges: [
			edge("client-buffer", index < 3 ? "M86 56 V94" : "M86 100 V62", index !== 1),
			edge("transport", index < 3 ? "M164 124 H190" : "M196 124 H170", index > 0 && index < 5),
			edge("server-buffer", index < 3 ? "M274 100 V62" : "M274 56 V94", index > 1 && index < 5),
		],
	})),
};

const stream: Scene = {
	title: "写入、读取与确认的边界",
	section: "socket-接口与内核缓冲区契约",
	description:
		"同一条 TCP 连接依次写 ABC、DEF，接收端最终按序得到六个字节，首字节序号为 100。箭头表示字节归属或确认条件；两次 read 仅是一种合法切分，不承诺分段与读取次数。",
	caption: "TCP 保留字节顺序，不保留 write 边界；内核确认也不等于应用已读取或处理。",
	diagram: `flowchart TB
 w1["write：ABC"]
 w2["write：DEF"]
 bytes["接收端按序字节<br/>A B C D E F"]
 r1["一次 read：ABCDE"]
 r2["后续 read：F"]
 ack["可累计确认 ACK 106<br/>应用可能尚未读取"]
 w1 --> bytes
 w2 --> bytes
 bytes --> r1
 bytes --> r2
 bytes -.-> ack
 class w1,w2 actor
 class bytes state
 class r1,r2 result
 class ack resource`,
	frames: [
		{
			boxes: [],
			activeNodes: ["w1", "w2", "bytes"],
			activeEdges: [0, 1],
			durationMs: 5000,
			note: "两次写入形成连续六字节。TCP 传输与重组这些字节，不为应用保留 ABC 与 DEF 之间的写入分界。",
		},
		{
			boxes: [],
			activeNodes: ["bytes", "r1", "r2"],
			activeEdges: [2, 3],
			durationMs: 5000,
			note: "接收应用可能读到 ABCDE，再读到 F，也可能有其他切分。应用协议需要长度字段、分隔符等格式识别消息。",
		},
		{
			boxes: [],
			activeNodes: ["bytes", "ack"],
			activeEdges: [4],
			durationMs: 5000,
			note: "首字节序号为 100，连续六字节已收到时可累计确认到 106。ACK 确认的是 TCP 序列空间，不证明应用读完，更不证明业务处理完成。",
		},
	],
};

export const scene: Scene = {
	...stream,
	chapters: [
		stream,
		withRoles(closing, {
			client: "client",
			"client-buffer": "client",
			server: "delivery",
			"server-buffer": "delivery",
		}),
	],
};

const sections = ["socket-接口与内核缓冲区契约", "运行一次半关闭发送结束后继续接收"];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

import { chain, node, withRoles } from "./network-layout.ts";
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
	title: "TCP 字节流",
	diagramHeight: 312,
	description:
		"本图假设：同一条 TCP 连接，应用依次写入 ABC 与 DEF。分段与读取仅给一种合法示例，不承诺真实分包、缓冲大小或两次 read。",
	caption: "write 边界、TCP 分段边界、read 边界相互独立；ACK 确认序列空间，不确认业务处理。",
	frames: [
		chain(
			[
				["Application write", "write(ABC) · write(DEF)"],
				["TCP Byte Stream", "A B C D E F · 连续序号"],
				["Network Segments（示例）", "AB | CDEF"],
				["TCP Receive Buffer", "按序重组 ABCDEF"],
				["Application read（示例）", "ABCDE | F"],
			],
			0,
			"两次写入提供六个连续字节，TCP 不保存应用的写入边界。长度前缀、分隔符等应用协议负责重新识别消息。",
			["client", "processing", "processing", "delivery", "delivery"],
		),
		chain(
			[
				["Application write", "write(ABC) · write(DEF)"],
				["TCP Byte Stream", "假设首字节 SEQ = 100"],
				["Network Segments（示例）", "SEQ 100: AB · SEQ 102: CDEF"],
				["Receiver ACK", "ACK 106：此前字节已连续收到"],
				["Application read", "业务可能尚未开始"],
			],
			3,
			"收到连续六个字节后可累计确认到 106；这不是说业务已经消费。丢失数据需要恢复，发送进度还受 cwnd、rwnd 以及在途数据约束。",
			["client", "processing", "processing", "delivery", "delivery"],
		),
	],
};

const transports: Scene = {
	title: "TCP / UDP / QUIC",
	diagramHeight: 312,
	description:
		"本图比较三种传输服务，不是三层串联。QUIC 以 UDP 承载并集成 TLS 1.3；连接迁移受双方能力、连接 ID、路径验证和策略约束。",
	caption: "UDP 保留数据报边界；TCP 提供有序字节流；QUIC 自己提供可靠流、拥塞控制与连接标识。",
	frames: (
		[
			[
				"TCP：ABCDEF 字节流",
				"UDP：ABC | DEF 数据报",
				"QUIC：Stream A / Stream B",
				"应用必须自行定义 TCP 消息边界",
				"TCP 保证有序字节流；UDP 本身不保证送达、顺序或重传，但保留数据报边界。UDP 上层可以另行实现可靠性，QUIC 就是这样的传输协议。",
			],
			[
				"TCP：缺段 → 后续字节等待",
				"UDP：丢报 → 本层不重传",
				"QUIC：A 等待，B 可继续",
				"QUIC 流间仍共享拥塞控制",
				"TCP 的缺口阻止后续字节按序交付。QUIC 为每条流维护偏移，A 的缺口不要求完整 B 流等待；A 内部仍有序，连接级拥塞与资源限制仍会影响所有流。",
			],
			[
				"TCP：连接由端点元组标识",
				"UDP：提供数据报承载",
				"QUIC：Connection ID 标识",
				"换地址 → 验证新路径 → 继续流",
				"支持迁移时，QUIC 可借助连接 ID 将新地址上的包关联到现有连接，再验证新路径。连接 ID 可以轮换，也可能为零长度；不能保证任意网络切换都无缝成功。",
			],
		] as const
	).map(([tcp, udp, quic, state, note], index) => ({
		note: note,
		boxes: [
			node("tcp", 8, 8, 344, ["TCP / IP", tcp], "client", index < 2),
			node("udp", 8, 88, 344, ["UDP / IP", udp], "processing"),
			node("quic", 8, 168, 344, ["QUIC / UDP / IP", quic], "secure", true),
			node("state", 8, 248, 344, ["服务边界", state], "delivery", true),
		],
	})),
};

export const scene: Scene = {
	...stream,
	chapters: [
		stream,
		transports,
		withRoles(closing, {
			client: "client",
			"client-buffer": "client",
			server: "delivery",
			"server-buffer": "delivery",
		}),
	],
};

const sections = [
	"socket-接口与内核缓冲区契约",
	"quic为什么在-udp-之上重建可靠传输",
	"运行一次半关闭发送结束后继续接收",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

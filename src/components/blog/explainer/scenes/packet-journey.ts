import { chain, node, withRoles } from "./diagram-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "先固定一条无 NAT、无代理的路径。应用写入 Socket，内核准备发往 198.51.100.20 的 IP 包；H、G、R、S 分别代表主机、网关入口、路由器出口与服务端的 MAC。",
		active: "host",
		frame: "尚未封装",
		ttl: "64",
	},
	{
		note: "路由查找选中网关。解析网关的 MAC 后，主机封装 H → G 的以太网帧；IP 目的地址仍是远端服务，而不是网关。",
		active: "host",
		frame: "Src MAC = H · Dst MAC = G",
		ttl: "64",
	},
	{
		note: "交换机在这个局域网内按目的 MAC 转发。它不把目的 MAC 改成自己的地址，也不递减 IP 的 TTL。",
		active: "switch",
		frame: "Src MAC = H · Dst MAC = G",
		ttl: "64",
	},
	{
		note: "路由器接收并去掉旧二层头，查下一跳路由，转发时将 TTL 从 64 减到 63。这里把服务端画在它的另一条直连链路上。",
		active: "router",
		frame: "旧二层头已移除",
		ttl: "63",
	},
	{
		note: "路由器为出口链路重新封装 R → S 的帧。源、目的 IP 保持不变；若经过 NAT，地址或端口会在那个边界另行改写。",
		active: "router",
		frame: "Src MAC = R · Dst MAC = S",
		ttl: "63",
	},
	{
		note: "服务端解封装后按传输协议和 Socket 地址分用数据。图中的箭头表示转发顺序；播放停留时间不代表链路耗时。",
		active: "server",
		frame: "S 接收并解封装",
		ttl: "63",
	},
];

const journey: Scene = {
	title: "逐跳转发",
	diagramHeight: 296,
	caption: "交换机转发帧，路由器换二层头并递减 TTL。此例没有 NAT 或代理，源、目的 IP 保持不变。",
	description:
		"主机经交换机与一台路由器到达服务端。逐步比较两条链路上的 MAC 和 IP：H 到 G 的帧经过交换机后不变，路由器拆帧、递减 TTL，再封装 R 到 S 的新帧。底部显示当前帧与源、目的 IP，不展开重传、分片或地址转换。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("host", 8, 8, 156, ["主机 H", "192.168.1.10"], step.active === "host"),
			box("switch", 196, 8, 156, ["交换机", "按 MAC 转发"], step.active === "switch"),
			box("server", 8, 88, 156, ["服务端 S", "198.51.100.20"], step.active === "server"),
			box("router", 196, 88, 156, ["路由器 G / R", "两个链路接口"], step.active === "router"),
			box("ethernet", 8, 176, 344, ["以太网帧 · 本跳 MAC", step.frame], true),
			box("ip", 8, 240, 344, [`IP · TTL ${step.ttl}`, "192.168.1.10 → 198.51.100.20"]),
		],
		edges: [
			edge("lan", "M164 32 H190", step.active === "switch"),
			edge("gateway", "M274 56 V82", step.active === "router"),
			edge("delivery", "M196 112 H170", step.active === "server"),
		],
	})),
};

const layers: [string, string][] = [
	["HTTP Message", "应用消息：请求行、字段与正文"],
	["TLS Record", "消息字节 → 记录；记录可再拆分"],
	["TCP Segment", "有序字节流 → 报文段"],
	["IP Packet", "源 / 目的 IP、TTL"],
	["Ethernet Frame", "本跳 Src / Dst MAC"],
];

const encapsulation: Scene = {
	title: "分层与封装",
	diagramHeight: 312,
	description:
		"本图假设：HTTPS over TCP、IPv4、以太网，省略分片与网卡卸载。层次箭头表示承载关系，不表示一条消息恰好对应一个记录、段或帧。",
	caption: "协议层次决定谁解释哪种头部；HTTP 消息、TLS 记录与 TCP 分段边界不一一对应。",
	frames: [
		"应用先组织 HTTP 消息，TLS 库处理应用字节，Socket 把数据交给 TCP。Socket 是接口，不是线上新增的一层协议。",
		"一条 HTTP 消息可拆成多条 TLS 记录，记录也可承载不同消息的片段。TLS 记录边界独立于应用消息边界。",
		"TCP 按字节编号，发送时可以拆分或合并写入的数据。一条 TLS 记录可跨多个 TCP 段，一个段也可包含多条记录的片段。",
		"TCP 段由 IP 承载；网络层按目的 IP 选下一跳。下一场景将显示 TTL 改变，但在无 NAT 时源、目的 IP 保持不变。",
		"链路层为当前下一跳加帧头。到路由器后拆掉旧帧、处理 IP 再重新成帧；物理层将比特编码成信号，MAC 语义并不适用于所有接口。",
	].map((note, index) =>
		chain(layers, index, note, ["client", "secure", "processing", "processing", "delivery"]),
	),
};

const returning: Scene = {
	title: "响应与连接复用",
	diagramHeight: 248,
	description:
		"本图是路径对照：回程由服务端及每跳独立选路；NAT 情形另作说明，不追加到前一场景的无 NAT 路径。连接复用还需满足协议与服务身份等条件。",
	caption: "响应按目的地址重新选路；新请求不一定新建连接，已有 HTTP/2 连接可以承载后续请求。",
	frames: (
		[
			[
				"服务端响应",
				"本机路由 → 回程下一跳",
				"无 NAT：IP 方向互换",
				"回程可能经过不同路由",
				"服务端发送响应时重新查路由，每跳各自转发，不会记住并机械倒放去程的设备序列。图中抽象回程网络，仍须存在可达路由。",
			],
			[
				"含 NAT 的独立对照",
				"响应目的为映射后的公网端点",
				"命中 NAT 状态 → 反向转换",
				"回程需到达维护映射的设备",
				"如果部署 NAT，回程必须满足映射及过滤状态；不对称路径若绕过状态设备可能失败。普通路由的非对称性不能推导 NAT 对所有回程都能自动还原。",
			],
			[
				"已有 HTTP/2 连接",
				"新请求 → 既有 TLS/TCP",
				"可省去本次 TCP/TLS 建连",
				"不是每次请求都重复整条链",
				"连接可复用时，后续 HTTP 请求使用既有 TLS/TCP。跨源复用有身份、权威性等限制，不能笼统声称访问新域名一定省略 DNS；会话恢复也不同于直接复用现有连接。",
			],
		] as const
	).map(([title, route, state, result, note]) => ({
		note: note,
		boxes: [
			node("server", 196, 8, 156, ["服务端", title], "delivery", true),
			node("client", 8, 8, 156, ["客户端", "接收响应"], "client"),
			node("route", 8, 88, 344, ["回程网络／连接选择", route], "processing", true),
			node("state", 8, 152, 344, [state, result], "secure", true),
		],
		edges: [
			edge("return", "M274 56 V72 H180 V82", true),
			edge("receive", "M8 112 H2 V32 H8", true),
		],
	})),
};

export const scene: Scene = {
	...encapsulation,
	chapters: [encapsulation, withRoles(journey, { host: "client", server: "delivery" }), returning],
};

const sections = [
	"封装解封装与数据单元",
	"端到端与逐跳主机交换机与路由器的分工",
	"已有连接和缓存时请求怎样变化",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

import { chain, node, withRoles } from "./network-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "切换到无 TUN 路由的另一种配置。访问 198.51.100.20 时，默认 /0 路由将包交给物理网关；此时还没有做 NAPT。",
		route: "0.0.0.0/0",
		path: "物理网关",
		source: "192.168.1.10:50001",
		target: "198.51.100.20:443",
		state: "出站前 · 原始源地址",
	},
	{
		note: "家用路由器执行 NAPT，将源地址和端口改成 203.0.113.5:61001，并保存回程映射。它不因地址转换就创建第二条独立 TCP 连接。",
		route: "0.0.0.0/0",
		path: "网关执行 NAPT",
		source: "203.0.113.5:61001",
		target: "198.51.100.20:443",
		state: "50001 ↔ 61001 · 回程反向转换",
	},
];

const forwarding: Scene = {
	title: "转发与 NAPT",
	diagramHeight: 296,
	caption:
		"同表查找先比较前缀长度。NAPT 改写包头并维护映射；TUN 把三层包交给用户态，后续出站由程序决定。",
	description:
		"本图假设：无 TUN，远端目标走默认网关并经 NAPT。底部展示各情形的地址端口，不把切换配置表现成同一包依次经历的路径。文档保留地址仅用于示意。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("route", 8, 8, 156, ["选中的前缀", step.route], true),
			box("path", 196, 8, 156, ["下一处理点", step.path], true),
			box("source", 8, 100, 344, ["源 IP:Port", step.source], true),
			box("destination", 8, 176, 344, ["目的 IP:Port", step.target]),
			box("boundary", 8, 240, 344, ["本帧的边界", step.state]),
		],
		edges: [edge("select", "M164 32 H190", true)],
	})),
};

const policy: Scene = {
	title: "策略与最长前缀",
	diagramHeight: 312,
	description:
		"本图假设：用 Linux 风格的简化策略模型说明先选查询上下文、再在表内匹配。规则可能继续查表或直接拒绝；macOS 与其他系统并非同一机制。",
	caption: "策略决定查哪张表，最长前缀决定该表中的匹配；路由、地址转换和 TUN 是不同职责。",
	frames: [
		chain(
			[
				["Policy Routing", "源地址 / 标记 / 接口等条件"],
				["Routing Table Selection", "规则选择查询的路由表"],
				["Longest Prefix Match", "同表内：/32 > /24 > /1 > /0"],
				["Next Hop / Interface", "下一跳与出口接口"],
				["后续处理", "邻居解析、转发或交给虚拟接口"],
			],
			1,
			"策略路由先按规则选择查表上下文；若所选表没有适用结果，规则处理可能继续。最长前缀匹配不越过策略规则把所有表混在一起比较。",
		),
		chain(
			[
				["目标：192.168.1.50", "固定同一张含 /0、/1、/24 的表"],
				["0.0.0.0/0 → 网关", "默认路由匹配，但不够具体"],
				["128.0.0.0/1 → TUN", "同样匹配，仍不如 /24"],
				["192.168.1.0/24 → LAN", "最长匹配：下一跳是目标自身"],
				["若存在匹配的 /32", "主机路由还会胜过 /24"],
			],
			3,
			"这五行列出匹配决策，不是包依次经过五个接口。更具体的局域网 /24 可胜过捕获大范围公网流量的 /1；最终结果以实际规则和路由查询为准。",
			[],
			false,
		),
	],
};

const tun: Scene = {
	title: "TUN 与出站回环",
	diagramHeight: 312,
	description:
		"本图假设：独立于无 TUN 场景，加入 0.0.0.0/1 与 128.0.0.0/1；目标 198.51.100.20 命中后者。TUN 传递三层 IP 包，TAP 才传递二层帧。",
	caption: "NAT 改写包头，TUN 跨越内核／用户态边界；核心创建的出站必须有明确的绕过路径。",
	frames: (
		[
			[
				"命中 128.0.0.0/1",
				"内核 → TUN → 用户态",
				false,
				"IP 包交付，不是 NAT 改写",
				"另一种配置下，198.51.100.20 匹配 /1 而不是 /0。内核将三层 IP 包交给 TUN，用户态读取；接口本身不会自动代理、加密或改写源地址。",
			],
			[
				"出站仍命中 TUN",
				"用户态 → 出站 → TUN",
				true,
				"错误：重复接管，形成回环",
				"若核心自己的出站仍被同一接管路由捕获，就出现 TUN → Core → Outbound → TUN。还要检查真实路由、标记或接口绑定，不能把反复连接当成远端服务故障。",
			],
			[
				"出站命中绕过路径",
				"用户态 → 物理接口",
				false,
				"修正：专用路由／策略／平台机制",
				"为核心出站配置适用的绕过方式，例如更具体的节点路由、策略标记或平台的连接排除机制。默认路由仍存在不等于能够绕过更具体的 /1；具体做法必须按系统核对。",
			],
		] as const
	).map(([route, boundary, loop, state, note], index) => ({
		note: String(note),
		boxes: [
			node("kernel", 8, 8, 156, ["内核路由", String(route)], "processing", true),
			node("tun", 196, 8, 156, ["TUN", "三层 IP 包"], "processing", index < 2),
			node("core", 196, 104, 156, ["用户态 Core", "读取 / 处理 / 写回"], "secure", true),
			node(
				"outbound",
				8,
				104,
				156,
				["独立出站", index === 2 ? "绕过 TUN" : "重新查路由"],
				"secure",
				index > 0,
			),
			node("boundary", 8, 200, 344, ["内核／用户态边界", String(boundary)], "processing", true),
			node(
				"state",
				8,
				264,
				344,
				["状态", String(state)],
				index === 2 ? "delivery" : "processing",
				true,
			),
		],
		edges: [
			edge("capture", "M164 32 H190", index === 0),
			edge("read", "M274 56 V98", index === 0),
			edge("outbound", "M196 128 H170", index > 0),
			edge("loop", "M86 104 V62", Boolean(loop)),
			...(index === 2 ? [edge("bypass", "M86 152 V194", true)] : []),
		],
	})),
};

export const scene: Scene = {
	...policy,
	chapters: [policy, withRoles(forwarding, { source: "client", destination: "delivery" }), tun],
};

const sections = [
	"路由表与最长前缀匹配",
	"nat多台内网设备如何共用一个公网-ip",
	"虚拟网络接口tun-与-tap-如何接入协议栈",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

import { node, withRoles } from "./network-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const stages = [
	{
		id: "dns",
		label: "DNS · 名称解析",
		formula: "namelookup",
		note: "先限定一次全新、直连、无重定向的 HTTPS over TCP 请求。namelookup 是名称解析完成的累积计时；比较系统解析、dig 和缓存时，要先确认它们是否走同一解析路径。",
	},
	{
		id: "tcp",
		label: "TCP · 建立连接",
		formula: "connect − namelookup",
		note: "相减得到 TCP 建连阶段。先确认连接在哪里终止：若被本地 TUN 代理接管，这个指标可能只覆盖到本地代理，不能当作到源站的完整网络耗时。",
	},
	{
		id: "tls",
		label: "TLS · 握手与身份验证",
		formula: "appconnect − connect",
		note: "相减观察 TLS 阶段。失败时检查证书、目标名和握手错误；较大的握手消息受阻也可能提示路径 MTU 问题，需要抓包等证据，不能仅凭计时认定 SNI 阻断或 PMTU 黑洞。",
	},
	{
		id: "first-byte",
		label: "请求发送至首字节",
		formula: "starttransfer − appconnect",
		note: "这段包含请求发送、网络往返、服务端处理和首字节返回，不是纯服务端计算时间。换一个端点或仅改一个变量做对照，才能逐步缩小问题范围。",
	},
	{
		id: "body",
		label: "响应正文传输",
		formula: "total − starttransfer",
		note: "最后看正文传输。持续吞吐受瓶颈带宽与有效在途窗口 / RTT 约束，也受慢启动、丢包和应用速度影响。HTTP/3、连接复用、重定向和 CONNECT 代理需要另行解释，不能机械套用本图差值。",
	},
];

const timing: Scene = {
	title: "curl 累计计时",
	diagramHeight: 312,
	caption:
		"累积计时相减前，先确认协议、连接复用和终止端点。每次只改一个变量，计时差异才有可比较的含义。",
	description:
		"五行依次表示 DNS、TCP、TLS、请求至首字节和正文传输，橙色标出当前检查的阶段。公式取自 curl 的累积计时，限定全新直连、无重定向的 HTTPS over TCP 请求。行与箭头表示阶段顺序，长度和播放时间不表示实测耗时。",
	frames: stages.map((stage, index) => ({
		note: stage.note,
		boxes: stages.map((item, row) =>
			box(item.id, 8, 8 + row * 64, 344, [item.label, item.formula], row === index, row < index),
		),
		edges: stages
			.slice(0, -1)
			.map((item, row) =>
				edge(`${item.id}-next`, `M180 ${56 + row * 64} V${66 + row * 64}`, row === index),
			),
	})),
};

const checks: [string, string, string, string][] = [
	["IP 配置可用？", "地址 / 链路", "DHCP / SLAAC", "检查接口与地址"],
	["解析结果正常？", "名字 → 地址", "DNS / 缓存", "核对解析路径"],
	["下一跳正确？", "实际路由查询", "路由 / TUN / NAT", "核对出站接口"],
	["传输可建立？", "TCP 或 QUIC/UDP", "丢包 / 防火墙", "按实际协议捕获"],
	["TLS 验证成功？", "QUIC 中集成 TLS", "证书 / 握手", "MTU 需额外证据"],
	["HTTP 成功？", "状态码 / 响应", "代理 / 应用", "检查服务端日志"],
];

const diagnosis: Scene = {
	title: "分层排障决策",
	diagramHeight: 456,
	description:
		"本图假设：一次访问失败或变慢，按证据逐层缩小范围。向下表示检查通过，向右表示异常或证据不足；HTTP/3 在 QUIC 中完成传输与 TLS 建连，两项检查相互关联。",
	caption:
		"异常节点提示下一份证据，不直接证明根因。功能正常后再分析 RTT、丢包、抖动与吞吐，每次只改变一个变量。",
	frames: [
		"先确认接口、链路及 IP 配置。没有可用地址或默认路由时，回到 DHCP、RA/SLAAC 与接口状态；不要一开始就根据浏览器错误判断 DNS 坏了。",
		"对照实际应用使用的解析器与缓存。dig、系统接口、浏览器 DoH 可能走不同路径；获得地址后，还要确认地址是否适合当前连接。",
		"查询实际目标的路由与下一跳，并检查 TUN、策略规则和 NAT 回程状态。ping 不通不能独立证明路由失效，要与目标协议的包和响应对照。",
		"先识别实际传输：HTTP/1.1、HTTP/2 常检查 TCP SYN/ACK；HTTP/3 检查 QUIC/UDP 与版本、握手、丢失情况。UDP 没有 TCP 三次握手，不能强制套用 TCP 分支。",
		"分析 TLS 的明确错误、信任链、SAN、SNI 与握手消息。较大消息失败只是线索；只有结合 ICMP Packet Too Big、重传和受控包长对照才可追查 PMTU。",
		"HTTP 层检查状态码、重定向、代理和应用日志。功能成功但慢时再比较 RTT、吞吐、丢包与排队，保留多次观测及失败样本，不能把 TTFB 全算作服务端计算。",
	].map((note, active) => ({
		note,
		boxes: [
			...checks.flatMap(([question, evidence, failure, action], i) => [
				node(`check-${i}`, 8, 8 + i * 64, 164, [question, evidence], "client", active === i),
				node(`failure-${i}`, 204, 8 + i * 64, 148, [failure, action], "processing", active === i),
			]),
			node(
				"performance",
				8,
				408,
				344,
				["各层通过 → 性能对照", "RTT / 丢包 / 抖动 / 吞吐"],
				"delivery",
				active === 5,
			),
		],
		edges: checks.flatMap((_, i) => [
			{
				...edge(`failure-${i}`, `M172 ${32 + i * 64} H198`, active === i),
				label: { text: "否", x: 187, y: 24 + i * 64 },
			},
			edge(
				`pass-${i}`,
				i === 5 ? "M90 376 V396 H180 V402" : `M90 ${56 + i * 64} V${66 + i * 64}`,
				active > i,
			),
		]),
	})),
};

export const scene: Scene = {
	...timing,
	chapters: [withRoles(timing, { dns: "client", tls: "secure", body: "delivery" }), diagnosis],
};

const sections = ["用-curl-记录请求耗时", "从哪一步开始排查"];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

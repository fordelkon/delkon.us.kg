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

export const scene: Scene = {
	title: "把一次请求拆成可核对的阶段",
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

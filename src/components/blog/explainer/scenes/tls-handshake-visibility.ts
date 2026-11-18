import { connectionEndpoint, controlEdge, logicalFlow, node, withRoles } from "./diagram-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "固定为未启用 ECH、无 0-RTT、无 HelloRetryRequest 的 TLS 1.3 证书握手。ClientHello 明文发送，链路旁观者可见目标 IP、端口以及所携带的 SNI 和 ALPN 提议。",
		client: "发送 ClientHello",
		server: "等待握手",
		message: "ClientHello · key_share / SNI / ALPN",
		observer: "可见 IP:Port、SNI、ALPN 提议",
		direction: "outbound",
	},
	{
		note: "服务端明文返回 ServerHello 和 key_share。在这里选用 ECDHE，双方结合密钥交换与握手记录，经 HKDF 派生握手流量密钥。此时尚未完成身份认证。",
		client: "派生握手密钥",
		server: "返回 ServerHello",
		message: "ServerHello · key_share",
		observer: "仍可见 ServerHello",
		direction: "inbound",
	},
	{
		note: "ServerHello 后的 EncryptedExtensions、Certificate、CertificateVerify 和服务端 Finished 都由握手密钥保护。普通链路旁观者和只转发字节的 CONNECT 代理看不到证书内容。",
		client: "解密握手消息",
		server: "加密证书与证明",
		message: "{证书、签名与握手校验}",
		observer: "看得到流量 · 看不到证书内容",
		direction: "inbound",
	},
	{
		note: "客户端检查信任链、证书 SAN 与目标名是否匹配，并验证 CertificateVerify 和 Finished。验证通过后发送自己的 Finished；不是仅有一张证书就代表身份可信。",
		client: "验证身份与记录",
		server: "等待客户端确认",
		message: "验证通过 → {客户端 Finished}",
		observer: "无法读取握手内的身份验证材料",
		direction: "outbound",
	},
	{
		note: "HTTP 路径、请求头和正文由应用流量密钥保护。链路仍可能暴露 IP、包长和时序；启用 ECH 可进一步保护内部 ClientHello，但不隐藏目的 IP。",
		client: "发送 HTTPS 请求",
		server: "TLS 终止并解密",
		message: "{HTTP 路径 / Header / 正文}",
		observer: "可见端点与流量特征 · 内容加密",
		direction: "outbound",
	},
];

const handshake: Scene = {
	title: "TLS 1.3 握手",
	caption:
		"虚线表示握手控制消息，实线表示应用数据；消息标签标明保护状态。ServerHello 后的证书与握手扩展已经加密。谁能看见 HTTPS 内容，取决于谁终止并验证了这段 TLS 连接。",
	description:
		"上方是 TLS 客户端与当前终止端，下方分别显示消息和旁观者可见信息。本图假设：普通 TLS 1.3 证书握手，无 0-RTT、无 HelloRetryRequest。未启用 ECH 时 SNI 可见，HTTP 内容仍加密；不推导真实耗时。",
	frames: steps.map((step, index) => ({
		note: step.note,
		boxes: [
			box("client", 8, 8, 156, ["TLS 客户端", step.client], step.direction === "outbound"),
			connectionEndpoint(
				box("server", 196, 8, 156, ["TLS 终止端", step.server], step.direction === "inbound"),
			),
			node(
				"message",
				8,
				100,
				344,
				[
					index === 2
						? "EncryptedExtensions / Certificate"
						: index < 2
							? "明文握手消息"
							: "密钥保护消息",
					index === 2 ? "CertificateVerify / Finished" : step.message,
				],
				index < 2 ? "processing" : "secure",
				true,
			),
			box("observer", 8, 188, 344, ["可见性边界", step.observer]),
		],
		edges: [
			{
				...edge("message", step.direction === "outbound" ? "M164 32 H190" : "M196 32 H170", true),
				dashed: index < 4,
			},
		],
	})),
};

const protocols: [string, string, string, string][] = [
	["HTTP/1.1", "有序响应", "TLS", "TCP"],
	["HTTP/2", "多路复用流", "TLS", "TCP"],
	["HTTP/3", "独立请求流", "QUIC + TLS 1.3", "UDP"],
];

const architecture: Scene = {
	title: "HTTP 协议栈",
	diagramHeight: 280,
	description:
		"本图假设：比较 HTTPS 的三种部署。HTTP/1.1 也可不使用 TLS；HTTP/3 将 TLS 1.3 握手集成在 QUIC 中，不使用 TLS 记录层。",
	caption:
		"HTTP 语义延续，承载方式演进；独立流减少跨流按序等待，但共享拥塞控制与应用依赖仍然存在。",
	frames: [
		"HTTP/1.1 在本图中经 TLS/TCP 传输。持久连接可以复用；即使使用流水线，响应仍须按请求顺序返回。并行连接是另一种并发方式。",
		"HTTP/2 将不同 Stream 的帧交错发送到同一 TCP 字节流。某个 TCP 段丢失时，后续字节要等待补齐，因此多个 HTTP Stream 都可能受阻。",
		"HTTP/3 把请求映射到 QUIC 流。Stream A 缺少字节时，已齐备的 Stream B 数据可交付；A 内部仍须有序，连接级拥塞控制与 QPACK 依赖仍可能带来等待。",
	].map((note, active) => ({
		note,
		boxes: protocols.flatMap((p, i) => [
			node(`http-${i}`, 8 + i * 118, 8, 108, [p[0], p[1]], "client", active === i),
			node(
				`security-${i}`,
				8 + i * 118,
				88,
				108,
				[i === 2 ? "QUIC" : p[2], i === 2 ? "含 TLS 1.3" : "TLS 记录层"],
				"secure",
				active === i,
			),
			node(`transport-${i}`, 8 + i * 118, 168, 108, [p[3], "IP"], "processing", active === i),
			node(
				`delivery-${i}`,
				8 + i * 118,
				232,
				108,
				[
					i === 0 ? "顺序响应" : i === 1 ? "TCP 丢失" : "A 等待补齐",
					i === 0 ? "A → B" : i === 1 ? "A、B 都等待" : "B 可交付",
				],
				"delivery",
				active === i,
			),
		]),
		edges: protocols.flatMap((_, i) => [
			edge(`upper-${i}`, `M${62 + i * 118} 56 V82`, active === i),
			edge(`lower-${i}`, `M${62 + i * 118} 136 V162`, active === i),
			edge(`result-${i}`, `M${62 + i * 118} 216 V226`, active === i),
		]),
	})),
};

const visibility: Scene = {
	title: "谁能看到什么",
	diagramHeight: 312,
	description:
		"本图假设：普通 HTTPS；分别比较链路旁观者、仅转发 CONNECT 的代理与获授权的 TLS 终止代理。三帧是不同观察位置，不是一次请求的连续解密过程。",
	caption:
		"读取 HTTP 内容需要成为 TLS 端点或取得相应密钥；CONNECT 与 ECH 都不会隐藏所有网络元数据。",
	frames: (
		[
			[
				"链路旁观者",
				"IP、端口、包长与时序",
				"无 ECH 时通常可见 SNI",
				"无法读取 HTTP 正文",
				"旁观者能看到网络元数据。未使用 ECH 的 ClientHello 通常还暴露 SNI；成功使用 ECH 后真实 inner 被保护，但目的 IP 仍然可见。",
			],
			[
				"CONNECT 字节隧道",
				"CONNECT 的目标与端口",
				"转发的是端到端 TLS",
				"无法自动读取 HTTP 正文",
				"只转发 CONNECT 的代理知道客户端给它的目标和隧道流量。客户端到代理的 TCP 与代理到目标的 TCP 分开，但 TLS 可跨这两段 TCP 端到端运行。",
			],
			[
				"TLS 终止代理",
				"信任／证书配置满足要求",
				"客户端 ⇄ 代理 ⇄ 源站",
				"代理可读取 HTTP 正文",
				"客户端接受代理提供的服务身份，代理终止这段 TLS，再单独验证源站并建立另一段 TLS。CertificateVerify 证明私钥持有；Finished 校验握手记录与密钥，不能替代证书链与 SAN 名字检查。",
			],
		] as const
	).map(([kind, known, boundary, content, note]) => ({
		note: note,
		boxes: [
			node("client", 8, 8, 156, ["客户端", "请求 example.com"], "client"),
			node("origin", 196, 8, 156, ["源站", "HTTPS 服务"], "delivery"),
			node("observer", 8, 88, 344, [kind, known], "processing", true),
			node("boundary", 8, 168, 344, ["TLS 边界", boundary], "secure", true),
			node("content", 8, 248, 344, ["HTTP 可见性", content], "secure", true),
		],
		edges: [edge("connection", "M164 32 H190"), controlEdge("observe", "M180 32 V82", true)],
	})),
};

export const scene: Scene = {
	...architecture,
	chapters: [
		logicalFlow(architecture),
		withRoles(handshake, { client: "client", server: "delivery", message: "secure" }),
		visibility,
	],
};

const sections = [
	"http-语义与连接复用的演进",
	"tls-13-握手密钥协商证书校验与-sni--alpn",
	"端到端可见性边界谁能看到什么",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

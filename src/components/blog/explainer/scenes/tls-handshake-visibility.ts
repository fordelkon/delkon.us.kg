import { connectionEndpoint, node, withRoles } from "./diagram-layout.ts";
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

const architecture: Scene = {
	title: "一个缺口会阻塞哪些流",
	section: "http-语义与连接复用的演进",
	description:
		"两个独立对照：HTTP/2 的多个流共用一条 TCP 有序字节流；HTTP/3 使用 QUIC 的独立流偏移。箭头表示交付依赖，不是版本升级顺序，也不表示 QUIC 完全消除了所有等待。",
	caption: "关键区别是传输层按序交付的范围：整条 TCP 字节流，或一条 QUIC 流。",
	diagram: `flowchart TB
 subgraph h2[HTTP/2 over TCP]
  a2["流 A 的帧"] --> tcp["TCP 字节流存在缺口"]
  b2["流 B 的帧"] --> tcp
  tcp --> blocked["缺口后的字节不能按序交付<br/>A、B 都可能受阻"]
 end
 subgraph h3[HTTP/3 over QUIC]
  a3["流 A 缺字节"] --> waiting["A 等待自身缺口补齐"]
  b3["流 B 字节完整"] --> ready["B 可独立交付"]
 end
 class tcp,waiting state
 class blocked risk
 class ready result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["a2", "b2", "tcp", "blocked"],
			activeEdges: [0, 1, 2],
			note: "HTTP/2 虽把多个流的帧交错发送，却仍依赖同一条 TCP 有序字节流。缺失的 TCP 字节会挡住后续字节，其他 HTTP 流也可能一起等待。",
		},
		{
			boxes: [],
			activeNodes: ["a3", "waiting", "b3", "ready"],
			activeEdges: [3, 4],
			note: "QUIC 分别维护流偏移：A 缺字节不要求已完整的 B 等待。但连接级拥塞控制、资源限制和 QPACK 等依赖仍可影响交付，不能理解为互不影响。",
		},
	],
};

export const scene: Scene = {
	...architecture,
	chapters: [
		architecture,
		withRoles(handshake, { client: "client", server: "delivery", message: "secure" }),
	],
};

const sections = ["http-语义与连接复用的演进", "tls-13-握手密钥协商证书校验与-sni--alpn"];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

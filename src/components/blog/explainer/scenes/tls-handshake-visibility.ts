import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "固定为未启用 ECH、无 0-RTT、无 HelloRetryRequest 的 TLS 1.3 证书握手。ClientHello 明文发送，链路旁观者可见目标 IP、端口以及所携带的 SNI 和 ALPN 提议。",
		client: "发送 ClientHello",
		server: "等待握手",
		message: "ClientHello · SNI / ALPN",
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
	{
		note: "再看另一种部署：受客户端信任的中间代理终止 TLS，再另建到源站的 TLS 连接，它因成为连接端点而能够读取内容。这与普通 CONNECT 字节隧道不同。",
		client: "信任代理证书",
		server: "代理终止 TLS",
		message: "客户端 ⇄ 代理 ⇄ 源站 · 两段 TLS",
		observer: "TLS 终止端能够读取明文",
		direction: "outbound",
	},
];

export const scene: Scene = {
	title: "TLS 1.3 从哪里开始加密",
	caption:
		"ServerHello 后的证书与握手扩展已经加密。谁能看见 HTTPS 内容，取决于谁终止并验证了这段 TLS 连接。",
	description:
		"上方是 TLS 客户端与当前终止端，下方分别显示消息和旁观者可见信息。前五帧是一种普通 TLS 1.3 证书握手，最后一帧切换到受信任代理终止的独立部署对照。未启用 ECH 时 SNI 可见，HTTP 内容仍加密；不推导真实耗时。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("client", 8, 8, 156, ["TLS 客户端", step.client], step.direction === "outbound"),
			box("server", 196, 8, 156, ["TLS 终止端", step.server], step.direction === "inbound"),
			box("message", 8, 100, 344, ["本阶段消息", step.message], true),
			box("observer", 8, 188, 344, ["可见性边界", step.observer]),
		],
		edges: [edge("message", step.direction === "outbound" ? "M164 32 H190" : "M196 32 H170", true)],
	})),
};

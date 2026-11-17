import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "先看显式代理入口。应用通过 CONNECT example.com:443，或 SOCKS5 的域名地址类型 0x03，将目标名交给代理；若传的是数字 IP，代理就不会凭空得到域名。",
		entry: "CONNECT、SOCKS5",
		known: "协议携带目标名",
		mapping: "显式入口不依赖 Fake-IP",
		outbound: "收到目标后再分流",
	},
	{
		note: "切换到 TUN 入口：应用先解析，再向一个 IP 建连。TUN 读取的是三层 IP 包，IP 头不携带应用最初使用的域名，单凭目的 IP 可能无法还原它。",
		entry: "IP 包进入 TUN",
		known: "只知道目的 IP",
		mapping: "仅有 IP 不保证能够恢复域名",
		outbound: "缺少域名证据",
	},
	{
		note: "启用 Fake-IP 的另一条完整路径从 DNS 开始。查询进入 Mihomo DNS 后，代理为 example.com 分配虚拟地址 198.18.0.8，并保存映射；该地址不是源站公网地址。",
		entry: "DNS 查询目标名",
		known: "登记虚拟地址",
		mapping: "198.18.0.8 ↔ example.com",
		outbound: "此时尚未连接源站",
	},
	{
		note: "应用随后连接 198.18.0.8，包进入 TUN；Mihomo 查映射得到 example.com。没有映射时可按配置尝试嗅探，但明文 Host、SNI 是否可见受协议与 ECH 等条件限制。",
		entry: "连接 198.18.0.8",
		known: "查表恢复目标名",
		mapping: "198.18.0.8 ↔ example.com",
		outbound: "映射命中后按域名匹配",
	},
	{
		note: "域名规则选择 DIRECT 或远端代理节点，再建立独立的出站连接。DIRECT 表示由代理直接连接目标，并不表示流量从未被本地接管；Fake-IP 本身也不提供 TLS 解密。",
		entry: "本地流量已接管",
		known: "规则选择出站",
		mapping: "目标仍是 example.com · 非虚拟 IP",
		outbound: "DIRECT 或远端节点 · 独立出站",
	},
];

export const scene: Scene = {
	title: "代理从哪里得到目标域名",
	diagramHeight: 296,
	caption:
		"显式代理可从协议拿到域名；TUN 只拿到 IP 包。Fake-IP 通过 DNS 映射找回目标，再由规则选择独立出站。",
	description:
		"比较显式代理、普通 IP 进入 TUN 和 Fake-IP 三种入口。Fake-IP 路径先在 DNS 查询时记录虚拟地址与域名，再在 TUN 收到连接时查表。底部列出 DIRECT 与远端节点两个候选出口，不表示同时选择两者，也不表示代理已经解密 TLS。",
	frames: steps.map((step, index) => ({
		note: step.note,
		boxes: [
			box("application", 8, 8, 156, ["应用侧入口", step.entry], true),
			box("proxy", 196, 8, 156, ["Mihomo 已知信息", step.known], true),
			box(
				"mapping",
				8,
				100,
				344,
				["域名线索 / Fake-IP 映射", step.mapping],
				index === 2 || index === 3,
			),
			box("direct", 8, 176, 156, ["DIRECT", "代理直连目标"], index === 4),
			box("node", 196, 176, 156, ["远端节点", "经节点到目标"], index === 4),
			box("boundary", 8, 240, 344, ["出站边界", step.outbound]),
		],
		edges: [
			edge("entry", "M164 32 H190", true),
			edge("direct", "M180 148 V160 H86 V170", index === 4),
			edge("node", "M180 160 H274 V170", index === 4),
		],
	})),
};

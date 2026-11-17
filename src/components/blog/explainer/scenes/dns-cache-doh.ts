import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "先查应用、系统与递归解析器各自的缓存。可用记录可直接回答；TTL 按记录集分别计时，命中缓存不代表每次都访问权威服务器。",
		active: "cache",
		cache: "可用记录直接返回",
		resolver: "也可能命中缓存",
		authority: "命中时不必查询",
		boundary: "缓存命中 ≠ 刚从权威取回",
	},
	{
		note: "切换到所需记录未命中的情形。Stub 请求递归解析器代劳；递归解析器沿根、TLD、权威的转介继续查询，已有委派缓存可以跳过部分步骤。",
		active: "resolver",
		cache: "所需记录未命中",
		resolver: "根 → TLD → 权威",
		authority: "迭代查询的终点",
		boundary: "Stub 请求递归 · 解析器执行迭代",
	},
	{
		note: "A、AAAA 与 HTTPS 是不同类型的查询。HTTPS 记录可以携带 alpn、ech 等可选参数，并不保证每个域名都有；解析器按各记录集的 TTL 缓存回答。",
		active: "authority",
		cache: "按记录集保存 TTL",
		resolver: "缓存并返回回答",
		authority: "A、AAAA、HTTPS",
		boundary: "HTTPS 参数可选 · 查询彼此独立",
	},
	{
		note: "另一种回答是 NXDOMAIN 或 NODATA：带有适当 SOA 信息时可按否定缓存规则保存。SERVFAIL、超时属于失败，不等于域名不存在；失败也可能被短暂缓存。",
		active: "cache",
		cache: "正缓存 / 否定缓存",
		resolver: "区分不存在与失败",
		authority: "SOA 约束否定 TTL",
		boundary: "NXDOMAIN / NODATA ≠ SERVFAIL",
	},
	{
		note: "在支持相应协议的客户端与递归解析器之间启用 DoH、DoT 或 DoQ，只加密这一段通道。递归解析器仍需读取查询名；它到权威的流量是另一个边界。",
		active: "resolver",
		cache: "命中仍可直接回答",
		resolver: "仍知道查询域名",
		authority: "不在 DoH 区间内",
		boundary: "加密区间：客户端 ⇄ 递归解析器",
	},
];

export const scene: Scene = {
	title: "DNS 缓存、递归与加密区间",
	caption:
		"缓存决定哪些查询可以省略，递归解析器负责代查；加密 DNS 保护通道，解析器自身仍能看到查询名。",
	description:
		"上方是应用与本地缓存，下方是递归解析器和权威侧。依次比较缓存命中、未命中时的迭代、不同类型记录的缓存、否定回答和加密 DNS。各帧是条件对照，不表示一次查询必然经历正回答与否定回答；加密范围单独写在底部。",
	frames: steps.map((step) => ({
		note: step.note,
		boxes: [
			box("stub", 8, 8, 156, ["应用 / Stub", "请求所需记录"]),
			box("cache", 196, 8, 156, ["本地 / 系统缓存", step.cache], step.active === "cache"),
			box("resolver", 8, 100, 156, ["递归解析器", step.resolver], step.active === "resolver"),
			box("authority", 196, 100, 156, ["权威侧", step.authority], step.active === "authority"),
			box("boundary", 8, 188, 344, ["查询与可见性边界", step.boundary]),
		],
		edges: [
			edge("local", "M164 32 H190", step.active === "cache"),
			edge("recursive", "M86 56 V94", step.active === "resolver"),
			edge("iterative", "M164 124 H190", step.active === "authority"),
		],
	})),
};

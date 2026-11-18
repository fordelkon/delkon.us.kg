import { logicalFlow, node, withRoles } from "./diagram-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const steps = [
	{
		note: "按实际解析路径检查可用缓存；应用、系统、转发器、递归服务不一定全在同一路径上。可用记录可直接回答；TTL 按记录集分别计时，命中缓存不代表每次都访问权威服务器。",
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

const caching: Scene = {
	title: "缓存与记录",
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

const delegation: Scene = {
	title: "递归与迭代",
	diagramHeight: 312,
	description:
		"本图假设：Stub 委托递归服务解析一个名字，省略 CNAME 等分支。三台权威侧节点分别展示根、TLD 与目标权威；箭头是当前交互，缓存决定从哪里开始。",
	caption: "Stub 请求递归服务代查；递归服务通常迭代跟随 referral，缓存委派后可跳过根或 TLD。",
	frames: (
		[
			[
				"Stub → 递归：请给最终答案",
				"TLD referral",
				"TLD：尚未访问",
				"权威：尚未访问",
				0,
				"缓存不足时，递归解析器先向根查询并得到指向 TLD 的 referral。根不替它递归查完，也通常不返回目标地址。",
			],
			[
				"递归 → TLD：继续询问",
				"根：委派已缓存",
				"权威 referral",
				"权威：尚未访问",
				1,
				"递归解析器根据转介查询 TLD，再得到目标区域权威服务器的信息。必要时解析 NS 地址；委派与 glue 数据有各自的缓存和使用规则。",
			],
			[
				"递归 → 权威：询问所需类型",
				"根：无需再访问",
				"TLD：无需再访问",
				"最终 RRset",
				2,
				"权威服务器返回所需记录或相应否定回答，递归服务缓存并回给 Stub。A、AAAA、HTTPS 是不同类型，不是一份固定总会齐备的响应。",
			],
			[
				"后续查询：已有委派缓存",
				"根：跳过",
				"TLD：跳过",
				"只补查缺少的数据",
				2,
				"若最终记录未命中，但权威委派与地址仍可用，可以从权威侧继续，跳过根和 TLD；若最终记录也命中，连权威查询都省去。",
			],
		] as const
	).map(([request, root, tld, authority, active, note]) => ({
		note: String(note),
		boxes: [
			node("stub", 8, 8, 344, ["Stub ⇄ Recursive Resolver", String(request)], "client", true),
			node("resolver", 8, 88, 156, ["递归解析器", "缓存 / 迭代 / 返回"], "processing", true),
			node("root", 196, 88, 156, ["Root", String(root)], "delivery", active === 0),
			node("tld", 196, 168, 156, ["TLD", String(tld)], "delivery", active === 1),
			node("auth", 196, 248, 156, ["Authoritative", String(authority)], "delivery", active === 2),
			node("cache", 8, 248, 156, ["缓存命中", "直接向 Stub 返回"], "processing"),
		],
		edges: [
			edge("recursive", "M86 56 V82", true),
			edge("root", "M164 112 H190", active === 0),
			edge("tld", "M164 124 H180 V192 H190", active === 1),
			edge("auth", "M164 136 H174 V272 H190", active === 2),
		],
	})),
};

const security: Scene = {
	title: "加密与认证边界",
	diagramHeight: 312,
	description:
		"本图假设：客户端认证所选递归服务，DoH／DoT／DoQ 保护客户端到该服务的通道。递归到权威的传输需另行判断，DNSSEC 只有实际验证才提供认证。",
	caption: "传输加密与数据认证是两种保证；HTTPS RR 的 ech 参数提供 ECH 配置，并不自动启用 ECH。",
	frames: (
		[
			[
				"DoH / DoT / DoQ",
				"解析器仍知道查询名",
				"到权威：另一个传输边界",
				"客户端到递归服务的通道加密，不会自动延伸到根、TLD 和权威的查询。解析服务作为端点仍能读取名字，浏览器 DoH 也可能绕过系统解析缓存。",
			],
			[
				"DNSSEC 验证",
				"信任锚 → DS / DNSKEY → RRSIG",
				"认证数据，不加密查询名",
				"DNSSEC 验证数据来源与完整性，并可验证不存在证明；它不是保密协议。未签名区域与签名验证失败不同，不能把任意 SERVFAIL 都解释为不存在。",
			],
			[
				"HTTPS RR → ech 参数",
				"ECHConfigList → TLS ClientHello",
				"需客户端支持、配置与协商",
				"HTTPS/SVCB 的 ech 参数传递 ECHConfigList；TLS 客户端再按支持情况使用配置。DNS 记录不是 ECH 握手本身，ECH 也不隐藏目的 IP。",
			],
		] as const
	).map(([method, resolver, boundary, note]) => ({
		note: note,
		boxes: [
			node("client", 8, 8, 344, ["客户端", method], "client", true),
			node(
				"channel",
				8,
				88,
				344,
				["到递归服务的加密边界", "DoH / DoT / DoQ（分别选择）"],
				"secure",
				true,
			),
			node("resolver", 8, 168, 344, ["递归服务／验证职责", resolver], "processing", true),
			node("authority", 8, 248, 344, ["不能越过的推论边界", boundary], "delivery"),
		],
		edges: [
			edge("encrypted", "M180 56 V82", true),
			edge("resolver", "M180 136 V162", true),
			{ ...edge("separate", "M180 216 V242"), dashed: true },
		],
	})),
};

export const scene: Scene = {
	...caching,
	chapters: [
		logicalFlow(withRoles(caching, { stub: "client", authority: "delivery" })),
		logicalFlow(delegation),
		logicalFlow(security),
	],
};

const sections = [
	"缓存ttl-与错误结果",
	"递归与迭代一次查询如何穿越层级",
	"dnssec-与加密-dns数据认证和通道保密",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

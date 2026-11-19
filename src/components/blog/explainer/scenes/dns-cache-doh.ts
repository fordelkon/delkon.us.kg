import { logicalFlow, node } from "./diagram-layout.ts";
import { edge, type Scene } from "./types.ts";

const caching: Scene = {
	title: "缓存怎样省去查询",
	section: "缓存ttl-与错误结果",
	description:
		"沿应用实际使用的解析路径检查所需记录集。图把可用缓存抽象为一次判断，不假定应用、系统、转发器和递归服务都串行出现；实线是回答路径，虚线是缓存查询与补查依赖。",
	caption: "命中可用记录就能回答；未命中或已过期才需要补查，TTL 按记录集分别维护。",
	diagram: `flowchart TB
 query["应用查询所需名字与类型"] -.-> cache{"所需记录集<br/>有可用缓存？"}
 cache -->|有| answer["返回缓存答案<br/>无需本次访问权威"]
 cache -.->|无或已过期| lookup["递归解析器补查<br/>可利用已有委派缓存"]
 lookup --> save["保存得到的记录集<br/>按 TTL 计时"]
 save --> answer
 class query actor
 class cache,save state
 class lookup resource
 class answer result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["query", "cache", "answer"],
			activeEdges: [0, 1],
			durationMs: 5000,
			note: "可用缓存命中时直接回答，不必每次访问权威服务器。先确认实际应用采用哪条解析路径，不能把 dig 的结果当成浏览器缓存状态。",
		},
		{
			boxes: [],
			activeNodes: ["cache", "lookup"],
			activeEdges: [2],
			durationMs: 5000,
			note: "缺少所需记录或缓存已过期时，由递归解析器补查。若委派信息仍可用，可跳过根或 TLD，下一场景展开这种查询关系。",
		},
		{
			boxes: [],
			activeNodes: ["lookup", "save", "answer"],
			activeEdges: [3, 4],
			durationMs: 5000,
			note: "补查得到的记录集各自缓存并计时；A、AAAA、HTTPS 是不同查询类型。缓存命中只说明有可用答案，不代表刚刚从权威重新查询。",
		},
	],
};

const delegation: Scene = {
	title: "递归与迭代",
	diagramHeight: 312,
	description:
		"本图假设：Stub 委托递归服务解析一个名字，省略 CNAME 等分支。三台权威侧节点分别展示根、TLD 与目标权威；高亮箭头表示当前查询与应答的路径，不表示它们同时发生；缓存决定从哪里开始。",
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
		],
		edges: [
			edge("recursive", "M86 56 V82", true),
			edge("root", "M164 112 H190", active === 0),
			edge("tld", "M164 124 H180 V192 H190", active === 1),
			edge("auth", "M164 136 H174 V272 H190", active === 2),
			edge(
				"response",
				active === 0
					? "M196 124 H170"
					: active === 1
						? "M196 204 H186 V124 H170"
						: "M196 284 H186 V124 H170",
				true,
			),
			...(active === 2 ? [edge("answer", "M110 88 V62", true)] : []),
		],
	})),
};

export const scene: Scene = {
	...caching,
	chapters: [caching, logicalFlow(delegation)],
};

const sections = ["缓存ttl-与错误结果", "递归与迭代一次查询如何穿越层级"];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

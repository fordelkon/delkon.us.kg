import { node } from "./network-layout.ts";
import { edge, type Scene } from "./types.ts";

type ProxyStep = {
	entry: string;
	context: string;
	rule: string;
	outbound: "pending" | "direct" | "proxy" | "missing";
	state: string;
	note: string;
};

function proxyScene(title: string, description: string, steps: ProxyStep[]): Scene {
	return {
		title,
		description,
		diagramHeight: 392,
		caption:
			"入口提供数据，核心恢复上下文并匹配规则，再创建出站。DIRECT 仍经过核心；出站必须绕过接管路由。",
		frames: steps.map((step) => ({
			note: step.note,
			boxes: [
				node("inbound", 8, 8, 344, ["① Inbound · 应用 → 本地入口", step.entry], "client", true),
				node(
					"context",
					8,
					72,
					344,
					["② Context · 映射 / 嗅探 / 原始目标", step.context],
					"secure",
					true,
				),
				node(
					"rules",
					8,
					136,
					344,
					["③ Rule Engine · 域名 / IP / 进程", step.rule],
					"processing",
					true,
				),
				node(
					"direct",
					8,
					216,
					156,
					["④ DIRECT 出站", "核心 → 源站"],
					"delivery",
					step.outbound === "direct",
				),
				node(
					"proxy",
					196,
					216,
					156,
					["④ PROXY 出站", "核心 → 远端节点"],
					"secure",
					step.outbound === "proxy",
				),
				node(
					"origin",
					8,
					280,
					344,
					[
						"源站 · 独立连接的接收端",
						step.outbound === "proxy"
							? "节点另建连接 → 源站"
							: step.outbound === "direct"
								? "DIRECT：核心另建连接 → 源站"
								: "尚未建立出站连接",
					],
					"delivery",
					step.outbound === "direct" || step.outbound === "proxy",
				),
				node("state", 8, 344, 344, ["连接／映射状态", step.state], "processing", true),
			],
			edges: [
				edge("recover", "M180 56 V66", true),
				edge("match", "M180 120 V130", step.outbound !== "pending"),
				edge("direct", "M180 184 V200 H86 V210", step.outbound === "direct"),
				edge("proxy", "M180 200 H274 V210", step.outbound === "proxy"),
				edge("direct-origin", "M86 264 V274", step.outbound === "direct"),
				edge("node-origin", "M274 264 V274", step.outbound === "proxy"),
			],
		})),
	};
}

const explicit = proxyScene(
	"显式代理",
	"本图假设：TCP 隧道代理，不终止应用 TLS。应用经 CONNECT 或 SOCKS5 提供目标；数字 IP 地址类型不提供域名。粗边框和粗箭头标出本帧选中的路径。",
	[
		{
			entry: "CONNECT example.com:443",
			context: "协议直接提供 example.com",
			rule: "等待匹配",
			outbound: "pending",
			state: "应用 ⇄ 核心：入口连接已建立",
			note: "CONNECT 请求或 SOCKS5 域名类型提供目标名；入口 TCP 终止在本地代理。若 SOCKS5 传入的是数字 IP，就没有这份域名证据。",
		},
		{
			entry: "CONNECT / SOCKS5 域名入口",
			context: "目标域名已知，无需 Fake-IP",
			rule: "规则命中 → DIRECT",
			outbound: "direct",
			state: "两条 TCP：入口 + 核心直连源站",
			note: "DIRECT 是规则引擎选择的出站。核心另建到源站的连接，流量仍经过代理核心，不能把这条分支画成应用绕过代理。两段 TCP 不自动意味着两段 TLS。",
		},
		{
			entry: "另一条规则选择 PROXY",
			context: "目标域名交给选定出站",
			rule: "规则命中 → 远端节点",
			outbound: "proxy",
			state: "入口 / 核心到节点 / 节点到源站",
			note: "切换到 PROXY 分支：核心使用出站协议连接节点，节点再连接源站。这里假设独立 TCP 隧道；实际出站可能复用连接。核心出站使用绕过路由或平台策略，避免再次被 TUN 捕获。",
		},
	],
);

const tun = proxyScene(
	"普通 TUN",
	"本图假设：接管真实目标 IP 的三层包，由用户态网络栈与代理出站处理。图示域名恢复是有条件的，嗅探不等于 TLS 解密。",
	[
		{
			entry: "IP 包 → TUN → 用户态网络栈",
			context: "仅有目标 IP:Port",
			rule: "缺少域名，尚未选路",
			outbound: "pending",
			state: "IP 头没有原始域名",
			note: "TUN 读取三层 IP 包，不是 CONNECT 请求。用户态网络栈处理传输流，再交给代理规则；它不会凭目的 IP 自动知道应用最初使用的域名。",
		},
		{
			entry: "TUN 的真实 IP 流量",
			context: "嗅探到可见 SNI / HTTP Host",
			rule: "按可用域名线索 → PROXY",
			outbound: "proxy",
			state: "嗅探成功 ≠ 证书验证 ≠ 解密",
			note: "若配置允许且协议字段可见，嗅探可补充域名。DNS 关联也是一条线索；结果须按实现的覆盖和路由规则使用，不能把它当成已验证的应用身份。",
		},
		{
			entry: "IP 直连 / 自带 DoH / ECH",
			context: "域名不可恢复或证据不足",
			rule: "IP / 进程 / 兜底规则",
			outbound: "missing",
			state: "按配置直连、代理或拒绝",
			note: "ECH、IP 直连、绕过代理 DNS 或映射缺失都可能使域名恢复失败。此时按真实可用的信息与兜底规则处理，不应伪造域名；若创建出站，仍需绕过 TUN。",
		},
	],
);

const fake = proxyScene(
	"Fake-IP TUN",
	"本图假设：DNS 查询进入代理，IPv4 Fake-IP 198.18.0.8 的映射与连接进入同一核心。该地址只代表映射，不是源站地址；IPv6 是否分配映射另由实现与配置决定。",
	[
		{
			entry: "DNS：example.com → 198.18.0.8",
			context: "保存 198.18.0.8 ↔ example.com",
			rule: "尚未收到连接",
			outbound: "pending",
			state: "DNS 映射已创建或命中缓存",
			note: "代理 DNS 分配或复用 Fake-IP，并保存域名映射。此时只返回了 DNS 结果，还没有连接源站；命中缓存也必须保有对应映射。",
		},
		{
			entry: "应用连接 198.18.0.8 → TUN",
			context: "映射命中 → example.com",
			rule: "域名规则 → PROXY",
			outbound: "proxy",
			state: "远端按域名连接真实目标",
			note: "核心从 Fake-IP 查回目标名，按规则选择节点；需要地址的出站再解析真实目标。不能把虚拟地址发到公网当作源站。出站有独立生命周期和绕过路径。",
		},
		{
			entry: "旧 Fake-IP 连接再次进入 TUN",
			context: "映射丢失／过期，无法反查",
			rule: "恢复、重新解析或拒绝",
			outbound: "missing",
			state: "不能把未知 Fake-IP 当真实 IP 直连",
			note: "映射失效时按实现处理失败或恢复，不保证嗅探总能补救。应用自带 DoH 可能直接获得真实 IP，转入普通 TUN 分支；IPv6 也不能套用这里的 IPv4 映射。",
		},
	],
);

export const scene: Scene = { ...explicit, chapters: [explicit, tun, fake] };

const sections = [
	"显式代理http-connect-与-socks5-的工作边界",
	"透明接管tun-提供-ip-包域名需要额外关联",
	"找回域名fake-ip-与协议嗅探",
];

for (const [index, chapter] of (scene.chapters ?? []).entries()) {
	chapter.section = sections[index];
}

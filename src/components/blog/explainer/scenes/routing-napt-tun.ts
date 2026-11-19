import type { Scene } from "./types.ts";

const policy: Scene = {
	title: "先选表，再选最长前缀",
	section: "路由表与最长前缀匹配",
	description:
		"Linux 风格策略模型的一次成功查表：规则已选中一张含 /0、/1、/24 的表，目标为 192.168.1.50。分支是同表内的候选，不是包先后经过三个接口；未展开规则继续查询和拒绝路径。",
	caption: "策略限定查表上下文，最长前缀只在该表内比较匹配项。",
	diagram: `flowchart TB
 policy["源地址 / 标记 / 接口等条件<br/>规则选择查询表"]
 policy -.-> table["所选路由表<br/>目标 192.168.1.50"]
 table -.-> default["0.0.0.0/0 → 网关<br/>匹配，但范围最宽"]
 table -.-> wide["128.0.0.0/1 → TUN<br/>匹配，仍不够具体"]
 table --> lan["192.168.1.0/24 → LAN<br/>最长匹配，选中直连"]
 class policy,table state
 class default,wide resource
 class lan result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["policy", "table"],
			activeEdges: [0],
			durationMs: 5000,
			note: "先按规则选择本次查询上下文，再在所选表内查找。不能把不同策略表中的路由混在一起比较前缀长度。",
		},
		{
			boxes: [],
			activeNodes: ["table", "default", "wide", "lan"],
			activeEdges: [1, 2, 3],
			durationMs: 5000,
			note: "目标 .50 同时匹配 /0、128.0.0.0/1 与局域网 /24。三条箭头表示候选关系，包不会依次走过网关、TUN 和 LAN。",
		},
		{
			boxes: [],
			activeNodes: ["lan"],
			activeEdges: [3],
			durationMs: 5000,
			note: "本例 /24 最具体，因此选 LAN。若表中另有匹配的 /32，它还能胜过 /24；默认路由存在也不等于数据一定从默认出口发送。",
		},
	],
};

const napt: Scene = {
	title: "地址端口映射与回包",
	section: "nat多台内网设备如何共用一个公网-ip",
	description:
		"同一台 NAPT 路由器的两条示例映射，源站为 198.51.100.20:443。连线表示映射关联：出站把内网地址端口改为公网侧地址端口，回包按同一映射反向转换。返回还要求映射有效且过滤策略允许，映射记录不是新的 TCP 端点。",
	caption: "相同内网源端口可映射到不同公网端口，回包据映射恢复目的地址。",
	diagram: `flowchart TB
 a["主机 A<br/>192.168.1.10<br/>源端口 50001"]
 b["主机 B<br/>192.168.1.11<br/>源端口 50001"]
 subgraph nat[同一台 NAPT 路由器]
  ma["A 的映射<br/>203.0.113.5:61001"]
  mb["B 的映射<br/>203.0.113.5:61002"]
 end
 server["源站<br/>198.51.100.20:443"]
 a --- ma
 b --- mb
 ma --- server
 mb --- server
 class a,b actor
 class ma,mb state
 class server result`,
	frames: [
		{
			boxes: [],
			activeNodes: ["a", "b", "ma", "mb"],
			activeEdges: [0, 1],
			durationMs: 5000,
			note: "两台主机都用源端口 50001 访问同一服务。NAPT 维护不同地址端口的映射，让它们共用公网地址。",
		},
		{
			boxes: [],
			activeNodes: ["ma", "mb", "server"],
			activeEdges: [2, 3],
			durationMs: 5000,
			note: "源站分别看到 203.0.113.5:61001 和 :61002。路由器改写包头及相关校验和，但不会因此成为两端 TCP 的终止端。",
		},
		{
			boxes: [],
			activeNodes: ["server", "ma", "mb"],
			activeEdges: [0, 1, 2, 3],
			durationMs: 5000,
			note: "回包到达对应公网端口后，按有效映射恢复内网目的地址端口。映射、入向过滤与 TCP 连接状态承担不同职责。",
		},
	],
};

export const scene: Scene = {
	...policy,
	legend:
		"紫：规则／映射状态 · 橙：候选出口 · 绿：选中路径／接收端；高亮连线表示本步解释的选择或交付。",
	chapters: [policy, napt],
};

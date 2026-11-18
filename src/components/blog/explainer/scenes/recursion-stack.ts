import { chain, node, withRoles } from "./diagram-layout.ts";
import { box, edge, type Scene } from "./types.ts";

const phases = [
	{ stack: [3], result: "尚无返回值", note: "调用 sumTo(3)，保留 n=3，等待子调用。" },
	{ stack: [3, 2], result: "尚无返回值", note: "调用 sumTo(2)。外层 n=3 仍保存在自己的栈帧中。" },
	{ stack: [3, 2, 1], result: "尚无返回值", note: "调用 sumTo(1)，各层分别等待 child + n。" },
	{ stack: [3, 2, 1, 0], result: "基本情况", note: "sumTo(0) 命中基本情况，执行 return 0。" },
	{ stack: [3, 2, 1], result: "0 → child", note: "n=0 已出栈。n=1 恢复执行，计算 0 + 1 = 1。" },
	{ stack: [3, 2], result: "1 → child", note: "n=1 已出栈。n=2 恢复执行，计算 1 + 2 = 3。" },
	{ stack: [3], result: "3 → child", note: "n=2 已出栈。n=3 恢复执行，计算 3 + 3 = 6。" },
	{ stack: [], result: "最终返回 6", note: "所有调用均已返回。图中回顾各层结果，不再表示当前栈。" },
];

const frames = phases.map((phase) => ({
	note: phase.note,
	boxes: [
		...[3, 2, 1, 0].map((n, index) =>
			box(
				`frame-${n}`,
				12,
				8 + index * 60,
				188,
				phase.stack.includes(n)
					? [`sumTo(${n})`, n === phase.stack.at(-1) ? "当前执行" : `n=${n} · 等待 child`]
					: phase.stack.length === 0
						? [
								`已返回 sumTo(${n})`,
								n === 0 ? "基本情况：0" : `${((n - 1) * n) / 2} + ${n} = ${(n * (n + 1)) / 2}`,
							]
						: ["—", "无活动栈帧"],
				n === phase.stack.at(-1),
				!phase.stack.includes(n),
			),
		),
		box("result", 216, 68, 132, ["返回值", phase.result], true),
		box("order", 216, 188, 132, ["后进先出", phase.stack.length ? "底部为当前层" : "返回结果回顾"]),
	],
}));

const calls: Scene = {
	title: "调用栈与返回",
	section: "调用栈保存了什么",
	caption: "递进时各层保留自己的 n；命中基本情况后，子调用的返回值逐层参与加法。",
	description:
		"sumTo(3) 的逻辑调用栈：只保留尚未返回的调用，已返回的值单独展示。依次调用 3、2、1、0，每层保留各自的 n 和返回后待做的加法；0 返回后，1 计算 0+1=1，2 计算 1+2=3，3 计算 3+3=6。返回按后进先出顺序进行，基本情况只结束最内层调用。",
	frames: frames.map((frame) => ({
		...frame,
		boxes: frame.boxes.map((item) =>
			item.id.startsWith("frame-")
				? { ...item, tone: item.active ? ("actor" as const) : ("state" as const) }
				: item,
		),
	})),
};

const tree: Scene = {
	title: "分支与结果合并",
	section: "分解与合并用子问题结果求当前答案",
	diagramHeight: 312,
	description:
		"本图假设：有限无环的三节点树，A 的左右孩子为叶子 B、C。先用顺序写出的两个调用计算树高：空树为 0、叶子为 1；最后对照三种遍历位置。图中的分支不表示并行。",
	caption: "进入左子树时保留右分支，进入右子树时保留左结果；何时处理当前节点，决定遍历或合并顺序。",
	frames: (
		[
			[
				"等待左子树",
				"正在计算",
				"尚未调用",
				"leftHeight 尚未得到",
				"先求 height(B)。A 的调用尚未结束，保留 node=A 与返回后继续调用右子树的位置；不是同时运行左右两个函数。",
			],
			[
				"准备调用右子树",
				"返回 1",
				"即将调用",
				"保存 leftHeight = 1",
				"B 的两个空子树高度均为 0，返回 1。B 的栈帧结束，A 把结果保存在自己的 leftHeight，再开始右子树调用。",
			],
			[
				"等待右子树",
				"结果 1 已保留",
				"正在计算",
				"leftHeight=1，等待 rightHeight",
				"深入 C 时，A 不仅保存返回位置，也保留已经计算的左高度。分治需要的局部状态取决于返回后还有什么工作。",
			],
			[
				"合并左右结果",
				"高度 1",
				"返回高度 1",
				"1 + max(1, 1) = 2",
				"C 返回 1 后，A 才有两份结果，计算树高 2。每个节点只计算一次，调用栈保存的是当前路径，不能把所有访问过的节点都算成同时在栈中。",
			],
			[
				"遍历位置对照",
				"左孩子 B",
				"右孩子 C",
				"前序 ABC · 中序 BAC · 后序 BCA",
				"换一个任务看同一棵树：在左调用前处理 A 得前序，在两子调用之间处理得中序，两个子调用都返回后处理得后序。这些是独立遍历，不是高度计算额外产生的输出。",
			],
		] as const
	).map(([root, left, right, state, note], i) => ({
		note,
		boxes: [
			node("root", 102, 8, 156, ["根 A", root], "actor", i === 3 || i === 4),
			node(
				"left",
				8,
				104,
				156,
				["左子树 B", left],
				i >= 1 ? "result" : "actor",
				i === 0 || i === 1,
			),
			node(
				"right",
				196,
				104,
				156,
				["右子树 C", right],
				i >= 3 ? "result" : "actor",
				i === 2 || i === 3,
			),
			node("saved", 8, 200, 344, ["A 的保留状态 / 本帧结果", state], "state", true),
			node("contract", 8, 264, 344, ["返回位置决定继续做什么", "先左，再右，最后合并"], "control"),
		],
		edges: [
			edge("left-call", "M156 56 V80 H86 V98", i === 0),
			edge("right-call", "M204 56 V80 H274 V98", i === 2),
		],
	})),
};

const backtrack: Scene = {
	title: "回溯与共享状态恢复",
	section: "回溯选择探索与恢复",
	diagramHeight: 312,
	description:
		"本图把正文的全排列缩小为 {1,2}。remaining 按值构造，path 是共享可变路径；正常返回时必须恢复到本次调用进入时的路径。输出保存路径副本。",
	caption: "局部变量随调用结束，不意味着共享 path 自动恢复；选择、探索、撤销属于同一分支的责任。",
	frames: (
		[
			[
				"[]",
				"{1,2}",
				"根层：准备尝试 1",
				"尚无",
				"根调用开始，path 为空，remaining={1,2}。循环准备选择第一个候选；每层要保存自己的候选集合与循环进度。",
			],
			[
				"[1]",
				"{2}",
				"子层：准备尝试 2",
				"尚无",
				"根层 push(1)，构造子层的 remaining={2} 并递归。根层的循环暂停，保留返回后 pop(1) 并尝试 2 的责任。",
			],
			[
				"[1,2]",
				"{}",
				"基本情况：收集副本",
				"[1,2]",
				"子层 push(2)，递归到 remaining 为空，保存 path 的副本 [1,2]。基本情况只结束当前调用，不会自动撤销之前的 push。",
			],
			[
				"[1]",
				"{2}",
				"返回子层：pop(2)",
				"[1,2]",
				"返回后，选择 2 的那一层执行 pop(2)，恢复到进入该分支之前的 [1]。子层循环结束，再返回根层。",
			],
			[
				"[]",
				"{1,2}",
				"返回根层：pop(1)",
				"[1,2]",
				"根层执行 pop(1)，path 回到 []，随后循环前进到候选 2。若省略恢复，第二个分支会继承错误的前缀。",
			],
			[
				"[2]",
				"{1}",
				"第二分支：尝试 1",
				"[1,2]",
				"根层选择 2，子层剩下 1。按值传递的 remaining 自然属于各自调用；共享 path 仍需显式恢复。",
			],
			[
				"[2,1]",
				"{}",
				"基本情况：收集副本",
				"[1,2]、[2,1]",
				"收集第二个排列 [2,1]。结果容器保留已经完成的答案，不跟随 path 的撤销而删除这些副本。",
			],
			[
				"[]",
				"{1,2}",
				"各层恢复，根调用结束",
				"两个排列均保留",
				"依次返回并 pop(1)、pop(2)，最终 path 恢复为空。回溯撤销当前路径；图的全局 visited 和记忆化缓存却通常应跨分支保留，不能混用同一撤销规则。",
			],
		] as const
	).map(([path, remaining, action, result, note]) => ({
		note,
		boxes: [
			node("path", 8, 8, 156, ["共享 path", path], "state", true),
			node("remaining", 196, 8, 156, ["当前层 remaining", remaining], "actor", true),
			node("action", 8, 104, 344, ["调用 / 返回后的动作", action], "control", true),
			node("result", 8, 184, 344, ["已保存的输出副本", result], "result"),
			node(
				"invariant",
				8,
				264,
				344,
				["每层正常返回的契约", "共享路径恢复为进入这一层时的状态"],
				"state",
			),
		],
		edges: [],
	})),
};

const memo: Scene = {
	title: "记忆化与状态复用",
	section: "记忆化复用重复子问题的结果",
	diagramHeight: 312,
	description:
		"本图假设：顺序计算 F(5)，F(0)=0、F(1)=1，缓存键 n 足以决定答案。只展开 F(5)、F(4)、F(3) 的依赖，较小子问题略去；缓存的是已完成结果。",
	caption: "记忆化复用答案，显式栈保存待办，回溯恢复路径；三者解决不同的问题。",
	frames: (
		[
			[
				"等待 F(4)",
				"需要 F(3)",
				"第一次求解",
				"尚未缓存",
				"F(5) 先调用 F(4)，而 F(4) 又需要 F(3)。不同路径会再次遇到同一个 n，朴素递归会重复展开这些子问题。",
			],
			[
				"保存 F(4)=3",
				"已返回 3",
				"F(3)=2 已完成",
				"memo[3] = 2",
				"第一次完整计算 F(3) 后缓存 2，再合并得到 F(4)=3。只有结果已经完成，才可把它当作后续可直接复用的答案。",
			],
			[
				"右支求 F(3)",
				"结果 3 已保留",
				"命中缓存，返回 2",
				"命中后不再展开子调用",
				"F(5) 的第二个子调用 F(3) 命中 memo[3]，直接返回 2，无需再次展开 F(2) 与 F(1)。根调用用 3+2 得到 5。",
			],
			[
				"最终 F(5)=5",
				"不同状态各算一次",
				"同状态共享完成值",
				"缓存与最长依赖链仍占空间",
				"缓存把重叠子问题合并为可复用状态，本例时间降为线性，但缓存和调用链仍需线性辅助空间。仅改成显式栈，不会自动消除重复计算。",
			],
		] as const
	).map(([five, four, three, cache, note], i) => ({
		note,
		boxes: [
			node("five", 102, 8, 156, ["F(5)", five], "actor", true),
			node("four", 8, 104, 156, ["F(4)", four], "actor", i < 2),
			node("three", 196, 104, 156, ["F(3)", three], "actor", true),
			node("cache", 8, 200, 344, ["跨分支缓存", cache], "state", i > 0),
			node(
				"result",
				8,
				264,
				344,
				["根调用结果", i >= 2 ? "3 + 2 = 5" : "等待两个子问题"],
				"result",
				i >= 2,
			),
		],
		edges: [
			edge("left", "M156 56 V80 H86 V98", i < 2),
			edge("right", "M204 56 V80 H274 V98", i === 2),
			edge("repeated", "M164 128 H190", i === 0),
			edge("cache", "M274 152 V194", i === 2),
		],
	})),
};

const explicit: Scene = {
	title: "显式栈与继续位置",
	section: "显式栈与继续执行的位置",
	description:
		"本图假设：同一棵 A(B,C) 树做后序遍历。栈从左到右为底到顶，T 表示子树已展开、待输出当前节点，F 表示尚未展开；省略空孩子的入栈与弹出。",
	caption:
		"消除函数递归不等于消除待完成状态；显式记录返回位置、分支进度和必要的部分结果，才能保持同样的行为。",
	frames: (
		[
			[
				"[(A,F)]",
				"弹出 A，发现尚未展开",
				"尚无输出",
				"显式栈从 (A,false) 开始。isExpanded 把原先藏在返回位置里的“下一步做什么”变成一份明确状态。",
			],
			[
				"[(A,T),(C,F),(B,F)]",
				"先压根待办，再右、再左",
				"尚无输出",
				"把 A 的输出待办压回，再压 C、B。栈是后进先出，所以下一次处理 B；图中的待办记录不全是正在执行的函数调用。",
			],
			[
				"[(A,T),(C,F)]",
				"完成 B 的子树后输出 B",
				"B",
				"B 是叶子，处理空孩子后再次弹出 (B,true)，输出 B。A 的待办与未访问的 C 留在容器中。",
			],
			[
				"[(A,T)]",
				"完成 C 后输出 C",
				"B C",
				"以同样方式处理 C，输出 C，剩下的 A 带着 true 标记，表示两个子树均已展开并处理完成。",
			],
			[
				"[]",
				"弹出 (A,T)，输出 A",
				"B C A",
				"最后输出 A，显式栈清空，与递归后序得到相同顺序。状态改存在容器里，不会自动把辅助空间降为常量；求树高还需保存部分高度。",
			],
		] as const
	).map(([stack, action, result, note]) => ({
		note,
		boxes: [
			node("stack", 8, 8, 344, ["显式栈 · 左为栈底，右为栈顶", stack], "state", true),
			node("action", 8, 88, 344, ["当前动作", action], "actor", true),
			node("output", 8, 168, 344, ["输出序列", result], "result", true),
		],
		edges: [
			edge("pop", "M180 56 V82", true),
			edge("visit", "M180 136 V162", result !== "尚无输出"),
		],
	})),
};

const machine: Scene = {
	title: "逻辑栈与机器实现",
	section: "从调用模型到-aarch64-实现",
	diagramHeight: 248,
	description:
		"本图假设：正文的 AArch64 非叶子函数示例，省略具体栈槽偏移。逻辑调用模型不等于固定机器栈布局；优化、目标平台和 ABI 会改变实际存储方式。",
	caption:
		"跨调用保存的是以后还要用的状态；源码 return 先求值与清理，机器 RET 才完成最后的控制流返回。",
	frames: [
		chain(
			[
				["调用前：当前 n=3", "保留本层参数和返回位置"],
				["参数寄存器 w0", "传入子问题 n-1 = 2"],
				["BL 调用", "跳到函数入口，并写入返回地址 LR"],
				["跨调用存活的状态", "可保存在栈槽或被调用者保存寄存器"],
			],
			1,
			"递归仍是普通函数调用：当前层先保留子调用后还要用的 n 和返回位置，再把 n-1 放入参数寄存器。再次 BL 会覆盖 LR，因此非叶子函数需按约定保存原返回地址。",
			["actor", "state", "control", "state"],
		),
		chain(
			[
				["子调用返回", "w0 带回 sumTo(2)=3"],
				["恢复本层 n=3", "计算 child+n = 3+3 = 6"],
				["准备返回与清理", "将结果放入返回值位置，完成必要析构"],
				["恢复现场并 RET", "恢复返回地址与栈状态，跳回调用者"],
			],
			2,
			"子调用返回只完成了子问题。当前层还要用保存的 n 做加法，并完成本层退出所需的清理。源码中的 return 不等于遇到它就立即执行机器 RET。",
			["result", "actor", "control", "result"],
		),
		chain(
			[
				["逻辑模型", "描述仍需完成的操作与状态"],
				["实际机器布局", "由 ABI、寄存器分配和编译选项决定"],
				["尾调用或改写成循环", "可改变栈增长，但 C++ 不保证尾调用优化"],
				["工程选择", "显式栈也仍需为待办状态分配空间"],
			],
			3,
			"不能把每个逻辑调用都当作必然分配固定字节数的机器栈帧。普通 sumTo 在返回后还有加法；累加器改变状态传递方式，而是否做尾调用优化仍取决于具体编译结果。",
			["state", "control", "actor", "result"],
			false,
		),
	],
};

export const scene: Scene = {
	...calls,
	legend: "蓝：当前调用／动作 · 橙：等待／待办 · 紫：保留状态 · 绿：返回值／结果",
	chapters: [
		withRoles(calls, {
			"frame-3": "state",
			"frame-2": "state",
			"frame-1": "state",
			"frame-0": "state",
			result: "result",
			order: "control",
		}),
		tree,
		backtrack,
		memo,
		explicit,
		machine,
	],
};

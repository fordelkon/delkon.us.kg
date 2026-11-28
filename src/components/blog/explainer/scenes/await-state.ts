import { controlEdge, EXECUTION_LEGEND, node } from "./diagram-layout.ts";
import { label, mark } from "./examples.ts";
import { type Box, edge, type Frame, type Scene } from "./types.ts";

function slot(
	id: string,
	x: number,
	text: string,
	tone: NonNullable<Box["tone"]>,
	active = false,
	muted = false,
): Box {
	return { ...mark(id, x, 104, 106, 44, text, "cell", active), tone, muted };
}

const frames: Frame[] = [
	{
		note: "tx.send(v).await 在开始轮询时已把 v 移入发送 Future；队列满时消息虽未入队，调用者也已交出 v。",
		boxes: [
			label("mode", 180, 16, "方案一：tx.send(v).await（值移入 Future）", 340),
			node("caller-hdr", 8, 40, 106, ["外层调用者", "select! 外层"], "actor"),
			node("fut-hdr", 127, 40, 106, ["Future", "等待空位"], "state", true),
			node("chan-hdr", 246, 40, 106, ["mpsc 队列", "容量已满"], "control"),
			slot("v-caller", 8, "v 已移出", "actor", false, true),
			slot("v-fut", 127, "持有 v", "state", true),
			slot("chan-slot", 246, "无空位", "control", false, true),
			node(
				"summary",
				8,
				174,
				344,
				["所有权现状：v 在 send Future 内", "队列满时虽未发出，外层已失去 v"],
				"state",
				true,
			),
		],
		edges: [edge("move-v", "M114 126 H125", true)],
	},
	{
		note: "若 select! 的取消分支先就绪，未完成的 send Future 被丢弃，其中的 v 随之析构，外层无法重试这份值。",
		boxes: [
			label("mode", 180, 16, "方案一：select! 取消 send(v) Future", 340),
			node("caller-hdr", 8, 40, 106, ["外层调用者", "取消分支胜出"], "actor"),
			node("fut-hdr", 127, 40, 106, ["Future", "被丢弃析构"], "control", true),
			node("chan-hdr", 246, 40, 106, ["mpsc 队列", "未收到消息"], "control"),
			slot("v-caller", 8, "无法取回", "actor", false, true),
			slot("v-fut", 127, "Drop 销毁 v", "control", true),
			slot("chan-slot", 246, "未入队", "control", false, true),
			node(
				"summary",
				8,
				174,
				344,
				["取消不安全：v 随 Future 析构丢失", "中断后无法再拿回同一份 v 重试"],
				"control",
				true,
			),
		],
	},
	{
		note: "改用 tx.reserve().await：Future 只预约通道容量许可，v 始终留在外层；即使取消等待，也只丢弃排队位置。",
		boxes: [
			label("mode", 180, 16, "方案二：tx.reserve().await（只预约许可）", 340),
			node("caller-hdr", 8, 40, 106, ["外层调用者", "保留 v"], "result", true),
			node("fut-hdr", 127, 40, 106, ["Future", "仅等许可"], "state", true),
			node("chan-hdr", 246, 40, 106, ["mpsc 队列", "容量已满"], "control"),
			slot("v-caller", 8, "保留 v", "result", true),
			slot("v-fut", 127, "仅等 permit", "state", true),
			slot("chan-slot", 246, "无空位", "control", false, true),
			node(
				"summary",
				8,
				174,
				344,
				["select! 取消时只放弃排队位置", "v 仍完好留在外层，可安全重试或返回"],
				"result",
				true,
			),
		],
		edges: [controlEdge("wait-cap", "M233 126 H244", true)],
	},
	{
		note: "reserve() 返回 permit 后，立即同步调用 permit.send(v) 提交入队；中间没有 .await，不再被 select! 中断。",
		boxes: [
			label("mode", 180, 16, "方案二：取得 permit 后同步提交", 340),
			node("caller-hdr", 8, 40, 106, ["外层调用者", "交出 v"], "actor"),
			node("fut-hdr", 127, 40, 106, ["已获许可", "无 .await"], "result", true),
			node("chan-hdr", 246, 40, 106, ["mpsc 队列", "腾出空位"], "result", true),
			slot("v-caller", 8, "交出 v", "actor", false, true),
			slot("v-fut", 127, "同步提交", "result", true),
			slot("chan-slot", 246, "收到 v", "result", true),
			node(
				"summary",
				8,
				174,
				344,
				["permit.send(v) 是同步调用", "取得容量后原子完成移交，不再丢失值"],
				"result",
				true,
			),
		],
		edges: [edge("commit-1", "M114 126 H125", true), edge("commit-2", "M233 126 H244", true)],
	},
];

export const scene: Scene = {
	title: "取消时 v 归谁：send(v).await 与 reserve().await",
	section: "取消安全中断后能否重来",
	legend: EXECUTION_LEGEND,
	caption: "取消安全先看值由谁拥有；消息尚未入队，不代表调用者还能拿回它。",
	description:
		"对照 Tokio 有界 mpsc 通道已满且 select! 取消等待时的所有权边界：tx.send(v).await 把 v 移入 Future，取消会导致 v 随 Future 析构；tx.reserve().await 只等待容量许可，v 留在外层直到同步执行 permit.send(v)。",
	frames,
};

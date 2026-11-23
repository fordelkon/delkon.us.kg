import { example, frame, label, mark } from "./examples.ts";
import { type Box, type Edge, edge } from "./types.ts";

type Value = string | number;

function list(id: string, values: Value[], y: number, active: number[] = []): [Box[], Edge[]] {
	const x = (360 - (values.length * 60 - 18)) / 2;

	const boxes = values.map((value, index) =>
		mark(
			`${id}-${index}`,
			x + index * 60,
			y - 18,
			42,
			36,
			String(value),
			"cell",
			active.includes(index),
		),
	);

	const edges = boxes
		.slice(1)
		.map((box, index) => edge(`${id}-next-${index}`, `M${box.x - 18} ${y} H${box.x - 2}`));

	return [boxes, edges];
}

function lists(note: string, rows: [title: string, values: Value[]][], active: number[] = []) {
	const layout = rows.map(([title, values], index) => {
		const y = 47 + index * 68;
		const [boxes, edges] = list(`list-${index}`, values, y, active);

		return { boxes: [label(`title-${index}`, 180, y - 30, title, 250), ...boxes], edges };
	});

	return frame(
		note,
		layout.flatMap((row) => row.boxes),
		layout.flatMap((row) => row.edges),
	);
}

const [shared] = list("shared", [8, 9, "∅"], 86, [0]);
const [randomNodes, randomNext] = list("random", [7, 13, 4, "∅"], 55, [1]);

export const listExamples = {
	"add-two-numbers": example(
		"对应位相加与进位",
		"链表从低位到高位存储，进位随 next 向下一位传递。",
		208,
		lists("个数位 9 + 1 = 10，写 0 并进 1。十位 9 + 0 + 1 = 10，写 0，最后补进位节点 1。", [
			["加数 99", [9, 9, "∅"]],
			["加数 1", [1, "∅"]],
			["结果 100", [0, 0, 1, "∅"]],
		]),
	),
	"linked-list-intersection": example(
		"链表相交于同一节点",
		"两条链共用从 8 开始的尾部。",
		151,
		frame(
			"A 与 B 各自的头节点都存 1，却是不同对象。只有两条链都指向同一个 8 时才算相交。",
			[
				label("head-a", 24, 36, "A", 30),
				label("head-b", 24, 120, "B", 30),
				mark("a", 50, 18, 42, 36, "1", "cell"),
				mark("b", 50, 102, 42, 36, "1", "cell"),
				...shared.map((box) => ({ ...box, x: box.x + 68 })),
			],
			[
				edge("a-shared", "M94 36 Q135 36 164 74"),
				edge("b-shared", "M94 120 Q135 120 164 94"),
				edge("8-9", "M209 86 H225"),
				edge("9-null", "M269 86 H285"),
			],
		),
	),
	"palindrome-linked-list": example(
		"链表回文判定",
		"从中点断开并反转后半段，再逐对比较。",
		143,
		lists("原链表在第一个 2 后切开，后半段从 2 → 1 反转为 1 → 2。两段对应值一致。", [
			["原链表", [1, 2, 2, 1, "∅"]],
			["反转后的后半段", [1, 2, "∅"]],
		]),
	),
	"remove-nth-node-from-end": example(
		"删除倒数第 N 个节点",
		"快指针先走两步。同步推进到快指针位于尾节点时，慢指针停在待删节点的前驱。",
		143,
		lists(
			"取 n=2。快指针从哨兵先走到 2，再随慢指针走到尾节点 4。此时慢指针在 2，把它的 next 改为 4。",
			[
				["删除前（粗框为待删节点）", [0, 1, 2, 3, 4, "∅"]],
				["删除后（0 为哨兵）", [0, 1, 2, 4, "∅"]],
			],
			[3],
		),
	),
	"reverse-nodes-in-k-group": example(
		"每 k 个一组反转",
		"只反转完整的组，重新接好组间的 next。",
		143,
		lists("k=2 时，第一组 1、2 与第二组 3、4 分别翻转。最后一个节点 5 留在原处。", [
			["反转前", [1, 2, 3, 4, 5, "∅"]],
			["反转后", [2, 1, 4, 3, 5, "∅"]],
		]),
	),
	"sort-list": example(
		"链表归并排序",
		"合并时只比较两条已排序子链的头节点。",
		209,
		lists("两段 [1,4] 和 [2,3] 比较头节点，依次摘接 1、2、3，最后接上剩余的 4。", [
			["左段", [1, 4, "∅"]],
			["右段", [2, 3, "∅"]],
			["归并结果", [1, 2, 3, 4, "∅"]],
		]),
	),
	"merge-k-sorted-lists": example(
		"合并多条有序链表",
		"小顶堆先取所有候选头节点中最小的，再让它的后继成为候选。",
		210,
		lists(
			"三个候选头分别为 1、2、3。先取出 1 接入结果，再从同一条链放入后继 4，下一轮会取 2。",
			[
				["三条输入链", [1, 4, "∅"]],
				["", [2, 5, "∅"]],
				["", [3, 6, "∅"]],
			],
			[0],
		),
	),
	"copy-list-with-random-pointer": example(
		"链表的随机引用",
		"实线为 next，虚线为 random。复制时，虚线的两端都必须改成对应的新节点。",
		137,
		frame(
			"节点 13 的 random 指回 7。按旧节点身份查表，把新节点 13 的 random 接到新节点 7。",
			[...randomNodes, label("random-label", 135, 115, "random")],
			[...randomNext, { ...edge("random", "M150 74 Q135 108 99 76", true), dashed: true }],
		),
	),
};

import { example, frame, label, mark } from "./examples.ts";

const values = [3, 2, 5, 1];

const layers = values.map(
	(value, index) => [value, Math.min(...values.slice(0, index + 1))] as const,
);

function stack(count: number, note: string) {
	const boxes = layers.slice(0, count).flatMap(([value, minimum], index) => {
		const y = 142 - index * 36;
		const top = index === count - 1;

		return [
			mark(`value-${index}`, 96, y, 67, 36, String(value), "cell", top),
			mark(`minimum-${index}`, 163, y, 85, 36, String(minimum), "cell", top),
			...(top ? [label("top", 289, y + 18, "栈顶", 60)] : []),
		];
	});

	return frame(note, [
		label("value", 129, 17, "值", 58),
		label("minimum", 205, 17, "最小值", 80),
		...boxes,
	]);
}

export const sequenceExamples = {
	"min-stack": example(
		"弹出最小值时，下一层已经记住答案",
		"每层同时保存入栈值和当时的最小值。栈顶移动一层，getMin() 读取的位置也随之移动。",
		190,
		stack(3, "依次压入 3、2、5。栈顶的 5 旁边记着 2，表示这三层中的最小值。"),
		stack(4, "压入 1 时，比较 1 和旧最小值 2。新的一层写入 (1, 1)，下面三层保持原样。"),
		stack(3, "弹出 (1, 1)，原来的 (5, 2) 重新露出。直接读取这一层的 2 就能得到最小值。"),
	),
};

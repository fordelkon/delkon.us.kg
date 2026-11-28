import { label, mark } from "./examples.ts";
import type { Frame, Scene } from "./types.ts";

function trace(n: number): Frame[] {
	const stack: number[] = [];
	const frames: Frame[] = [];

	function snapshot(action: string, note: string) {
		const top = stack.length - 1;
		const y = (index: number) => 140 - index * 44;

		const boxes = stack.map((value, index) =>
			mark(
				`frame-${value}`,
				72,
				y(index),
				278,
				44,
				`sumTo(${value})　${index === top ? action : `等返回值 + ${value}`}`,
				"cell",
				index === top,
			),
		);

		const pointerY = y(top) + 22;
		boxes.push(label("top", 23, pointerY, "栈顶", 44));
		frames.push({ note, boxes, edges: [{ id: "stack-pointer", path: `M46 ${pointerY} H68` }] });
	}

	function call(value: number): number {
		stack.push(value);

		if (value === 0) {
			snapshot("返回 0", "到达基本情况。sumTo(0) 返回 0，下面三层各自还留着一次加法。");
			stack.pop();

			return 0;
		}

		snapshot(
			"调用下一层",
			`sumTo(${value}) 还要加 ${value}。它先调用 sumTo(${value - 1})，把这次加法留在自己的栈帧里。`,
		);
		const childResult = call(value - 1);
		const result = childResult + value;
		snapshot(
			`${childResult} + ${value} = ${result}`,
			`子调用返回 ${childResult}，sumTo(${value}) 恢复，取出本层保留的 ${value}，返回 ${result}。`,
		);
		stack.pop();

		return result;
	}

	const result = call(n);
	frames.push({
		note: "sumTo(3) 已返回给调用方。图中这四次 sumTo 调用的栈帧都已退出。",
		boxes: [
			label("empty", 180, 70, "调用栈已清空", 290),
			mark("result", 72, 108, 216, 44, `返回给调用方：${result}`, "cell", true),
		],
	});

	return frames;
}

export const scene: Scene = {
	title: "每次递归调用留下的加法",
	diagramHeight: 194,
	caption:
		"粗框标出正在执行的栈顶。进入子调用时，上一层留下自己的加法；返回后，只有紧挨着的那一层恢复。",
	description:
		"sumTo(3) 依次压入 3、2、1、0 四层。0 是基本情况，返回 0。其余层各自从栈顶恢复，将子调用结果分别加 1、2、3，依次返回 1、3、6。",
	frames: trace(3),
};

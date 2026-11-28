import { label, mark } from "./examples.ts";
import type { Scene } from "./types.ts";

function track(id: string, y: number, cpu: string, tasks: string[]) {
	return [
		label(`${id}-cpu`, 62, y + 16, cpu, 116),
		...tasks.map((task, slot) =>
			mark(`${id}-${slot}`, 130 + slot * 54, y, 54, 32, task, "cell", task === "B"),
		),
	];
}

export const scene: Scene = {
	title: "两个任务何时同时执行",
	diagramHeight: 154,
	caption: "沿一行看同一个 CPU 先后执行了谁，沿一列看同一时刻有几个任务正在执行。",
	description:
		"设任务 A 和 B 各需要两个等长时间片。一个逻辑 CPU 依次执行 A、B、A、B。两个逻辑 CPU 可以在头两个时间片分别运行 A 和 B。每列对齐同一个时间片。",
	frames: [
		{
			note: "A 和 B 各需两个时间片，图中忽略切换开销。",
			boxes: [
				label("time", 238, 12, "时间片从左往右", 220),
				...track("single", 30, "单 CPU", ["A", "B", "A", "B"]),
				...track("first", 80, "双 CPU · 1", ["A", "A"]),
				...track("second", 118, "双 CPU · 2", ["B", "B"]),
			],
		},
	],
};

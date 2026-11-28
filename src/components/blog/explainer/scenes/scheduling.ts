import { EXECUTION_LEGEND, withRoles } from "./diagram-layout.ts";
import { box, type Scene } from "./types.ts";

const trace = ["A", "B", "B", "A"];

const frames = [0, 1, 2, 3, 4].map((step) => ({
	note:
		step === 4
			? "同一列是同一时刻：单核交错，双核同时推进。格子不表示实际耗时。"
			: `观察第 ${step + 1} 个时间片；切换可来自抢占或主动让出。`,
	boxes: [
		box("single", 8, 8, 80, ["单核", "CPU 0"]),
		box("parallel-a", 8, 104, 80, ["双核", "CPU 0"]),
		box("parallel-b", 8, 176, 80, ["双核", "CPU 1"]),
		...trace.flatMap((task, column) => [
			box(
				`single-${column}`,
				98 + column * 64,
				8,
				54,
				[String(column + 1), task],
				step === column || step === 4,
				column > step,
			),
			box(
				`a-${column}`,
				98 + column * 64,
				104,
				54,
				[String(column + 1), "A"],
				step === column || step === 4,
				column > step,
			),
			box(
				`b-${column}`,
				98 + column * 64,
				176,
				54,
				[String(column + 1), "B"],
				step === column || step === 4,
				column > step,
			),
		]),
	],
}));

const timeline: Scene = {
	title: "并发与并行",
	section: "并发与并行",
	legend: EXECUTION_LEGEND,
	caption: "单核上的并发任务交错推进；有多个执行资源时，它们还可以同时执行。",
	description:
		"一种可能的执行轨迹，横向是时间，每格表示正在执行的任务。单核先后执行 A、B、B、A，同一时刻只执行一个；双核各运行一个任务，同一列的 A 与 B 同时执行。高亮逐列推进，再保留完整轨迹。切换可以来自抢占，也可以来自协作式让出，不保证严格轮换；格子不代表耗时测量。",
	frames: frames.map((frame) => ({
		...frame,
		boxes: frame.boxes.map((item) => ({
			...item,
			tone:
				item.id.startsWith("single-") || item.id.startsWith("a-") || item.id.startsWith("b-")
					? ("actor" as const)
					: ("control" as const),
		})),
	})),
};

export const scene: Scene = withRoles(timeline, {
	single: "control",
	"parallel-a": "control",
	"parallel-b": "control",
});

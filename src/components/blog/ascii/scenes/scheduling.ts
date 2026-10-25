import { center, type Scene } from "./types.ts";

const trace = ["A", "B", "B", "A"];

export const scheduling: Scene = {
	caption: "并发让多个任务交错推进；有多个执行资源时，它们还可以并行。",
	description:
		"一种可能的执行轨迹，横向是时间，每格表示正在执行的任务。单核先后执行 A、B、B、A，同一时刻只执行一个；双核各运行一个任务，同一列的 A 与 B 同时执行。高亮逐列推进，再保留完整轨迹。切换可以来自抢占，也可以来自协作式让出，不保证严格轮换；格子不代表耗时测量。",
	frames: [1, 2, 3, 4, 4].map((count, index) => {
		const complete = index === 4;
		const start = 11 + (count - 1) * 3;

		return {
			durationMs: complete ? 2400 : 1800,
			rows: [
				center("CONCURRENT / 1 CPU", 30),
				"            1  2  3  4 time ->",
				`    CPU 0  ${trace
					.slice(0, count)
					.map((task) => `[${task}]`)
					.join("")}`,
				center("one task at a time", 30),
				"",
				center("PARALLEL / 2 CPUs", 30),
				`    CPU 0  ${"[A]".repeat(count)}`,
				`    CPU 1  ${"[B]".repeat(count)}`,
				center("same column = same time", 30),
				"",
				center("switch: preempt OR yield", 30),
			],
			active: complete ? [3, 8] : [],
			emphasis: [2, 6, 7].map((row) => ({
				row,
				start: complete ? 11 : start,
				end: complete ? 23 : start + 3,
			})),
		};
	}),
};

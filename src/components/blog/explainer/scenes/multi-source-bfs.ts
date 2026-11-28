import { example, frame, grid, label } from "./examples.ts";

const arrival = [
	[0, 1, 2],
	[1, 2, null],
	[null, 1, 0],
];

const notes = [
	"第 0 分钟，两端的两个源同时入队，网格里还有五个新鲜橘子。",
	"两端同时向相邻格扩散。三个橘子在第 1 分钟腐烂，这一批要等下一轮才能继续向外扩散。",
	"第 2 分钟，中央与右上角最后变色。此时新鲜数已经归零，计时停止。",
];

export const scene = example(
	"每个橘子到最近腐烂源有多远",
	"数字记录该格首次腐烂的分钟，· 表示空地。每过一分钟，粗框就向四邻域推进一层。",
	191,
	...notes.map((note, minute) => {
		const fresh = arrival.flat().filter((time) => time !== null && time > minute).length;

		const values = arrival.map((row) =>
			row.map((time) => (time === null ? "·" : time > minute ? "鲜" : time)),
		);

		const frontier = arrival.map((row) =>
			row.flatMap((time, index) => (time === minute ? [index] : [])),
		);

		return frame(note, [
			label("clock", 111, 19, `第 ${minute} 分钟`, 120),
			label("fresh", 252, 19, `新鲜 ${fresh} 个`, 126),
			...grid(values, 43, frontier, 46),
		]);
	}),
);

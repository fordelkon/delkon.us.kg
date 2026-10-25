import { center, type Frame, type Scene } from "./types.ts";

const rows = [
	center("ONE-TIME PUBLICATION", 33),
	"  THREAD A            THREAD B",
	"payload = 42",
	"     | before",
	"     v",
	"ready = true -----> ready == true",
	"  Release              Acquire",
	"         reads THIS store |",
	"                          v",
	"                    payload == 42",
	"",
	center("Relaxed flag: no publication edge", 33),
] satisfies [string, ...string[]];

function mark(row: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, text: string) {
	const start = rows[row].indexOf(text);

	return { row, start, end: start + text.length };
}

const stages: NonNullable<Frame["emphasis"]>[] = [
	[mark(2, "payload = 42")],
	[mark(3, "| before"), mark(4, "v"), mark(5, "ready = true"), mark(6, "Release")],
	[mark(5, "ready == true"), mark(6, "Acquire")],
	[mark(5, "----->"), mark(7, "reads THIS store")],
	[mark(7, "|"), mark(8, "v"), mark(9, "payload == 42")],
	[],
];

export const atomicPublication: Scene = {
	caption: "先写数据，再用 Release 发布；Acquire 读到该发布值后，后续读取得到 42。",
	description:
		"一次性发布且不再改写数据：A 先以 Relaxed 写入原子 payload=42，再以 Release 写 ready=true；B 的 Acquire 读取观察到这次 true 后，后续以 Relaxed 读取 payload 必须得到 42。图中横向边依赖读到对应写入，纵向边是线程内顺序，共同建立 happens-before；只用 Relaxed 标志不能建立这条发布链。",
	frames: stages.map((stage, index) => {
		const complete = index === stages.length - 1;
		const hasReadPayload = index >= stages.length - 2;

		return {
			durationMs: complete ? 3200 : index === 3 ? 2600 : 2000,
			rows: rows.map((row, rowIndex) =>
				hasReadPayload && rowIndex === 10 ? center("write -- happens-before --> read", 33) : row,
			),
			active: hasReadPayload ? [10] : [],
			emphasis: complete
				? [mark(6, "Release"), mark(6, "Acquire"), mark(9, "payload == 42")]
				: stage,
		};
	}),
};

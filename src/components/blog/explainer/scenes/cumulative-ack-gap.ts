import { label, mark } from "./examples.ts";
import type { Frame, Scene } from "./types.ts";

const firstSeq = 1001;

const arrivals = [
	{ segment: [1001, 1002], note: "1001、1002 已经连成一段。接收端确认到下一个期望的序号 1003。" },
	{
		segment: [1005, 1006],
		note: "1005、1006 先到，但 1003 处仍有缺口。即使暂存了末尾两字节，累计 ACK 仍是 1003。",
	},
	{
		segment: [1003, 1004],
		note: "1003、1004 补齐后，先前暂存的末尾两字节也接上了。累计 ACK 一次前移到 1007。",
	},
];

function receive(): Frame[] {
	const buffered = new Set<number>();

	return arrivals.map(({ segment, note }) => {
		for (const seq of segment) buffered.add(seq);
		let next = firstSeq;

		while (buffered.has(next)) next++;

		const prefixWidth = (next - firstSeq) * 56;
		const boundary = 12 + prefixWidth;

		return {
			note,
			boxes: [
				label("title", 180, 14, "接收端的字节序号", 330),
				...Array.from({ length: 6 }, (_, i) => {
					const seq = firstSeq + i;
					const x = 12 + i * 56;

					return [
						label(`seq-${seq}`, x + 28, 50, String(seq), 54),
						mark(
							`byte-${seq}`,
							x,
							70,
							56,
							38,
							buffered.has(seq) ? "已收" : "空",
							"cell",
							segment.includes(seq),
						),
					];
				}).flat(),
				mark("prefix", 12, 117, prefixWidth, 10, "", "bar"),
				label("ack", Math.min(boundary, 263), 159, `RCV.NXT = ${next}`, 190),
			],
			edges: [{ id: "next-byte", path: `M${Math.min(boundary, 263)} 144 H${boundary} V129` }],
		};
	});
}

export const scene: Scene = {
	title: "缺口挡住累计确认",
	diagramHeight: 180,
	caption:
		"粗框是这次到达的字节，底部横条是已经连续收到的部分。指针 RCV.NXT 停在横条右端，它的序号就是累计 ACK。",
	description:
		"接收端起初等待字节 1001，没有序号回绕。先收到 1001 和 1002，再收到 1005 和 1006，缺口使累计 ACK 停在 1003。补齐 1003 和 1004 后，连续范围覆盖到 1006，ACK 才升到 1007。",
	frames: receive(),
};

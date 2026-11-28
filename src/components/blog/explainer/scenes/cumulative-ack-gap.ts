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
				mark("prefix", 12, 117, (next - firstSeq) * 56, 10, "", "bar", true),
				label("ack", 180, 157, `累计 ACK = ${next}`, 320),
			],
		};
	});
}

export const scene: Scene = {
	title: "缺口挡住累计确认",
	diagramHeight: 180,
	caption: "每格是一个字节，横条标出从 1001 起连续收到的部分。累计 ACK 指向横条之后的第一个字节。",
	description:
		"本方向此前已确认到 1001，没有序号回绕。先收到 1001 和 1002，再收到 1005 和 1006，缺口使累计 ACK 停在 1003。补齐 1003 和 1004 后，连续范围覆盖到 1006，ACK 才升到 1007。",
	frames: receive(),
};

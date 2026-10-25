import { center, type Scene } from "./types.ts";

// A legal schedule: W1 finishes job 1 and takes job 2 while W0 still holds job 0.
// Result slots show job IDs; the article's associated values are their squares.
const phases = [
	{ jobs: "[0][1]", w0: "IDLE", w1: "IDLE", results: "[]", collected: 0 },
	{ jobs: "[2][3]", w0: "[0]", w1: "[1]", results: "[]", collected: 0 },
	{ jobs: "[3]", w0: "[0]", w1: "[2]", results: "[1]", collected: 0 },
	{ jobs: "[4][5]", w0: "[3]", w1: "[2]", results: "[0]", collected: 1 },
	{ jobs: "[5]", w0: "[3]", w1: "[4]", results: "[2]", collected: 2 },
	{ jobs: "[]", w0: "[5]", w1: "[4]", results: "[3]", collected: 3 },
	{ jobs: "[]", w0: "EXIT", w1: "EXIT", results: "[4][5]", collected: 4 },
	{ jobs: "[]", w0: "EXIT", w1: "EXIT", results: "[]", collected: 6 },
];

export const workerPool: Scene = {
	description:
		"固定两个 worker 复用处理编号 0 到 5 的任务。容量为 2 的任务队列经 recv 锁串行领取，计算发生在锁外；结果编号进入另一条容量为 2 的通道，由主线程持续收集。W1 可以先领取下一项，不要求均分或严格轮流。发送端关闭、队列排空后 worker 退出，最终收齐六项结果。",
	frames: phases.map((phase) => ({
		rows: [
			center(`jobs ${phase.jobs}  cap:2`, 35),
			"                 |",
			center("recv lock", 35),
			"     +-----------+-----------+",
			`${center(`W0:${phase.w0}`, 11)}             ${center(`W1:${phase.w1}`, 11)}`,
			"     +-----------+-----------+",
			center(`results ${phase.results}  cap:2`, 35),
			"                 |",
			center(`collected: ${phase.collected}/6`, 35),
		],
		active: phase.collected === 6 ? [8] : [4],
	})),
};

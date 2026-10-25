import { center, type Scene } from "./types.ts";

const phases = [
	{ left: "free", right: "free", a: false, b: false },
	{ left: "holds L1", right: "free", a: false, b: false },
	{ left: "holds L1", right: "holds L2", a: false, b: false },
	{ left: "holds L1", right: "holds L2", a: true, b: false },
	{ left: "holds L1", right: "holds L2", a: true, b: true },
];

function edge(label: string, left: boolean) {
	const body = center(` ${label} `, 23)
		.replace(/^ +/, (spaces) => "-".repeat(spaces.length))
		.replace(/ +$/, (spaces) => "-".repeat(spaces.length));

	return `     +${left ? `<${body.slice(1)}` : `${body.slice(0, -1)}>`}+`;
}

export const deadlock: Scene = {
	description:
		"A 先持有 L1，B 先持有 L2；两者都取得第一把锁后，A 等待 B 的 L2，B 等待 A 的 L1。两把独占锁形成循环等待，停在死锁状态，不会自行释放。",
	frames: phases.map((phase) => ({
		rows: [
			`${center("THREAD A", 11)}             ${center("THREAD B", 11)}`,
			`${center(phase.left, 11)}             ${center(phase.right, 11)}`,
			"     |                       |",
			phase.a ? edge("wait L2", false) : "     |                       |",
			"     |                       |",
			phase.b ? edge("wait L1", true) : "     |                       |",
			"",
			center(phase.b ? "DEADLOCK" : "", 35),
		],
		active: phase.b ? [3, 5, 7] : phase.a ? [3] : [1],
	})),
};

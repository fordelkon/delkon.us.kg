import { example, frame, label, line, mark } from "./examples.ts";

const leftWall = 4;
const floor = [0, 1];
const columnWidth = 34;
const unitHeight = 27;
const baseline = 157;

function section(rightWall: number, observation: string) {
	const waterline = Math.min(leftWall, rightWall);
	const depths = floor.map((height) => waterline - height);
	const volume = depths.reduce((sum, depth) => sum + depth, 0);
	const surfaceY = baseline - waterline * unitHeight;

	const columns = [leftWall, ...floor, rightWall].flatMap((height, index) => {
		const x = 97 + index * columnWidth;
		const top = baseline - height * unitHeight;
		const depth = Math.max(0, waterline - height);

		return [
			...(height > 0
				? [mark(`bar-${index}`, x, top, columnWidth, height * unitHeight, "", "bar")]
				: []),
			...Array.from({ length: depth }, (_, layer) =>
				mark(
					`water-${index}-${layer}`,
					x,
					top - (layer + 1) * unitHeight,
					columnWidth,
					unitHeight,
					"",
					"water",
				),
			),
			label(`height-${index}`, x + columnWidth / 2, baseline + 18, String(height), columnWidth),
		];
	});

	return frame(
		`右壁高 ${rightWall}，水位 ${waterline}，两列水深 ${depths.join(" + ")}，共 ${volume} 格。${observation}`,
		[
			...columns,
			label("heights", 65, baseline + 18, "柱高", 52),
			label("surface", 50, surfaceY, `水位 ${waterline}`, 86),
			label("volume", 294, 88, `蓄水 ${volume} 格`, 115),
		],
		[
			line("floor", `M92 ${baseline} H238`),
			{ ...line("level", `M81 ${surfaceY} H97`), dashed: true },
		],
	);
}

const rightWalls = [3, 4, 5];

const observations = [
	"水刚好到达右壁顶端。",
	"两壁齐平，两列各多存一格。",
	"水已经能从左壁溢出，再加高右壁也装不下更多水。",
];

export const scene = {
	control: { kind: "range" as const, label: "右壁高度", options: rightWalls.map(String) },
	...example(
		"把右壁升高一格，能多存多少水？",
		"固定左壁和槽底，只升高右壁。哪边先溢水，哪边就决定这两列能装下多少水。",
		198,
		...rightWalls.map((height, index) => section(height, observations[index] ?? "")),
	),
};

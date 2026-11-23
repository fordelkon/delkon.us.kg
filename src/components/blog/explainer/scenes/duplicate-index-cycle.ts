import { cells, example, frame, label } from "./examples.ts";
import { topology } from "./tree-examples.ts";

const [nodes, edges] = topology(
	[
		["0", 0, 45, 148],
		["1", 1, 113, 148],
		["3", 3, 183, 148],
		["2", 2, 252, 148],
		["4", 4, 252, 211],
	],
	[
		["0", "1"],
		["1", "3"],
		["3", "2"],
	],
	["2"],
	true,
);

export const scene = example(
	"数组的下标函数图",
	"上排是数组。下排每个节点是下标，箭头从 i 指向 nums[i]，环入口 2 就是重复值。",
	243,
	frame(
		"由 0 出发依次访问下标 1、3、2、4、2。下标 3 与 4 都指向 2，对应两处数组元素同为 2。",
		[
			label("array", 180, 22, "nums = [1, 3, 4, 2, 2]", 260),
			...cells("values", [1, 3, 4, 2, 2], 48, [3, 4]),
			...nodes,
		],
		[
			...edges,
			{ id: "2-4", path: "M244 165 Q223 179 242 195" },
			{ id: "4-2", path: "M262 195 Q283 179 262 164", active: true },
		],
	),
);

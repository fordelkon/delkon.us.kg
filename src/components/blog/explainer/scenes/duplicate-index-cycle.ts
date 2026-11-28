import { cells, dot, example, frame, label } from "./examples.ts";
import { edge } from "./types.ts";

export const scene = example(
	"数组的下标函数图",
	"上排是数组。下排每个节点是下标，箭头从 i 指向 nums[i]，环入口 2 就是重复值。",
	243,
	frame(
		"由 0 出发依次访问下标 1、3、2、4、2。下标 3 与 4 都指向 2，对应两处数组元素同为 2。",
		[
			...Array.from({ length: 5 }, (_, index) =>
				label(`index-${index}`, 100 + index * 40, 29, String(index), 40),
			),
			label("indices", 46, 29, "下标", 48),
			label("values", 46, 68, "值", 48),
			...cells("values", [1, 3, 4, 2, 2], 48, [3, 4]),
			dot("0", 45, 148, 0),
			dot("1", 113, 148, 1),
			dot("3", 183, 148, 3, true),
			dot("2", 252, 148, 2),
			dot("4", 252, 211, 4, true),
		],
		[
			edge("0-1", "M63 148 H94"),
			edge("1-3", "M131 148 H164"),
			edge("3-2", "M201 148 H233", true),
			{ id: "2-4", path: "M244 165 Q223 179 242 195" },
			{ id: "4-2", path: "M262 195 Q283 179 262 164", active: true },
		],
	),
);

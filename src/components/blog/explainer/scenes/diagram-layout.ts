import { type Box, box, type Edge, edge, type Scene } from "./types.ts";

export function node(
	id: string,
	x: number,
	y: number,
	width: number,
	lines: [string, string],
	tone: NonNullable<Box["tone"]>,
	active = false,
): Box {
	return { ...box(id, x, y, width, lines, active), tone };
}

export function withRoles(scene: Scene, roles: Record<string, NonNullable<Box["tone"]>>): Scene {
	return {
		...scene,
		frames: scene.frames.map((frame) => ({
			...frame,
			boxes: frame.boxes.map((item) => ({
				...item,
				tone: item.tone ?? roles[item.id] ?? "processing",
			})),
		})),
	};
}

export const EXECUTION_LEGEND = "蓝：执行者 · 橙：资源／等待 · 紫：状态／同步 · 绿：结果";

export function controlEdge(id: string, path: string, active = false): Edge {
	return { ...edge(id, path, active), dashed: true };
}

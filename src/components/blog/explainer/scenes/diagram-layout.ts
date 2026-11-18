import { type Box, box, type Edge, edge, type Frame, type Scene } from "./types.ts";

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

// A vertical protocol/process view; a row is a responsibility, not a wire packet.
export function chain(
	rows: [string, string][],
	active: number,
	note: string,
	tones: Box["tone"][] = [],
	connected = true,
): Frame {
	return {
		note,
		durationMs: 5000,
		boxes: rows.map((lines, index) =>
			node(
				`row-${index}`,
				8,
				8 + index * 64,
				344,
				lines,
				tones[index] ?? "processing",
				index === active,
			),
		),
		edges: (connected ? rows.slice(1) : []).map((_, index) =>
			edge(`next-${index}`, `M180 ${56 + index * 64} V${66 + index * 64}`, index === active),
		),
	};
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

// Two participants share a state card; arrows are supplied by scenes when causal.
export function interaction(
	note: string,
	left: [string, string],
	right: [string, string],
	state: [string, string],
	boundary: [string, string],
	active: "left" | "right" | "both" = "both",
): Frame {
	return {
		note,
		boxes: [
			node("left", 8, 8, 156, left, "actor", active !== "right"),
			node("right", 196, 8, 156, right, "actor", active !== "left"),
			node("state", 8, 100, 344, state, "state", true),
			node("boundary", 8, 188, 344, boundary, "control"),
		],
	};
}

export function controlEdge(id: string, path: string, active = false): Edge {
	return { ...edge(id, path, active), dashed: true };
}

export function logicalFlow(scene: Scene): Scene {
	return {
		...scene,
		frames: scene.frames.map((frame) => ({
			...frame,
			edges: (frame.edges ?? []).map((line) => ({ ...line, dashed: true })),
		})),
	};
}

export function connectionEndpoint(item: Box): Box {
	return { ...item, endpoint: true };
}

import { type Box, box, edge, type Frame, type Scene } from "./types.ts";

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

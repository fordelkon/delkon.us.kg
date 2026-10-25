import { center } from "./types.ts";

interface CounterState {
	count: number;
	a: string;
	b: string;
	pathA: string;
	pathB: string;
	active: number;
}

export function counterFrame(state: CounterState, title: string, operation: string) {
	const box = (value: string) => `        |${center(value, 17)}|`;

	return {
		rows: [
			`${center("THREAD A", 11)}             ${center("THREAD B", 11)}`,
			`${center(state.a, 11)}             ${center(state.b, 11)}`,
			"     |                       |",
			"     +--------+     +--------+",
			`              ${state.pathA}     ${state.pathB}`,
			"        +-----+-----+-----+",
			box(title),
			box(`count: ${state.count}`),
			box(operation),
			"        +-----------------+",
		],
		active: [state.active],
	};
}

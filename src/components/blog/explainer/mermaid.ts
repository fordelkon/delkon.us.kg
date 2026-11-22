import { renderDiagram } from "../../../utils/mermaid";
import type { Scene } from "./scenes/types";

interface RenderedFrame {
	svg: string;
	reference?: string;
}

export function renderScene(id: string, scene: Scene, study: boolean): RenderedFrame[] {
	return scene.frames.map((frame, index) => {
		const highlights = frame.activeNodes?.length
			? `class ${frame.activeNodes.join(",")} active`
			: "";

		const edges =
			frame.activeEdges
				?.map((edge) => `linkStyle ${edge} stroke:var(--color-printer-accent),stroke-width:2.5px`)
				.join("\n") ?? "";

		const frameId = `${id}-${index}`;

		const svg = renderDiagram(
			`${scene.diagram}\nclassDef active stroke:var(--color-printer-accent),stroke-width:2px,color:var(--color-printer-accent)\n${highlights}\n${edges}`,
			frameId,
		);

		if (!study) return { svg };

		// Keep the same viewport and theme variables while sharing the frame geometry.
		const match = svg.match(/^(<svg\b[^>]*>)([\s\S]*)<\/svg>\s*$/);

		if (!match) throw new Error("Expected a Mermaid SVG root.");

		const [, root, geometry] = match;

		return {
			svg: `${root}<g id="${frameId}-artwork">${geometry}</g></svg>`,
			reference: `${root}<use href="#${frameId}-artwork"/></svg>`,
		};
	});
}

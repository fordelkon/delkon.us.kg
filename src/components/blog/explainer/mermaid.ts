import { renderDiagram } from "../../../utils/mermaid";
import type { Scene } from "./scenes/types";

export function renderScene(id: string, scene: Scene): string[] {
	return scene.frames.map((frame, index) => {
		const highlights = frame.activeNodes?.length
			? `class ${frame.activeNodes.join(",")} active`
			: "";

		const edges =
			frame.activeEdges
				?.map((edge) => `linkStyle ${edge} stroke:var(--color-printer-accent),stroke-width:2.5px`)
				.join("\n") ?? "";

		return renderDiagram(
			`${scene.diagram}\nclassDef active stroke:var(--color-printer-accent),stroke-width:2px,color:var(--color-printer-accent)\n${highlights}\n${edges}`,
			`${id}-${index}`,
		);
	});
}

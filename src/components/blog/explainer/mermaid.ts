import { renderMermaidSVG } from "beautiful-mermaid";
import type { Scene } from "./scenes/types";

// Build-time only: rendering needs neither a browser nor system font libraries.
export function renderScene(id: string, scene: Scene): string[] {
	return scene.frames.map((frame, index) => {
		const highlights = frame.activeNodes?.length
			? `class ${frame.activeNodes.join(",")} active`
			: "";

		const edges =
			frame.activeEdges
				?.map((edge) => `linkStyle ${edge} stroke:var(--color-printer-accent),stroke-width:2.5px`)
				.join("\n") ?? "";

		const svg = renderMermaidSVG(
			`${scene.diagram}\nclassDef active stroke:var(--color-printer-accent),stroke-width:2px,color:var(--color-printer-accent)\n${highlights}\n${edges}`,
			{
				bg: "var(--color-printer-paper)",
				fg: "var(--color-printer-ink)",
				font: "PingFang SC",
				transparent: true,
				padding: 8,
				nodeSpacing: 16,
				layerSpacing: 20,
			},
		);

		const prefix = `${id}-${index}`;

		// The library emits global CSS and remote font imports. Site CSS owns both.
		// Namespace markers because every animation frame is inlined in one document.
		return svg
			.replace(/<style>[\s\S]*?<\/style>/g, "")
			.replace(/ id="([^"]+)"/g, ` id="${prefix}-$1"`)
			.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
	});
}

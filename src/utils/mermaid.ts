import { renderMermaidSVG } from "beautiful-mermaid";

/** Render trusted, authored diagrams at build time without browser or font dependencies. */
export function renderDiagram(source: string, prefix: string): string {
	const svg = renderMermaidSVG(source, {
		bg: "var(--color-printer-paper)",
		fg: "var(--color-printer-ink)",
		transparent: true,
		padding: 8,
		nodeSpacing: 16,
		layerSpacing: 20,
	});

	// Site CSS owns fonts and colors; remove global styles and remote font imports.
	// Namespace marker references for multiple diagrams and animation frames per page.
	return svg
		.replace(/<style>[\s\S]*?<\/style>/g, "")
		.replace(/ id="([^"]+)"/g, ` id="${prefix}-$1"`)
		.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
}

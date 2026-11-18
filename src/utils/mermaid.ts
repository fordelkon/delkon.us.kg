import { renderMermaidSVG } from "beautiful-mermaid";

const nodeRoles = ["actor", "resource", "state", "result", "risk"].map(
	(role) => `classDef ${role} fill:var(--diagram-${role}-fill),stroke:var(--diagram-${role}-ink)`,
);

/** Render trusted, authored diagrams at build time without browser or font dependencies. */
export function renderDiagram(source: string, prefix: string): string {
	const themedSource = /^\s*(?:flowchart|graph)\s/.test(source)
		? `${source}\n${nodeRoles.join("\n")}`
		: source;

	const svg = renderMermaidSVG(themedSource, {
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

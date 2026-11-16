import { createHash } from "node:crypto";
import { h } from "hastscript";
import { htmlToHast, type MdastPluginDefinition } from "satteri";
import { renderDiagram } from "../utils/mermaid.ts";

function renderSvg(source: string, id: string) {
	const tree = htmlToHast(renderDiagram(source, id), { fragment: true });

	if (tree.type !== "root") throw new Error("Expected a Mermaid SVG fragment root.");

	const svg = tree.children.find((child) => child.type === "element" && child.tagName === "svg");

	if (svg?.type !== "element") throw new Error("Mermaid did not produce an SVG.");

	// Normalize the namespace attribute produced by Satteri's HTML parser.
	delete svg.properties[":xmlns"];
	svg.properties.xmlns = "http://www.w3.org/2000/svg";
	svg.properties.ariaHidden = "true";
	svg.properties.focusable = "false";

	return svg;
}

export function satteriMermaidPlugin(): () => MdastPluginDefinition {
	return () => {
		let diagramIndex = 0;

		return {
			name: "cactus-mermaid",
			code(node, ctx) {
				if (node.lang !== "mermaid") return;

				const title = node.meta?.match(/(?:^|\s)title="([^"]+)"/)?.[1];
				const description = node.meta?.match(/(?:^|\s)description="([^"]+)"/)?.[1];
				const mobileDirection = node.meta?.match(/(?:^|\s)mobile-direction="([^"]+)"/)?.[1];

				if (!title || !description) {
					throw new Error('Mermaid diagrams require title="..." and description="..." metadata.');
				}

				const id = `diagram-${createHash("sha256")
					.update(`${ctx.fileURL?.href ?? ""}:${diagramIndex++}:${node.value}`)
					.digest("hex")
					.slice(0, 16)}`;

				const svg = renderSvg(node.value, id);
				const diagrams = [svg];
				const classes = ["prose-diagram", "not-prose"];

				if (mobileDirection) {
					const direction = /^(\s*(?:flowchart|graph)\s+)LR\b/;

					if (mobileDirection !== "TB" || !direction.test(node.value)) {
						throw new Error('mobile-direction="TB" requires an LR flowchart.');
					}

					const mobileSvg = renderSvg(node.value.replace(direction, "$1TB"), `${id}-mobile`);
					mobileSvg.properties.className = ["prose-diagram-narrow"];
					svg.properties.className = ["prose-diagram-wide"];
					diagrams.push(mobileSvg);
					classes.push("prose-diagram-responsive");
				}

				// Replace before code highlighting; index the caption once, not SVG labels or syntax.
				ctx.replaceNode(node, {
					type: "paragraph",
					children: [],
					data: {
						hName: "figure",
						hProperties: { className: classes },
						hChildren: [
							h(
								"p",
								{ className: "prose-diagram-hint", dataPagefindIgnore: "all" },
								"宽图可左右滑动查看；键盘聚焦后可用方向键。",
							),
							h(
								"div",
								{
									className: "prose-diagram-viewport",
									tabIndex: 0,
									role: "region",
									ariaLabel: `${title}，宽图可横向滚动`,
								},
								[
									h(
										"div",
										{
											className: "mermaid-diagram",
											role: "img",
											ariaLabel: title,
											ariaDescribedBy: `${id}-caption`,
											dataPagefindIgnore: "all",
										},
										diagrams,
									),
								],
							),
							h("figcaption", { id: `${id}-caption` }, description),
						],
					},
				});
			},
		};
	};
}

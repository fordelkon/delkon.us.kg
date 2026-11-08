import type { RootContent } from "hast";
import katex from "katex";
import { htmlToHast, type MdastPluginDefinition } from "satteri";

// KaTeX emits visual HTML, semantic MathML, and a TeX annotation for one formula.
// Index only the semantic text while preserving all three for rendering and AT.
function excludeDuplicateMath(node: RootContent): void {
	if (node.type !== "element") return;
	const classes = node.properties.className;

	if (node.tagName === "annotation" || (Array.isArray(classes) && classes.includes("katex-html"))) {
		node.properties.dataPagefindIgnore = "all";
	}

	for (const child of node.children) excludeDuplicateMath(child);
}

function renderMathChildren(value: string, displayMode: boolean) {
	const html = katex.renderToString(value, { displayMode, throwOnError: true });
	const tree = htmlToHast(html, { fragment: true });

	if (tree.type !== "root") throw new Error("Expected a KaTeX HTML fragment root.");

	for (const child of tree.children) excludeDuplicateMath(child);

	return tree.children.map((child) => {
		if (child.type !== "element") throw new Error("Expected a KaTeX wrapper element.");

		return child;
	});
}

export function satteriMathPlugin(): MdastPluginDefinition {
	return {
		name: "cactus-math",
		math(node, ctx) {
			// Render before HAST code highlighting can consume the math code block.
			ctx.replaceNode(node, {
				type: "paragraph",
				children: [],
				data: {
					hName: "div",
					hProperties: {
						className: ["not-prose", "math-block"],
						tabIndex: 0,
						role: "region",
						ariaLabel: "数学公式",
					},
					hChildren: renderMathChildren(node.value, true),
				},
			});
		},
		inlineMath(node, ctx) {
			ctx.replaceNode(node, {
				type: "paragraph",
				children: [],
				data: {
					hName: "span",
					hProperties: { className: ["not-prose"] },
					hChildren: renderMathChildren(node.value, false),
				},
			});
		},
	};
}

import type { ExpressiveCodePlugin } from "astro-expressive-code";

export function compactCodeTokens(): ExpressiveCodePlugin {
	return {
		name: "CompactCodeTokens",
		hooks: {
			postprocessRenderedLine: ({ renderData: { lineAst }, styleVariants }) => {
				const code = lineAst.children.find(
					(node) =>
						node.type === "element" &&
						Array.isArray(node.properties.className) &&
						node.properties.className.includes("code"),
				);

				if (code?.type !== "element") return;

				const foreground = styleVariants
					.map(
						({ resolvedStyleSettings }, index) =>
							`--${index}:${resolvedStyleSettings.get("codeForeground")}`,
					)
					.join(";")
					.toLowerCase();

				const plainLine = String(lineAst.properties.className) === "ec-line";

				// Keep indentation, annotations, and any non-color token styles intact.
				code.children = code.children.flatMap((node) => {
					if (node.type !== "element" || node.tagName !== "span") return [node];

					const style = String(node.properties.style ?? "");
					const [text] = node.children;

					if (
						Object.keys(node.properties).length !== 1 ||
						!/^--\d+:#\p{ASCII_Hex_Digit}+(;--\d+:#\p{ASCII_Hex_Digit}+)*$/u.test(style) ||
						node.children.length !== 1 ||
						text?.type !== "text"
					)
						return [node];

					return /^ +$/.test(text.value) || (plainLine && style.toLowerCase() === foreground)
						? [text]
						: [node];
				});
			},
		},
	};
}

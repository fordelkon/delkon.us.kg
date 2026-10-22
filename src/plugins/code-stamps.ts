import type { AstroExpressiveCodeOptions } from "astro-expressive-code";
import { h } from "astro-expressive-code/hast";
import { asciiIcon } from "../utils/ascii-art.ts";

// After changing rendering hooks, run pnpm exec astro sync --force before
// building: Astro's content cache can otherwise retain the previous markup.
export function codeStamps() {
	return {
		name: "CodeStamps",
		hooks: {
			postprocessRenderedBlock: ({ codeBlock, renderData }) => {
				if (codeBlock.props.frame === "none" || renderData.blockAst.tagName !== "figure") return;
				const source = asciiIcon(codeBlock.language);

				if (!source) return;

				// Keep decorative artwork outside the code, copy payload, and search
				// index. CSS overlays it without reserving space or intercepting input;
				// Expressive Code continues to own captions and syntax highlighting.
				const stamp = h(
					"div.code-watermark",
					{ "aria-hidden": "true", "data-pagefind-ignore": true },
					[h("span.ascii-icon", { style: `--ascii-source: url('${source}')` })],
				);

				renderData.blockAst.children.push(stamp);
				renderData.blockAst.properties["data-code-stamp"] = true;
			},
		},
	} satisfies NonNullable<AstroExpressiveCodeOptions["plugins"]>[number];
}

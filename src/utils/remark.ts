import { h as _h, type Properties } from "hastscript";
import type { Paragraph as P, RootContent } from "mdast";
import type {} from "mdast-util-to-hast";

/** From Astro Starlight: Function that generates an mdast HTML tree ready for conversion to HTML by rehype. */
export function h(el: string, attrs: Properties = {}, children: RootContent[] = []): P {
	const { tagName, properties } = _h(el, attrs);

	return {
		// SAFETY: mdast-util-to-hast traverses all supplied mdast nodes and replaces the paragraph tag
		// with hName. This HTML adapter intentionally accepts block nodes as well as phrasing nodes.
		children: children as P["children"],
		data: { hName: tagName, hProperties: properties },
		type: "paragraph",
	};
}

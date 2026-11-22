import katexStyles from "katex/dist/katex.min.css?url";
import explainerStyles from "@/components/blog/explainer/styles.css?inline";
import admonitionStyles from "./components/admonition.css?url";
import githubCardStyles from "./components/github-card.css?url";
import mermaidStyles from "./components/mermaid.css?inline";

export interface ContentFeatures {
	readonly hasMath?: boolean;
	readonly hasAdmonition?: boolean;
	readonly hasGithubCard?: boolean;
	readonly hasMermaid?: boolean;
	readonly hasExplainer?: boolean;
}

export type ContentStylesheet = { href: string } | { css: string };

const styles: readonly (readonly [keyof ContentFeatures, ContentStylesheet])[] = [
	["hasMath", { href: katexStyles }],
	["hasAdmonition", { href: admonitionStyles }],
	["hasGithubCard", { href: githubCardStyles }],
	// Small, above-the-fold diagram styles should not add blocking requests.
	["hasMermaid", { css: mermaidStyles }],
	["hasExplainer", { css: explainerStyles }],
];

export function contentStyles(...documents: (ContentFeatures | undefined)[]): ContentStylesheet[] {
	return styles.flatMap(([flag, stylesheet]) =>
		documents.some((document) => document?.[flag] === true) ? [stylesheet] : [],
	);
}

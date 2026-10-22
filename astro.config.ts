import fs from "node:fs";
import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import robotsTxt from "astro-robots-txt";
import webmanifest from "astro-webmanifest";
import { satteriAdmonitionsPlugin } from "./src/plugins/admonitions";
import { codeStamps } from "./src/plugins/code-stamps";
import { satteriGithubCardPlugin } from "./src/plugins/github-cards";
import {
	satteriAutolinkHeadingsPlugin,
	satteriExternalLinksPlugin,
	satteriFootnoteLabelPlugin,
	satteriReadingTimePlugin,
	satteriUnwrapImagesPlugin,
} from "./src/plugins/satteri";
import { expressiveCodeOptions, siteConfig } from "./src/site.config";
import { PRINTER_ACCENT, PRINTER_DESK } from "./src/styles/tokens/printer-palette";

// https://astro.build/config
export default defineConfig({
	site: siteConfig.url,
	// Replaces the former inline speculationrules script: Astro's prefetch
	// regenerates its rules on every astro:page-load, so client-side
	// navigation keeps prefetching (a re-inserted static rules script is
	// ignored by Chrome as "previously inserted into another document").
	prefetch: {
		prefetchAll: true,
		defaultStrategy: "load",
	},
	image: {
		domains: ["webmention.io"],
	},
	integrations: [
		expressiveCode({ ...expressiveCodeOptions, plugins: [codeStamps()] }),
		icon(),
		sitemap(),
		mdx(),
		robotsTxt(),
		webmanifest({
			// See: https://github.com/alextim/astro-lib/blob/main/packages/astro-webmanifest/README.md
			name: siteConfig.title,
			description: siteConfig.description,
			lang: siteConfig.lang,
			icon: "src/icons/icon.svg", // the source for generating favicon & icons
			icons: [
				{
					src: "icons/apple-touch-icon.png", // used in src/components/BaseHead.astro L:26
					sizes: "180x180",
					type: "image/png",
				},
				{
					src: "icons/icon-192.png",
					sizes: "192x192",
					type: "image/png",
				},
				{
					src: "icons/icon-512.png",
					sizes: "512x512",
					type: "image/png",
				},
			],
			start_url: "/",
			background_color: PRINTER_DESK,
			theme_color: PRINTER_ACCENT,
			display: "standalone",
			config: {
				insertFaviconLinks: false,
				insertThemeColorMeta: false,
				insertManifestLink: false,
			},
		}),
	],
	markdown: {
		processor: satteri({
			features: {
				directive: true,
				// Footnotes are on by default; only the labels are localized here.
				// Keep clobberPrefix at its "user-content-" default — it guards
				// footnote ids against DOM clobbering (docs/footnote-backlink-research.md §1.3).
				gfm: {
					footnotes: {
						label: "参考文献",
						backLabel: "返回正文第 {reference} 处引用",
					},
				},
			},
			mdastPlugins: [
				satteriUnwrapImagesPlugin(),
				satteriReadingTimePlugin(),
				satteriGithubCardPlugin(),
				satteriAdmonitionsPlugin(),
			],
			hastPlugins: [
				// Factory form: the plugin closes over a Slugger, so it must be
				// instantiated once per compile. Passed as an instance its Slugger
				// would persist across documents and suffix duplicate heading ids
				// with cross-page counters (-1, -2 …). Sätteri calls plugin
				// factories once per compile (satteri/dist/plugin.d.ts).
				() => satteriHeadingIdsPlugin(),
				satteriAutolinkHeadingsPlugin(),
				satteriFootnoteLabelPlugin(),
				satteriExternalLinksPlugin(),
			],
		}),
	},
	vite: {
		plugins: [tailwind(), rawFonts([".ttf", ".woff"])],
	},
	env: {
		schema: {
			WEBMENTION_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
			WEBMENTION_URL: envField.string({ context: "client", access: "public", optional: true }),
			WEBMENTION_PINGBACK: envField.string({ context: "client", access: "public", optional: true }),
		},
	},
});

function rawFonts(ext: string[]) {
	return {
		name: "vite-plugin-raw-fonts",
		// @ts-expect-error:next-line
		transform(_, id) {
			if (ext.some((e) => id.endsWith(e))) {
				const buffer = fs.readFileSync(id);

				return {
					code: `export default ${JSON.stringify(buffer)}`,
					map: null,
					moduleType: "js",
				};
			}
		},
	};
}

import type { Config } from "tailwindcss";

export default {
	plugins: [require("@tailwindcss/typography")],
	theme: {
		extend: {
			typography: () => ({
				DEFAULT: {
					css: {
						/* Serif headings with tight tracking (printer receipt style) */
						"h1, h2, h3, h4, h5, h6": {
							fontFamily: "var(--font-serif)",
							letterSpacing: "-0.025em",
						},
						h1: {
							fontSize: "1.5rem",
							marginBottom: "1rem",
						},
						h2: {
							fontSize: "1.25rem",
							marginTop: "3rem",
							marginBottom: "1rem",
						},
						h3: {
							fontSize: "1.125rem",
							marginTop: "2rem",
							marginBottom: "0.75rem",
						},
						p: {
							marginTop: "1.25rem",
							marginBottom: "1.25rem",
							lineHeight: "2rem",
							color: "color-mix(in oklab, var(--color-printer-ink) 85%, transparent)",
						},
						/* Prose anchor style (receipt link). Kept here because the
						   typography plugin re-emits its own default `a` rule
						   (font-weight 500, --tw-prose-links colour, bare underline)
						   into the utilities layer whenever this key is absent, and
						   utilities outrank any components-layer equivalent in
						   src/styles/components/receipt.css — so the receipt-link
						   look cannot be single-sourced from CSS alone. */
						a: {
							fontWeight: "400",
							color: "inherit",
							textDecoration: "underline",
							textUnderlineOffset: "2px",
							textDecorationThickness: "1px",
							textDecorationColor: "color-mix(in oklab, var(--color-printer-ink) 30%, transparent)",
							transition:
								"text-decoration-color 150ms, text-decoration-thickness 150ms, text-underline-offset 150ms",
							"&:hover": {
								"@media (hover: hover)": {
									textDecorationColor:
										"color-mix(in oklab, var(--color-printer-ink) 85%, transparent)",
									textDecorationThickness: "2px",
									textUnderlineOffset: "4px",
								},
							},
						},
						/* Internal cross-references: wavy accent underline, like a
						   hand-drawn pen squiggle on the paper — visually distinct
						   from the straight ink underline of external citations.
						   Selector excludes absolute http(s) and same-page anchors,
						   so every relative or root-relative href counts as internal. */
						'a:not([href^="http"]):not([href^="#"])': {
							textDecorationStyle: "wavy",
							textDecorationColor:
								"color-mix(in oklab, var(--color-printer-accent) 55%, transparent)",
							textUnderlineOffset: "3px",
							"&:hover": {
								"@media (hover: hover)": {
									textDecorationColor: "var(--color-printer-accent)",
									textDecorationThickness: "2px",
								},
							},
						},
						strong: {
							fontWeight: "700",
							color: "var(--color-printer-ink)",
							/* Highlighter band behind key text (half-height accent
							   strip). `box-decoration-break: clone` repeats the band
							   per line when a strong phrase wraps, instead of only
							   highlighting the last fragment. */
							backgroundImage: "linear-gradient(var(--prose-highlight), var(--prose-highlight))",
							backgroundRepeat: "no-repeat",
							backgroundSize: "100% 45%",
							backgroundPosition: "left bottom",
							borderRadius: "0.125em",
							boxDecorationBreak: "clone",
						},
						"ul, ol": {
							marginTop: "1.25rem",
							marginBottom: "1.25rem",
						},
						li: {
							marginTop: "0.375rem",
							marginBottom: "0.375rem",
							lineHeight: "1.75rem",
							color: "color-mix(in oklab, var(--color-printer-ink) 80%, transparent)",
						},
						blockquote: {
							fontWeight: "400",
							borderInlineStartWidth: "2px",
							borderColor: "color-mix(in oklab, var(--color-printer-ink) 20%, transparent)",
							color: "color-mix(in oklab, var(--color-printer-ink) 75%, transparent)",
							paddingTop: "0.25rem",
							paddingBottom: "0.25rem",
						},
						pre: {
							border: "1px solid color-mix(in oklab, var(--color-printer-ink) 10%, transparent)",
							borderRadius: "0.5rem",
							backgroundColor: "color-mix(in oklab, var(--color-printer-ink) 3%, transparent)",
							paddingInline: "1rem",
							paddingBlock: "0.75rem",
						},
						/* Inline-code chip: a faint ink block with a dashed border,
						   echoing the receipt look of pre blocks and table rules.
						   Excludes code inside pre so Expressive Code blocks keep
						   their own background. */
						code: {
							fontWeight: "400",
							color: "inherit",
							"&:not(pre code)": {
								backgroundColor: "color-mix(in oklab, var(--color-printer-ink) 6%, transparent)",
								border: "1px solid color-mix(in oklab, var(--color-printer-ink) 15%, transparent)",
								borderRadius: "0.375rem",
								paddingInline: "0.375em",
								paddingBlock: "0.125em",
								fontSize: "0.875em",
							},
						},
						/* Removing the plugin's decorative backticks requires these
						   keys at the top level: nested "&::before" inside the code
						   key does not outrank the plugin's own code::before rule. */
						"code::before": {
							content: "none",
						},
						"code::after": {
							content: "none",
						},
						img: {
							marginTop: "1.5rem",
							marginBottom: "1.5rem",
							borderRadius: "0.5rem",
							border: "1px solid color-mix(in oklab, var(--color-printer-ink) 10%, transparent)",
						},
						hr: {
							borderColor: "color-mix(in oklab, var(--color-printer-ink) 10%, transparent)",
						},
						kbd: {
							"&:where([data-theme='dark'], [data-theme='dark'] *)": {
								background: "var(--color-printer-ink)",
							},
						},
						sup: {
							marginInlineStart: "calc(var(--spacing) * 0.5)",
							a: {
								"&:after": {
									content: "']'",
								},
								"&:before": {
									content: "'['",
								},
								"&:hover": {
									"@media (hover: hover)": {
										color: "var(--color-printer-accent)",
									},
								},
							},
						},
						/* Table */
						"tbody tr": {
							borderBottomWidth: "none",
						},
						tfoot: {
							borderTop:
								"1px dashed color-mix(in oklab, var(--color-printer-ink) 30%, transparent)",
						},
						thead: {
							borderBottomWidth: "none",
						},
						"thead th": {
							borderBottom:
								"1px dashed color-mix(in oklab, var(--color-printer-ink) 30%, transparent)",
							fontWeight: "700",
						},
						'th[align="center"], td[align="center"]': {
							"text-align": "center",
						},
						'th[align="right"], td[align="right"]': {
							"text-align": "right",
						},
						'th[align="left"], td[align="left"]': {
							"text-align": "left",
						},
						".expressive-code, .admonition, .github-card": {
							marginTop: "calc(var(--spacing)*4)",
							marginBottom: "calc(var(--spacing)*4)",
						},
					},
				},
				sm: {
					css: {
						h1: {
							fontSize: "1.875rem",
						},
						h2: {
							fontSize: "1.5rem",
						},
						h3: {
							fontSize: "1.25rem",
						},
						code: {
							fontSize: "var(--text-sm)",
							fontWeight: "400",
						},
					},
				},
			}),
		},
	},
} satisfies Config;

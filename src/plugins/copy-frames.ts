import {
	ExpressiveCodeBlock,
	type ExpressiveCodePlugin,
	type PluginFramesOptions,
	pluginFrames,
} from "astro-expressive-code";

export function copyFrames(options?: PluginFramesOptions): ExpressiveCodePlugin {
	const frames = pluginFrames(options);
	const renderFrame = frames.hooks?.postprocessRenderedBlock;

	if (!renderFrame) throw new Error("Expressive Code Frames must provide its rendering hook.");
	const patches = new WeakMap<ExpressiveCodeBlock, string>();

	return {
		...frames,
		hooks: {
			...frames.hooks,
			preprocessLanguage: async (context) => {
				await frames.hooks?.preprocessLanguage?.(context);

				// TextMarkers has already resolved `diff lang=...` to its target
				// language. Remaining diff blocks represent patches to copy verbatim.
				if (context.codeBlock.language === "diff") {
					patches.set(context.codeBlock, context.codeBlock.code);
				}
			},
			postprocessRenderedBlock: (context) => {
				const { codeBlock } = context;

				const code =
					patches.get(codeBlock) ??
					codeBlock
						.getLines()
						.filter(
							(line) =>
								!line
									.getAnnotations()
									.some(
										(annotation) =>
											!annotation.inlineRange &&
											"markerType" in annotation &&
											annotation.markerType === "del",
									),
						)
						.map((line) => line.text)
						.join("\n");

				if (code === codeBlock.code) return renderFrame(context);

				// Only Frames receives the copy source. The displayed block and its
				// annotations stay intact; Frames still owns buttons and terminal rules.
				const copyBlock = new ExpressiveCodeBlock({
					code: "",
					language: codeBlock.language,
					props: { ...codeBlock.props },
				});

				// Insert after construction to preserve surviving edge blank lines.
				copyBlock.insertLines(0, code.split("\n"));

				return renderFrame({ ...context, codeBlock: copyBlock });
			},
		},
	};
}

import { renderMermaid } from "@mermaid-js/mermaid-cli";
import puppeteer from "puppeteer";
import themeCSS from "./mermaid-theme.css?raw";
import type { Scene } from "./scenes/types";

// Build-time only: the browser receives SVG and the existing small playback script.
export async function renderScene(id: string, scene: Scene): Promise<string[]> {
	const browser = await puppeteer.launch({ headless: true });

	try {
		const frames: string[] = [];

		for (const [index, frame] of scene.frames.entries()) {
			const highlights = frame.activeNodes?.length
				? `class ${frame.activeNodes.join(",")} active;`
				: "";

			const edges =
				frame.activeEdges?.map((edge) => `linkStyle ${edge} stroke-width:3px;`).join("\n") ?? "";

			const { data } = await renderMermaid(
				browser,
				`${scene.diagram}\n${highlights}\n${edges}`,
				"svg",
				{
					backgroundColor: "transparent",
					fontEmbed: false,
					svgId: `${id}-${index}`,
					mermaidConfig: {
						startOnLoad: false,
						securityLevel: "strict",
						theme: "neutral",
						look: "classic",
						htmlLabels: false,
						themeCSS,
						fontFamily: '"Noto Sans CJK SC", "PingFang SC", sans-serif',
						flowchart: {
							htmlLabels: false,
							curve: "linear",
							nodeSpacing: 16,
							rankSpacing: 20,
							minNodeWidth: 40,
							padding: 8,
						},
					},
				},
			);

			frames.push(new TextDecoder().decode(data));
		}

		return frames;
	} finally {
		await browser.close();
	}
}

import { html } from "satori-html";
import { siteConfig } from "@/site.config";
import { PRINTER_ACCENT, PRINTER_INK } from "@/styles/tokens/printer-palette";

// OG image markup, use https://og-playground.vercel.app/ to design your own.
export const ogMarkup = (title: string, pubDate: string) =>
	html`<div tw="flex flex-col w-full h-full bg-[#fffef9] text-[${PRINTER_INK}]">
		<div tw="flex flex-col flex-1 w-full p-10 justify-center">
			<p tw="text-2xl mb-6">${pubDate}</p>
			<h1 tw="text-6xl font-bold leading-snug text-[${PRINTER_INK}]">${title}</h1>
		</div>
		<div tw="flex items-center justify-between w-full p-10 border-t-2 border-[${PRINTER_ACCENT}] text-[${PRINTER_INK}]">
			<p tw="text-2xl ml-3 font-semibold">${siteConfig.title}</p>
			<p>by ${siteConfig.author}</p>
		</div>
	</div>`;

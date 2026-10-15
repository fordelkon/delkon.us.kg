import type { Page } from "astro";
import type { PaginationLink } from "@/types";

export interface PaginationProps {
	nextUrl?: PaginationLink;
	prevUrl?: PaginationLink;
}

/**
 * Derives the Paginator props ({ prevUrl, nextUrl }) from a paginated Astro page.
 * The first page has no previous link, the last page has no next link.
 */
export function getPaginationProps(
	page: Page,
	labels: { next: string; prev: string },
): PaginationProps {
	const { next, prev } = page.url;

	return {
		...(prev && { prevUrl: { text: labels.prev, url: prev } }),
		...(next && { nextUrl: { text: labels.next, url: next } }),
	};
}

import type { CollectionEntry } from "astro:content";

/** Any listable content entry: a post or a note. */
export type Entry = CollectionEntry<"post"> | CollectionEntry<"note">;

// Qualified IDs keep equal-date ordering deterministic across collections.
function tieBreak(a: Entry, b: Entry): number {
	return `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`);
}

/** Newest first — the canonical order for listing pages and feeds. */
export function newestFirst(a: Entry, b: Entry): number {
	return b.data.publishDate.getTime() - a.data.publishDate.getTime() || tieBreak(a, b);
}

/** Oldest first — fallback for members without an explicit editorial position. */
export function readingOrder(a: Entry, b: Entry): number {
	return a.data.publishDate.getTime() - b.data.publishDate.getTime() || tieBreak(a, b);
}

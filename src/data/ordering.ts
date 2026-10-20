import type { CollectionEntry } from "astro:content";

/** Any listable content entry: a post or a note. */
export type Entry = CollectionEntry<"post"> | CollectionEntry<"note">;

// Last resort so equal publish dates never shuffle between builds: series
// directory (the id prefix) first, then the full id. Same rule as the series
// reading order in docs/writing.md.
function tieBreak(a: Entry, b: Entry): number {
	return `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`);
}

/** Newest first — the canonical order for listing pages and feeds. */
export function newestFirst(a: Entry, b: Entry): number {
	return b.data.publishDate.getTime() - a.data.publishDate.getTime() || tieBreak(a, b);
}

/** Oldest first — the series reading order defined in docs/writing.md. */
export function readingOrder(a: Entry, b: Entry): number {
	return a.data.publishDate.getTime() - b.data.publishDate.getTime() || tieBreak(a, b);
}

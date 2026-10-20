import type { Entry } from "./ordering";

/** Relative feed path; entry IDs retain their directory segments. */
export function entryPath(entry: Pick<Entry, "collection" | "id">): string {
	return `${entry.collection === "post" ? "posts" : "notes"}/${entry.id}/`;
}

export function entryUrl(entry: Pick<Entry, "collection" | "id">): string {
	return `/${entryPath(entry)}`;
}

export function seriesUrl(id: string): string {
	return `/series/${id}/`;
}

export function tagUrl(tag: string): string {
	return `/tags/${tag}/`;
}

export function ogImageUrl(id: string): string {
	return `/og-image/${id}.png`;
}

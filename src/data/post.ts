import { type CollectionEntry, getCollection } from "astro:content";
import type { Entry } from "./ordering";

/** filter out draft posts based on the environment */
export async function getAllPosts(): Promise<CollectionEntry<"post">[]> {
	return await getCollection("post", ({ data }) => {
		return import.meta.env.PROD ? !data.draft : true;
	});
}

/** Get tag metadata by tag name */
export async function getTagMeta(tag: string): Promise<CollectionEntry<"tag"> | undefined> {
	const tagEntries = await getCollection("tag", (entry) => {
		return entry.id === tag;
	});

	return tagEntries[0];
}

/** Maximum posts rendered per paginated listing page */
export const MAX_POSTS_PER_PAGE = 10;

/** Maximum number of pinned posts rendered */
export const MAX_PINNED_POSTS = 3;

/** returns up to max pinned posts, preserving the given order
 *  Note: this doesn't filter drafts; pass it the result of getPublishedPosts() in data/entries.ts.
 *  */
export function getPinnedPosts(
	posts: CollectionEntry<"post">[],
	max = MAX_PINNED_POSTS,
): CollectionEntry<"post">[] {
	return posts.filter((post) => post.data.pinned).slice(0, max);
}

/** Groups by publication year, newest year first, preserving entry order within each year. */
export function groupPostsByYear(
	posts: CollectionEntry<"post">[],
): [string, CollectionEntry<"post">[]][] {
	const groups = Object.groupBy(posts, (post) => post.data.publishDate.getFullYear().toString());

	return Object.entries(groups)
		.map(([year, entries]): [string, CollectionEntry<"post">[]] => [year, entries ?? []])
		.toSorted(([a], [b]) => Number(b) - Number(a));
}

/** returns all tags created from entries (inc duplicate tags)
 *  Note: this doesn't filter drafts; pass it the result of getPublishedPosts() in data/entries.ts.
 *  */
export function getAllTags(posts: Entry[]) {
	return posts.flatMap((post) => [...post.data.tags]);
}

/** returns all unique tags created from entries
 *  Note: this doesn't filter drafts; pass it the result of getPublishedPosts() in data/entries.ts.
 *  */
export function getUniqueTags(posts: Entry[]) {
	return [...new Set(getAllTags(posts))];
}

/** returns a count of each unique tag - [[tagName, count], ...]
 *  Note: this doesn't filter drafts; pass it the result of getPublishedPosts() in data/entries.ts.
 *  */
export function getUniqueTagsWithCount(posts: Entry[]): [string, number][] {
	return [
		...getAllTags(posts).reduce(
			(acc, t) => acc.set(t, (acc.get(t) ?? 0) + 1),
			new Map<string, number>(),
		),
	].sort((a, b) => b[1] - a[1]);
}

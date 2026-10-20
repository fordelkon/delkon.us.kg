import { type CollectionEntry, getCollection } from "astro:content";
import { newestFirst } from "./ordering";
import { getAllPosts } from "./post";
import { getSeriesGroups, type SeriesEntry } from "./series";

/** Published posts, newest first. Drafts are hidden in production. */
export async function getPublishedPosts(): Promise<CollectionEntry<"post">[]> {
	return (await getAllPosts()).toSorted(newestFirst);
}

/** Published notes, newest first. Notes have no draft field (docs/writing.md). */
export async function getPublishedNotes(): Promise<CollectionEntry<"note">[]> {
	return (await getCollection("note")).toSorted(newestFirst);
}

// Series identity is (collection, id): a post and a note may share the same id,
// so bare ids must never key membership.
function memberKey(entry: SeriesEntry): string {
	return `${entry.collection}/${entry.id}`;
}

/**
 * Published posts outside any series — the standalone flow of docs/writing.md.
 * Series members surface only through their series page, never in the
 * standalone archive or the home page's pinned and latest sections.
 */
export async function getStandalonePosts(): Promise<CollectionEntry<"post">[]> {
	const [posts, groups] = await Promise.all([getPublishedPosts(), getSeriesGroups("post")]);
	const members = new Set(groups.flatMap((group) => group.entries.map(memberKey)));

	return posts.filter((post) => !members.has(memberKey(post)));
}

/** Published notes outside any series. */
export async function getStandaloneNotes(): Promise<CollectionEntry<"note">[]> {
	const [notes, groups] = await Promise.all([getPublishedNotes(), getSeriesGroups("note")]);
	const members = new Set(groups.flatMap((group) => group.entries.map(memberKey)));

	return notes.filter((note) => !members.has(memberKey(note)));
}

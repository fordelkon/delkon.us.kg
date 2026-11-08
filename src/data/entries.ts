import { type CollectionEntry, getCollection } from "astro:content";
import { newestFirst } from "./ordering";
import { getAllPosts } from "./post";

/** Published posts, newest first. Drafts are hidden in production. */
export async function getPublishedPosts(): Promise<CollectionEntry<"post">[]> {
	return (await getAllPosts()).toSorted(newestFirst);
}

/** Published notes, newest first. Notes have no draft field (docs/writing.md). */
export async function getPublishedNotes(): Promise<CollectionEntry<"note">[]> {
	return (await getCollection("note")).toSorted(newestFirst);
}

/** All published entries share the same topic vocabulary. */
export async function getPublishedEntries() {
	const [posts, notes] = await Promise.all([getPublishedPosts(), getPublishedNotes()]);

	return [...posts, ...notes].toSorted(newestFirst);
}

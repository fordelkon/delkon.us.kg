import { type CollectionEntry, getCollection } from "astro:content";
import { getAllPosts } from "./post";

export type SeriesEntry = CollectionEntry<"post"> | CollectionEntry<"note">;

export interface SeriesGroup {
	id: string;
	title: string;
	description: string | undefined;
	entries: SeriesEntry[];
}

export interface SeriesContext {
	group: SeriesGroup;
	index: number;
	prev: SeriesEntry | undefined;
	next: SeriesEntry | undefined;
}

/**
 * Only a defined top-level directory becomes a series.
 *
 * When `collection` is given, each group keeps only that collection's members
 * and groups without any member of it are dropped, so archive pages list
 * folders scoped to their own collection. Without it, groups contain members
 * from both collections.
 */
export async function getSeriesGroups(collection?: "post" | "note"): Promise<SeriesGroup[]> {
	const [definitions, posts, notes] = await Promise.all([
		getCollection("series"),
		getAllPosts(),
		getCollection("note"),
	]);

	const entries: SeriesEntry[] = [...posts, ...notes];

	return definitions
		.map((definition) => ({
			id: definition.id,
			title: definition.data.title ?? definition.id,
			description: definition.data.description,
			entries: entries
				.filter(
					(entry) =>
						entry.id.includes("/") &&
						entry.id.split("/")[0] === definition.id &&
						(!collection || entry.collection === collection),
				)
				.toSorted(
					(a, b) =>
						a.data.publishDate.getTime() - b.data.publishDate.getTime() ||
						`${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`),
				),
		}))
		.filter((group) => group.entries.length > 0)
		.toSorted((a, b) => a.id.localeCompare(b.id));
}

export function getEntryUrl(entry: SeriesEntry): string {
	return `/${entry.collection === "post" ? "posts" : "notes"}/${entry.id}/`;
}

export async function getSeriesContext(entry: SeriesEntry): Promise<SeriesContext | undefined> {
	const groups = await getSeriesGroups();

	const group = groups.find((candidate) =>
		candidate.entries.some(
			(member) => member.collection === entry.collection && member.id === entry.id,
		),
	);

	if (!group) return undefined;

	const index = group.entries.findIndex(
		(member) => member.collection === entry.collection && member.id === entry.id,
	);

	return { group, index, prev: group.entries[index - 1], next: group.entries[index + 1] };
}

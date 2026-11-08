import { type CollectionEntry, getCollection } from "astro:content";
import { readingOrder } from "./ordering";

export type SeriesEntry = CollectionEntry<"post"> | CollectionEntry<"note">;

export interface SeriesSection {
	id: string;
	title: string;
	entries: SeriesEntry[];
}

export interface SeriesGroup {
	id: string;
	title: string;
	description: string | undefined;
	tags: string[];
	sections: SeriesSection[];
	entries: SeriesEntry[];
}

export interface SeriesContext {
	group: SeriesGroup;
	index: number;
	prev: SeriesEntry | undefined;
	next: SeriesEntry | undefined;
}

/** Qualified keys keep identically named posts and notes distinct. */
function memberKey(entry: SeriesEntry) {
	return `${entry.collection}/${entry.id}`;
}

/** Directory membership preserves existing URLs; editorial order is independent of dates. */
export async function getSeriesGroups(collection?: "post" | "note"): Promise<SeriesGroup[]> {
	const [definitions, posts, notes] = await Promise.all([
		getCollection("series"),
		getCollection("post"),
		getCollection("note"),
	]);

	const allEntries: SeriesEntry[] = [...posts, ...notes];

	return definitions
		.map((definition) => {
			const members = allEntries.filter(
				(entry) => entry.id.includes("/") && entry.id.split("/")[0] === definition.id,
			);

			const keys = new Set(members.map(memberKey));
			const order = definition.data.order;

			if (new Set(order).size !== order.length || order.some((key) => !keys.has(key))) {
				throw new Error(
					`Series ${definition.id}: order must contain unique existing member keys (post/id or note/id).`,
				);
			}

			const sectionTags = definition.data.sections.map((section) => section.tag);

			if (new Set(sectionTags).size !== sectionTags.length) {
				throw new Error(`Series ${definition.id}: section tags must be unique.`);
			}

			const positions = new Map(order.map((key, index) => [key, index]));

			const entries = members
				.filter(
					(entry) =>
						(!collection || entry.collection === collection) &&
						!(import.meta.env.PROD && entry.collection === "post" && entry.data.draft),
				)
				.toSorted(
					(a, b) =>
						(positions.get(memberKey(a)) ?? Number.POSITIVE_INFINITY) -
							(positions.get(memberKey(b)) ?? Number.POSITIVE_INFINITY) || readingOrder(a, b),
				);

			// The first matching section owns an entry; unmatched content stays visible.
			const remaining = new Set(entries);

			const sections: SeriesSection[] = definition.data.sections
				.map((section) => {
					const matches = entries.filter(
						(entry) => remaining.has(entry) && entry.data.tags.includes(section.tag),
					);

					for (const entry of matches) remaining.delete(entry);

					return { id: section.tag, title: section.title, entries: matches };
				})
				.filter((section) => section.entries.length > 0);

			if (sections.length > 0 && remaining.size > 0)
				sections.push({ id: "other", title: "其他题目", entries: [...remaining] });

			return {
				id: definition.id,
				title: definition.data.title ?? definition.id,
				description: definition.data.description,
				tags: definition.data.tags,
				sections,
				entries: sections.length ? sections.flatMap((section) => section.entries) : entries,
			};
		})
		.filter((group) => group.entries.length > 0)
		.toSorted((a, b) => a.id.localeCompare(b.id));
}

export async function getSeriesContext(entry: SeriesEntry): Promise<SeriesContext | undefined> {
	const group = (await getSeriesGroups()).find((candidate) =>
		candidate.entries.some((member) => memberKey(member) === memberKey(entry)),
	);

	if (!group) return undefined;
	const index = group.entries.findIndex((member) => memberKey(member) === memberKey(entry));

	// Topic collections navigate within a section instead of jumping between unrelated topics.
	const siblings =
		group.sections.find((section) =>
			section.entries.some((member) => memberKey(member) === memberKey(entry)),
		)?.entries ?? group.entries;

	const siblingIndex = siblings.findIndex((member) => memberKey(member) === memberKey(entry));

	return { group, index, prev: siblings[siblingIndex - 1], next: siblings[siblingIndex + 1] };
}

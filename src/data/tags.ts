import { getCollection } from "astro:content";
import { getPublishedEntries } from "./entries";
import { getUniqueTagsWithCount } from "./post";

export const tagGroups = [
	{ id: "topic", title: "主题" },
	{ id: "concept", title: "方法与概念" },
	{ id: "language", title: "语言" },
] as const;

export async function getTagDirectory() {
	const [definitions, entries] = await Promise.all([getCollection("tag"), getPublishedEntries()]);
	const metadata = new Map(definitions.map((tag) => [tag.id, tag.data]));

	return getUniqueTagsWithCount(entries)
		.map(([id, count]) => ({
			id,
			count,
			title: metadata.get(id)?.title ?? id,
			group: metadata.get(id)?.group ?? "concept",
			featured: metadata.get(id)?.featured,
		}))
		.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

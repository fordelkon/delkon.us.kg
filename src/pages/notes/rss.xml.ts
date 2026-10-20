import rss from "@astrojs/rss";
import { getPublishedNotes } from "@/data/entries";
import { siteConfig } from "@/site.config";

export const GET = async () => {
	const notes = await getPublishedNotes();

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: import.meta.env.SITE,
		items: notes.map((note) => ({
			title: note.data.title,
			pubDate: note.data.publishDate,
			link: `notes/${note.id}/`,
		})),
	});
};

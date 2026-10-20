import rss from "@astrojs/rss";
import { getPublishedPosts } from "@/data/entries";
import { entryPath } from "@/data/routes";
import { siteConfig } from "@/site.config";

export const GET = async () => {
	const posts = await getPublishedPosts();

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: import.meta.env.SITE,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: entryPath(post),
		})),
	});
};

import { type CollectionEntry, render } from "astro:content";
import { z } from "astro/zod";
import { siteConfig } from "@/site.config";
import { entryUrl } from "./routes";
import type { SeriesContext } from "./series";

type Post = CollectionEntry<"post">;

type Direction = "incoming" | "outgoing" | "reciprocal";

interface PostNeighbor {
	id: string;
	title: string;
	href: string;
	publishTime: number;
	direction: Direction;
}

interface PostEdge {
	source: string;
	target: string;
}

export interface PostNeighborhood {
	neighbors: PostNeighbor[];
	edges: PostEdge[];
}

const destinationsSchema = z.array(z.string());
const site = new URL(siteConfig.url);

export function orderLinkedPosts(neighbors: PostNeighbor[], series: SeriesContext | undefined) {
	const positions = new Map(
		series?.group.entries
			.filter((entry) => entry.collection === "post")
			.map((entry, index) => [entry.id, index]),
	);

	return neighbors.toSorted(
		(a, b) =>
			a.publishTime - b.publishTime ||
			(positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size) ||
			a.id.localeCompare(b.id),
	);
}

function postPath(url: URL): string {
	return decodeURI(url.pathname).replace(/\/$/, "");
}

function resolveDestination(href: string, source: URL, postsByPath: Map<string, Post>) {
	try {
		const url = new URL(href, source);

		if (url.origin === site.origin) return postsByPath.get(postPath(url));
	} catch {
		// Malformed destinations do not identify published posts.
	}

	return undefined;
}

export async function getPostNeighborhoods(posts: Post[]): Promise<Map<string, PostNeighborhood>> {
	const postsByPath = new Map(posts.map((post) => [postPath(new URL(entryUrl(post), site)), post]));
	const outgoing = new Map(posts.map((post) => [post.id, new Set<string>()]));
	const incoming = new Map(posts.map((post) => [post.id, new Set<string>()]));

	await Promise.all(
		posts.map(async (post) => {
			const { remarkPluginFrontmatter } = await render(post);
			const links = destinationsSchema.safeParse(remarkPluginFrontmatter.postLinkDestinations);

			if (!links.success) return;

			const source = new URL(entryUrl(post), site);

			for (const href of links.data) {
				const target = resolveDestination(href, source, postsByPath);

				if (!target || target.id === post.id) continue;

				outgoing.get(post.id)?.add(target.id);
				incoming.get(target.id)?.add(post.id);
			}
		}),
	);

	const sortedPosts = posts.toSorted((left, right) => left.id.localeCompare(right.id));
	const neighborhoods = new Map<string, PostNeighborhood>();

	for (const post of sortedPosts) {
		const neighbors: PostNeighbor[] = [];

		for (const candidate of sortedPosts) {
			const linksOut = outgoing.get(post.id)?.has(candidate.id);
			const linksIn = incoming.get(post.id)?.has(candidate.id);

			if (!linksOut && !linksIn) continue;

			neighbors.push({
				id: candidate.id,
				title: candidate.data.title,
				href: entryUrl(candidate),
				publishTime: candidate.data.publishDate.getTime(),
				direction: linksOut && linksIn ? "reciprocal" : linksOut ? "outgoing" : "incoming",
			});
		}

		const edges = neighbors.map((neighbor) => ({ source: post.id, target: neighbor.id }));

		for (const [index, neighbor] of neighbors.entries()) {
			for (const other of neighbors.slice(index + 1)) {
				if (outgoing.get(neighbor.id)?.has(other.id) || outgoing.get(other.id)?.has(neighbor.id)) {
					edges.push({ source: neighbor.id, target: other.id });
				}
			}
		}

		neighborhoods.set(post.id, { neighbors, edges });
	}

	return neighborhoods;
}

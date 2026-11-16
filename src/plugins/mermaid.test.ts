import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToHtml } from "satteri";
import { satteriMermaidPlugin } from "./mermaid.ts";

const diagram =
	'```mermaid title="发布链" description="A 写入后发布，B 接收后读取。"\nflowchart TB\n A[写入] --> B[读取]\n```';

async function compile(source: string) {
	return markdownToHtml(source, {
		fileURL: new URL("file:///posts/example.md"),
		mdastPlugins: [satteriMermaidPlugin()],
	});
}

test("renders accessible diagrams with unique, resolvable markers in the same document", async () => {
	const { html } = await compile(`${diagram}\n\n${diagram}`);
	const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
	const references = [...html.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);

	assert.equal((html.match(/<figure /g) ?? []).length, 2);
	assert.equal(ids.length, new Set(ids).size);
	assert.ok(references.length > 0);

	for (const reference of references) assert.ok(ids.includes(reference));

	for (const [, reference] of html.matchAll(/aria-describedby="([^"]+)"/g)) {
		assert.ok(ids.includes(reference));
	}

	assert.match(html, /role="img" aria-label="发布链"/);
	assert.match(html, /data-pagefind-ignore="all"/);
	assert.match(html, /<figcaption[^>]*>A 写入后发布，B 接收后读取。<\/figcaption>/);
	assert.match(html, /<svg[^>]* xmlns="http:\/\/www.w3.org\/2000\/svg"/);
	assert.doesNotMatch(html, /<style>|@import|fonts\.googleapis|:xmlns|language-mermaid/);
});

test("preserves text output blocks and escapes diagram descriptions", async () => {
	const { html } = await compile(
		"```text\nA --> B\n```\n\n" +
			diagram.replace("A 写入后发布，B 接收后读取。", "值 < 42 & 尚未发布"),
	);

	assert.match(html, /<code class="language-text">/);
	assert.equal((html.match(/<figure /g) ?? []).length, 1);
	assert.match(html, /值 &lt; 42 &amp; 尚未发布/);
});

test("rejects diagrams without a text explanation", async () => {
	await assert.rejects(
		async () => compile('```mermaid title="发布链"\nflowchart TB\n A --> B\n```'),
		/require title=.*description=/,
	);
});

test("responsive layouts preserve directed edges and share one caption", async () => {
	const source = diagram
		.replace('title="发布链"', 'mobile-direction="TB" title="发布链"')
		.replace("flowchart TB", "flowchart LR");

	const { html } = await compile(source);
	const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);

	const dimensions = [...html.matchAll(/<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/g)].map(
		(match) => [Number(match[1]), Number(match[2])] as const,
	);

	assert.equal(dimensions.length, 2);
	assert.ok(dimensions[0] && dimensions[1]);
	assert.ok(dimensions[0][0] > dimensions[0][1]);
	assert.ok(dimensions[1][0] < dimensions[1][1]);
	assert.equal((html.match(/data-from="A" data-to="B"/g) ?? []).length, 2);
	assert.equal((html.match(/<figcaption/g) ?? []).length, 1);
	assert.equal(ids.length, new Set(ids).size);
});

test("resets diagram identifiers for each compilation", async () => {
	const options = { mdastPlugins: [satteriMermaidPlugin()] };
	const first = await markdownToHtml(diagram, options);
	const second = await markdownToHtml(diagram, options);

	assert.equal(first.html, second.html);
});

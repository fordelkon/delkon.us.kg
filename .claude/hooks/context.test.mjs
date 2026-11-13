import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const documents = ["agent-guide", "testing", "writing", "agent-context-loading"];

function fixture(t) {
	const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "agent-context-test-")));
	const project = path.join(directory, "project");
	const hook = path.join(project, ".claude/hooks/context.mjs");
	mkdirSync(path.dirname(hook), { recursive: true });
	mkdirSync(path.join(project, "docs"));
	copyFileSync(path.join(root, ".claude/hooks/context.mjs"), hook);
	for (const document of documents) {
		copyFileSync(path.join(root, `docs/${document}.md`), path.join(project, `docs/${document}.md`));
	}
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return {
		directory,
		project,
		doc(name, text) {
			writeFileSync(path.join(project, `docs/${name}.md`), text);
		},
		run(file, { session = randomUUID(), tool = "Read", cwd = project } = {}) {
			return spawnSync(process.execPath, [hook], {
				cwd: directory,
				env: { ...process.env, CLAUDE_PROJECT_DIR: project },
				input: JSON.stringify({
					tool_name: tool,
					tool_input: { file_path: file },
					cwd,
					...(session === null ? {} : { session_id: session }),
				}),
				encoding: "utf8",
			});
		},
	};
}

function context(result) {
	assert.equal(result.status, 0, result.stderr);
	if (!result.stdout) return "";
	const output = JSON.parse(result.stdout);
	assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
	const text = output.hookSpecificOutput.additionalContext;
	assert.ok(text.length < 9_500, `Context length: ${text.length}`);
	return text;
}

test("source/configuration routing and session/hash dedupe preserve changed-document reload", (t) => {
	const f = fixture(t);
	f.doc("agent-guide", "SOURCE CONTRACT");
	const session = randomUUID();
	assert.match(context(f.run("src/new.ts", { session })), /SOURCE CONTRACT/);
	assert.equal(context(f.run("astro.config.ts", { session })), "");
	f.doc("agent-guide", "UPDATED CONTRACT");
	assert.match(context(f.run("src/new.ts", { session })), /UPDATED CONTRACT/);
	assert.match(context(f.run("package.json")), /UPDATED CONTRACT/);
});

test("missing or empty sessions do not suppress later context", (t) => {
	const f = fixture(t);
	for (const session of [null, ""]) {
		for (let i = 0; i < 2; i++)
			assert.match(context(f.run("src/new.ts", { session })), /docs\/agent-guide.md/);
	}
});

test("Read/Edit/Write route tests and content by contract regardless of document size", (t) => {
	const f = fixture(t);
	f.doc("testing", "TEST CONTRACT");
	f.doc("writing", "WRITING CONTRACT");
	for (const tool of ["Read", "Edit", "Write"]) {
		assert.match(context(f.run("src/data/example.test.ts", { tool })), /TEST CONTRACT/);
		assert.match(context(f.run("tests/example.ts", { tool })), /TEST CONTRACT/);
		assert.match(context(f.run("content/posts/example.md", { tool })), /WRITING CONTRACT/);
	}
});

test("maintenance paths receive loading and guide contracts in one JSON response", (t) => {
	const f = fixture(t);
	f.doc("agent-guide", "SOURCE CONTRACT");
	f.doc("agent-context-loading", "LOADING CONTRACT");
	f.doc("testing", "TEST CONTRACT");
	for (const file of [
		".claude/hooks/context.mjs",
		".agents/skills/site-engineering/SKILL.md",
		"AGENTS.md",
		"CLAUDE.md",
		"docs/agent-guide.md",
		"docs/agent-context-loading.md",
		"docs/agent-references.md",
	]) {
		const text = context(f.run(file));
		assert.match(text, /LOADING CONTRACT/);
		assert.match(text, /SOURCE CONTRACT/);
	}
	const text = context(f.run(".claude/hooks/context.test.mjs"));
	assert.match(text, /LOADING CONTRACT/);
	assert.match(text, /SOURCE CONTRACT/);
	assert.match(text, /TEST CONTRACT/);
});

test("long documents emit explicit read notices without truncating contracts", (t) => {
	const f = fixture(t);
	for (const content of ["x".repeat(9490), "LONG CONTRACT ".repeat(1000)]) {
		f.doc("writing", content);
		const text = context(f.run("content/notes/new.md"));
		assert.match(text, /read docs\/writing.md/);
		assert.match(text, /does not replace it/);
		assert.doesNotMatch(text, /LONG CONTRACT/);
	}
});

test("combined context budget includes prefixes, separators, and all fallback notices", (t) => {
	const f = fixture(t);
	for (const document of documents) f.doc(document, `${document}: ${"x".repeat(9400)}`);
	const text = context(f.run(".claude/hooks/context.test.mjs"));
	for (const document of ["agent-guide", "agent-context-loading", "testing"])
		assert.match(text, new RegExp(`docs/${document}\\.md`));
	assert.match(text, /Before continuing this task, read/);
});

test("unrelated/external files and shell tools emit no context", (t) => {
	const f = fixture(t);
	for (const file of [
		"LICENSE",
		"docs/other.md",
		"../src/outside.ts",
		"..",
		path.join(f.directory, "src/outside.ts"),
	])
		assert.equal(context(f.run(file)), "");
	assert.equal(context(f.run("src/new.ts", { tool: "Bash" })), "");
	assert.equal(context(f.run(undefined)), "");
});

test("source symlink aliases resolve existing and new paths inside the repository", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	writeFileSync(path.join(f.project, "src/existing.ts"), "export {};\n");
	symlinkSync(path.join(f.project, "src"), path.join(f.project, "alias"));
	assert.match(context(f.run("alias/existing.ts")), /docs\/agent-guide.md/);
	assert.match(context(f.run("alias/missing/deep.ts", { tool: "Write" })), /docs\/agent-guide.md/);
	symlinkSync(f.project, path.join(f.directory, "project-alias"));
	assert.match(
		context(f.run(path.join(f.directory, "project-alias/src/existing.ts"))),
		/docs\/agent-guide.md/,
	);
});

test("external symlink parents exclude existing files and new nested children", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	const outside = path.join(f.directory, "outside");
	mkdirSync(outside);
	writeFileSync(path.join(outside, "existing.ts"), "export {};\n");
	symlinkSync(outside, path.join(f.project, "src/external"));
	for (const file of ["src/external/existing.ts", "src/external/new/deep.ts"])
		assert.equal(context(f.run(file, { tool: "Write" })), "");
});

test("dangling file symlinks exclude the external target that Write would create", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	const outside = path.join(f.directory, "outside");
	mkdirSync(outside);
	const target = path.join(outside, "new.ts");
	const link = path.join(f.project, "src/new.ts");
	symlinkSync(target, link);
	const result = f.run(link, { tool: "Write" });
	writeFileSync(link, "created through dangling link\n");
	assert.equal(readFileSync(target, "utf8"), "created through dangling link\n");
	assert.equal(context(result), "");
});

test("dangling external directory links and link chains exclude new children", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	const outside = path.join(f.directory, "outside");
	mkdirSync(outside);
	symlinkSync(path.join(outside, "missing"), path.join(f.project, "src/directory"));
	symlinkSync(path.join(outside, "new.ts"), path.join(f.project, "src/target.ts"));
	symlinkSync("target.ts", path.join(f.project, "src/chain.ts"));
	for (const file of ["src/directory/new/deep.ts", "src/chain.ts"])
		assert.equal(context(f.run(file, { tool: "Write" })), "");
});

test("dangling internal targets and chains use the target's content routing", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	mkdirSync(path.join(f.project, "content"));
	f.doc("writing", "WRITING TARGET CONTRACT");
	symlinkSync("../content/new.md", path.join(f.project, "src/target.ts"));
	symlinkSync("target.ts", path.join(f.project, "src/chain.ts"));
	symlinkSync("../content/missing", path.join(f.project, "src/directory"));
	for (const file of ["src/target.ts", "src/chain.ts", "src/directory/new/deep.md"]) {
		const text = context(f.run(file, { tool: "Write" }));
		assert.match(text, /WRITING TARGET CONTRACT/);
		assert.doesNotMatch(text, /docs\/agent-guide.md/);
	}
});

test("non-directory ancestors allow new lexical suffixes without hiding unrelated realpath errors", (t) => {
	const f = fixture(t);
	mkdirSync(path.join(f.project, "src"));
	writeFileSync(path.join(f.project, "src/file.ts"), "export {};\n");
	assert.match(context(f.run("src/file.ts/child.ts")), /docs\/agent-guide.md/);
	symlinkSync("loop", path.join(f.project, "src/loop"));
	const result = f.run("src/loop/child.ts");
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /ELOOP/);
	assert.equal(result.stdout, "");
});

test("real copied contracts remain readable in isolated fixtures", (t) => {
	const f = fixture(t);
	assert.match(context(f.run("src/example.ts")), /pnpm check/);
	assert.match(context(f.run("tests/example.ts")), /80% minimum/);
	const writing = readFileSync(path.join(f.project, "docs/writing.md"), "utf8");
	const text = context(f.run("content/posts/example.md"));
	assert.ok(text.includes(writing) || /read docs\/writing.md/.test(text));
});

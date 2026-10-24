// public/ascii contains static frames from ascii.rest 0.4.0
// (https://github.com/bas3line/ascii), with its MIT notice in public/ascii/LICENSE.
// Each piece was evaluated at time zero with { paper: true }; the 404 piece
// uses empty title/message options. Keep the transparent text SVGs single-frame
// and preserve each text row's white-space:pre to retain ASCII alignment.
// CSS masks supply the theme colour without a browser player or runtime dependency.
const icons = new Map([
	["c", "c"],
	["cpp", "cpp"],
	["c++", "cpp"],
	["go", "go"],
	["golang", "go"],
	["rust", "rust"],
	["rs", "rust"],
	["python", "python"],
	["py", "python"],
	["typescript", "typescript"],
	["ts", "typescript"],
	["tsx", "typescript"],
	["javascript", "javascript"],
	["js", "javascript"],
	["jsx", "javascript"],
	["html", "html"],
	["css", "css"],
	["dart", "dart"],
	["git", "git"],
	["linux", "tux"],
]);

export function asciiIcon(name: string) {
	const icon = icons.get(name.toLowerCase());

	return icon ? `/ascii/${icon}.svg` : undefined;
}

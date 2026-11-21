import { effect, frame, init, sampler, surface, type Texture, texture } from "vgpu";
import curlShader from "./sticker-peel.wgsl";
import { type Fold, gripTravel, type Vector } from "./sticker-peel-geometry";

export interface StickerRenderer {
	load(srcset: string): Promise<Texture>;
	paint(artwork: Texture, size: Vector, fold: Fold, remounted: boolean): void;
	dispose(): void;
}

const padding = 8;
const pixelBudget = 65_536;
const maxPixelRatio = 1.5;

// Size cached textures for the tallest desk sticker across responsive layouts.
const maxStickerHeight = 168;

// For each edge perpendicular to this axis, its deepest corner moves furthest.
// Travel is convex in depth, so the sheet between those corners cannot overshoot both.
function curlOverhang(
	axis: number,
	length: number,
	depth: number,
	radius: number,
	reach: number,
): number {
	const component = Math.abs(axis);
	const farDepth = Math.max(0, depth - component * length);
	const beyond = Math.max(component * reach - length, component * gripTravel(farDepth, radius));

	return Math.ceil(Math.max(0, beyond - padding) / 32) * 32;
}

export async function createStickerRenderer(
	canvas: HTMLCanvasElement,
	signal: AbortSignal,
	onFailure: () => void,
): Promise<StickerRenderer> {
	const gpu = await init({ label: "Desk sticker curl" });

	try {
		signal.throwIfAborted();

		const target = surface(gpu, canvas, {
			alphaMode: "premultiplied",
			autoResize: false,
			size: [1, 1],
			clearColor: [0, 0, 0, 0],
		});

		const paintCurl = effect(gpu, curlShader, {
			set: { imageSampler: sampler(gpu, { minFilter: "linear", magFilter: "linear" }) },
		});

		await paintCurl.compile(target);
		signal.throwIfAborted();

		gpu.onError(onFailure);
		void gpu.lost.then(() => {
			if (!gpu.disposed) onFailure();
		});

		const uploads = new Map<string, Promise<Texture>>();
		let boundArtwork: Texture | undefined;
		let boundWidth = 0;
		let boundHeight = 0;
		let targetBounds: readonly [number, number, number, number] | undefined;
		let lastFold: Fold | undefined;

		async function upload(srcset: string, height: number): Promise<Texture> {
			const source = new Image();
			source.srcset = srcset;
			await source.decode();
			signal.throwIfAborted();

			const bitmap = await createImageBitmap(source, {
				resizeHeight: height,
				resizeQuality: "high",
			});

			try {
				signal.throwIfAborted();

				const size = [bitmap.width, bitmap.height] as const;

				const image = texture(gpu, {
					kind: "2d",
					size,
					format: "rgba8unorm",
					usage: ["copy_dst", "render_attachment", "texture_binding"],
				});

				gpu.gpu.queue.copyExternalImageToTexture(
					{ source: bitmap },
					{ texture: image.gpu, premultipliedAlpha: true },
					size,
				);

				return image;
			} finally {
				bitmap.close();
			}
		}

		return {
			load(srcset: string): Promise<Texture> {
				const height = maxStickerHeight * (window.devicePixelRatio <= 1 ? 1 : maxPixelRatio);
				const key = `${srcset}@${height}`;
				const existing = uploads.get(key);

				if (existing) return existing;

				const pending = upload(srcset, height);

				uploads.set(key, pending);

				return pending;
			},
			paint(artwork, [width, height], fold, remounted): void {
				const [nx, ny] = fold.direction;
				const from = Math.min(0, nx * width) + Math.min(0, ny * height);
				const depth = Math.max(0, fold.crease - from);
				const reach = gripTravel(depth, fold.radius);
				const extraX = curlOverhang(nx, width, depth, fold.radius, reach);
				const extraY = curlOverhang(ny, height, depth, fold.radius, reach);
				const left = -padding - (nx < 0 ? extraX : 0);
				const top = -padding - (ny < 0 ? extraY : 0);
				const viewWidth = width + 2 * padding + extraX;
				const viewHeight = height + 2 * padding + extraY;

				const dpr = Math.min(
					window.devicePixelRatio,
					maxPixelRatio,
					Math.sqrt(pixelBudget / (viewWidth * viewHeight)),
				);

				const pixelWidth = Math.floor(viewWidth * dpr);
				const pixelHeight = Math.floor(viewHeight * dpr);
				const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight;

				const remapped =
					left !== targetBounds?.[0] ||
					top !== targetBounds[1] ||
					viewWidth !== targetBounds[2] ||
					viewHeight !== targetBounds[3];

				const changedArtwork = artwork !== boundArtwork;
				const changedSize = width !== boundWidth || height !== boundHeight;

				if (resized) target.resize([pixelWidth, pixelHeight]);

				if (remapped) {
					targetBounds = [left, top, viewWidth, viewHeight];
					canvas.style.left = `${left}px`;
					canvas.style.top = `${top}px`;
					canvas.style.width = `${viewWidth}px`;
					canvas.style.height = `${viewHeight}px`;
					paintCurl.set({ viewport: targetBounds });
				}

				if (changedArtwork) {
					paintCurl.set({ artwork });
					boundArtwork = artwork;
				}

				if (changedSize) {
					paintCurl.set({ sheet: [width, height, 0, 0] });
					boundWidth = width;
					boundHeight = height;
				}

				const bent =
					fold.crease !== lastFold?.crease ||
					fold.radius !== lastFold.radius ||
					nx !== lastFold.direction[0] ||
					ny !== lastFold.direction[1];

				if (bent) {
					paintCurl.set({ fold: [nx, ny, fold.crease, fold.radius] });
					lastFold = fold;
				}

				if (remounted || resized || remapped || changedArtwork || changedSize || bent)
					frame(gpu, (current) => current.pass(target, paintCurl));
			},
			dispose(): void {
				gpu.dispose();
			},
		};
	} catch (error) {
		gpu.dispose();
		throw error;
	}
}

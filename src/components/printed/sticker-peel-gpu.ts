import { effect, frame, init, sampler, surface, type Texture, texture } from "vgpu";
import curlShader from "./sticker-peel.wgsl";
import { type Fold, gripTravel, type Vector } from "./sticker-peel-geometry";

export interface StickerRenderer {
	load(src: string): Promise<Texture>;
	paint(artwork: Texture, size: Vector, fold: Fold, remounted: boolean): void;
	dispose(): void;
}

const padding = 8;
const pixelBudget = 65_536;
const maxPixelRatio = 1.5;

// The tallest desk sticker is 168 CSS pixels, or 252 pixels at the render cap.
const artworkHeight = 256;

function bucket(value: number): number {
	return Math.ceil(value / 32) * 32;
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

		async function upload(src: string): Promise<Texture> {
			const response = await fetch(src, { signal });

			if (!response.ok) throw new Error("Sticker image could not be loaded");

			const bitmap = await createImageBitmap(await response.blob(), {
				resizeHeight: artworkHeight,
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
			load(src: string): Promise<Texture> {
				const existing = uploads.get(src);

				if (existing) return existing;

				const pending = upload(src);

				uploads.set(src, pending);

				return pending;
			},
			paint(artwork, [width, height], fold, remounted): void {
				const [nx, ny] = fold.direction;
				const from = Math.min(0, nx * width) + Math.min(0, ny * height);
				const reach = gripTravel(Math.max(0, fold.crease - from), fold.radius);
				const left = -padding - bucket(Math.max(0, -nx * reach - padding));
				const top = -padding - bucket(Math.max(0, -ny * reach - padding));
				const viewWidth = width + padding - left + bucket(Math.max(0, nx * reach - padding));
				const viewHeight = height + padding - top + bucket(Math.max(0, ny * reach - padding));

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

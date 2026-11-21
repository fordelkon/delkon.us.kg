/// <reference types="@vgpu/wgsl/wgsl-types" />

declare module "@pagefind/default-ui" {
	interface PagefindUIOptions {
		element?: string | HTMLElement;
	}

	class PagefindUI {
		constructor(arg: PagefindUIOptions);
	}
}

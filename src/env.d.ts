declare module "@pagefind/default-ui" {
	interface PagefindUIOptions {
		element?: string | HTMLElement;
	}

	class PagefindUI {
		constructor(arg: PagefindUIOptions);
	}
}

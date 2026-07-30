import { cleanup, render } from "./pure.mjs";
import { page } from "vitest/browser";
import { beforeEach } from "vitest";
//#region src/index.ts
page.extend({
	render,
	[Symbol.for("vitest:component-cleanup")]: cleanup
});
beforeEach(() => {
	cleanup();
});
//#endregion
export { cleanup, render };

//# sourceMappingURL=index.mjs.map
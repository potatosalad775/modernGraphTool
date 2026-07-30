import { page, server, utils } from "vitest/browser";
import { cleanup, render as render$1, wrapperSetup } from "@testing-library/svelte-core";
//#region src/pure.ts
const { debug, getElementLocatorSelectors } = utils;
/**
* Render a component into the document and record a `svelte.render` trace mark.
*
* @param Component - The component to render.
* @param options - Customize how Svelte renders the component.
* @param renderOptions - Customize how the document and queries are set up.
* @returns The rendered component and bound testing functions.
*/
async function render(Component, options = {}, renderOptions = {}) {
	if (renderOptions.wrapper) await wrapperSetup();
	const { baseElement, container, component, wrapper, rerender, unmount } = render$1(Component, options, renderOptions);
	ensureTestIdAttribute(baseElement);
	ensureTestIdAttribute(container);
	const queries = getElementLocatorSelectors(baseElement);
	const locator = page.elementLocator(container);
	const result = {
		baseElement,
		component,
		wrapper,
		container,
		locator,
		rerender: async (props) => {
			await rerender(props);
			await mark(locator, "svelte.rerender", result.rerender);
		},
		unmount: async () => {
			unmount();
			await mark(locator, "svelte.unmount", result.unmount);
		},
		debug: (el = baseElement) => {
			debug(el);
		},
		...queries
	};
	await mark(locator, "svelte.render", render);
	return result;
}
async function mark(locator, name, fn) {
	if (!locator.mark) return;
	const error = new Error(name);
	if ("captureStackTrace" in Error && typeof Error.captureStackTrace === "function") Error.captureStackTrace(error, fn);
	await locator.mark(name, error);
}
let idx = 0;
function ensureTestIdAttribute(element) {
	const attributeId = server.config.browser.locators.testIdAttribute;
	if (!element.hasAttribute(attributeId)) element.setAttribute(attributeId, `__vitest_${idx++}__`);
}
//#endregion
export { cleanup, render };

//# sourceMappingURL=pure.mjs.map
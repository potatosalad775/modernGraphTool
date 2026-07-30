import { Locator, LocatorSelectors } from "vitest/browser";
import { cleanup } from "@testing-library/svelte-core";
import { Component, Component as Component$1, ComponentImport, ComponentImport as ComponentImport$1, ComponentOptions, ComponentOptions as ComponentOptions$1, Exports, Exports as Exports$1, Rerender, Rerender as Rerender$1, SetupOptions, SetupOptions as SetupOptions$1 } from "@testing-library/svelte-core/types";

//#region src/pure.d.ts
/** The rendered component and bound testing functions. */
interface RenderResult<C extends Component$1, W extends Component$1 = never> extends LocatorSelectors {
  container: HTMLElement;
  baseElement: HTMLElement;
  component: Exports$1<C>;
  wrapper: Exports$1<W>;
  debug: (el?: HTMLElement) => void;
  /** Update the component props and record a `svelte.rerender` trace mark. */
  rerender: Rerender$1<C>;
  /** Unmount the component and record a `svelte.unmount` trace mark. */
  unmount: () => Promise<void>;
  locator: Locator;
}
/**
 * Render a component into the document and record a `svelte.render` trace mark.
 *
 * @param Component - The component to render.
 * @param options - Customize how Svelte renders the component.
 * @param renderOptions - Customize how the document and queries are set up.
 * @returns The rendered component and bound testing functions.
 */
declare function render<C extends Component$1, W extends Component$1 = never>(Component: ComponentImport$1<C>, options?: ComponentOptions$1<C>, renderOptions?: SetupOptions$1<W>): Promise<RenderResult<C, W>>;
//#endregion
export { type Component, type ComponentImport, type ComponentOptions, type Exports, type RenderResult, type Rerender, type SetupOptions, cleanup, render };
//# sourceMappingURL=pure.d.mts.map
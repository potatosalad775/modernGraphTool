import { Component, ComponentImport, ComponentOptions, Exports, RenderResult, Rerender, SetupOptions, cleanup, render } from "./pure.mjs";

//#region src/index.d.ts
declare module 'vitest/browser' {
  interface BrowserPage {
    render: typeof render;
  }
} //# sourceMappingURL=index.d.ts.map
//#endregion
export { type Component, type ComponentImport, type ComponentOptions, type Exports, type RenderResult, type Rerender, type SetupOptions, cleanup, render };
//# sourceMappingURL=index.d.mts.map
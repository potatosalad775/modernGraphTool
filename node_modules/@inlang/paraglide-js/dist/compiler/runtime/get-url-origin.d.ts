/**
 * The origin of the current URL.
 *
 * Defaults to "http://y.com" in non-browser environments. If this
 * behavior is not desired, the implementation can be overwritten
 * by `overwriteGetUrlOrigin()`.
 *
 * @type {() => string}
 */
export let getUrlOrigin: () => string;
export function overwriteGetUrlOrigin(fn: () => string): void;
//# sourceMappingURL=get-url-origin.d.ts.map
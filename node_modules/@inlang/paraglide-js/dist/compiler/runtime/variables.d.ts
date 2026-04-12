/**
 * Returns the strategy to use for a specific URL.
 *
 * If no route strategy matches (or the matching rule is `exclude: true`),
 * the global strategy is returned.
 *
 * @param {string | URL} url
 * @returns {typeof strategy}
 */
export function getStrategyForUrl(url: string | URL): typeof strategy;
/**
 * Returns whether the given URL is excluded from middleware i18n processing.
 *
 * @param {string | URL} url
 * @returns {boolean}
 */
export function isExcludedByRouteStrategy(url: string | URL): boolean;
/**
 * Sets the server side async local storage.
 *
 * The function is needed because the `runtime.js` file
 * must define the `serverAsyncLocalStorage` variable to
 * avoid a circular import between `runtime.js` and
 * `server.js` files.
 *
 * @param {ParaglideAsyncLocalStorage | undefined} value
 */
export function overwriteServerAsyncLocalStorage(value: ParaglideAsyncLocalStorage | undefined): void;
/**
 * The project's base locale.
 *
 * @example
 *   if (locale === baseLocale) {
 *     // do something
 *   }
 */
export const baseLocale: "en";
/**
 * The project's locales that have been specified in the settings.
 *
 * @example
 *   if (locales.includes(userSelectedLocale) === false) {
 *     throw new Error('Locale is not available');
 *   }
 */
export const locales: readonly string[];
/** @type {string} */
export const cookieName: string;
/** @type {number} */
export const cookieMaxAge: number;
/** @type {string} */
export const cookieDomain: string;
/** @type {string} */
export const localStorageKey: string;
/**
 * @type {Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>}
 */
export const strategy: Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>;
/**
 * Route-level strategy overrides.
 *
 * `match` uses URLPattern syntax.
 *
 * @type {Array<{
 *   match: string;
 *   strategy?: Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>;
 *   exclude?: boolean;
 * }>}
 */
export const routeStrategies: Array<{
    match: string;
    strategy?: Array<"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage" | `custom-${string}`>;
    exclude?: boolean;
}>;
/**
 * The used URL patterns.
 *
 * @type {Array<{ pattern: string, localized: Array<[Locale, string]> }>}
 */
export const urlPatterns: Array<{
    pattern: string;
    localized: Array<[Locale, string]>;
}>;
/**
 * @typedef {{
 * 		getStore(): {
 *   		locale?: Locale,
 * 			origin?: string,
 * 			messageCalls?: Set<string>
 *   	} | undefined,
 * 		run: (store: { locale?: Locale, origin?: string, messageCalls?: Set<string>},
 *    cb: any) => any
 * }} ParaglideAsyncLocalStorage
 */
/**
 * Server side async local storage that is set by `serverMiddleware()`.
 *
 * The variable is used to retrieve the locale and origin in a server-side
 * rendering context without effecting other requests.
 *
 * @type {ParaglideAsyncLocalStorage | undefined}
 */
export let serverAsyncLocalStorage: ParaglideAsyncLocalStorage | undefined;
export const disableAsyncLocalStorage: false;
export const experimentalMiddlewareLocaleSplitting: false;
export const isServer: boolean;
/** @type {Locale | undefined} */
export const experimentalStaticLocale: Locale | undefined;
export const TREE_SHAKE_COOKIE_STRATEGY_USED: false;
export const TREE_SHAKE_URL_STRATEGY_USED: false;
export const TREE_SHAKE_GLOBAL_VARIABLE_STRATEGY_USED: false;
export const TREE_SHAKE_PREFERRED_LANGUAGE_STRATEGY_USED: false;
export const TREE_SHAKE_DEFAULT_URL_PATTERN_USED: false;
export const TREE_SHAKE_LOCAL_STORAGE_STRATEGY_USED: false;
export type ParaglideAsyncLocalStorage = {
    getStore(): {
        locale?: Locale;
        origin?: string;
        messageCalls?: Set<string>;
    } | undefined;
    run: (store: {
        locale?: Locale;
        origin?: string;
        messageCalls?: Set<string>;
    }, cb: any) => any;
};
//# sourceMappingURL=variables.d.ts.map
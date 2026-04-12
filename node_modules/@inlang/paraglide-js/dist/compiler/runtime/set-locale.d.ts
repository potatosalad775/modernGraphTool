/**
 * @typedef {(newLocale: Locale, options?: { reload?: boolean }) => void | Promise<void>} SetLocaleFn
 */
/**
 * Set the locale.
 *
 * Updates the locale using your configured strategies (cookie, localStorage, URL, etc.).
 * By default, this reloads the page on the client to reflect the new locale. Reloading
 * can be disabled by passing `reload: false` as an option, but you'll need to ensure
 * the UI updates to reflect the new locale.
 *
 * If any custom strategy's `setLocale` function is async, then this function
 * will become async as well.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy
 *
 * @example
 *   setLocale('en');
 *
 * @example
 *   setLocale('en', { reload: false });
 *
 * @type {SetLocaleFn}
 */
export let setLocale: SetLocaleFn;
export function overwriteSetLocale(fn: SetLocaleFn): void;
export type SetLocaleFn = (newLocale: Locale, options?: {
    reload?: boolean;
}) => void | Promise<void>;
//# sourceMappingURL=set-locale.d.ts.map
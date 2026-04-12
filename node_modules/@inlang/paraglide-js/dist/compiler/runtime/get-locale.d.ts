/**
 * Resolve locale for a given URL using route-aware strategies.
 *
 * @param {string | URL} url
 * @returns {Locale}
 */
export function getLocaleForUrl(url: string | URL): Locale;
export function getLocale(): Locale;
export function overwriteGetLocale(fn: () => Locale): void;
//# sourceMappingURL=get-locale.d.ts.map
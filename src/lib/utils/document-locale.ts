import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';

/**
 * Mirrors the resolved UI locale onto `<html lang dir>`.
 *
 * The locale is resolved in the browser (localStorage, then the browser language), and this is a
 * static SPA, so nothing server-side can stamp the right value into the document. Without it a
 * screen reader reads a Korean UI with English pronunciation rules. A locale change goes through
 * Paraglide's `setLocale`, which reloads the page, so applying this once at boot covers it.
 */
export function applyDocumentLocale(root: { lang: string; dir: string }): void {
	const locale = getLocale();
	root.lang = locale;
	root.dir = getTextDirection(locale);
}

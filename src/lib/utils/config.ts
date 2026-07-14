import { browser } from '$app/environment';
import { getLocale } from '$lib/paraglide/runtime';

type I18nValue<T> = T | { default: T; i18n: Record<string, T> };

/** Resolves an operator config value that may be plain or i18n-wrapped.
 *  When both default and i18n values are arrays of objects, each entry is
 *  merged by index so omitted fields (e.g. `files` in TARGET_MANIFEST) fall
 *  back to the default entry rather than disappearing entirely.
 */
export function resolveI18nValue<T>(value: I18nValue<T>, lang: string): T {
	if (typeof value === 'object' && value !== null && 'default' in value && 'i18n' in value) {
		const wrapper = value as { default: T; i18n: Record<string, T> };
		const localized = wrapper.i18n[lang];
		if (localized === undefined) return wrapper.default;
		if (Array.isArray(wrapper.default) && Array.isArray(localized)) {
			return (localized as unknown[]).map((item, i) => {
				const def = (wrapper.default as unknown[])[i];
				if (typeof item === 'object' && item !== null && typeof def === 'object' && def !== null) {
					return { ...(def as object), ...(item as object) };
				}
				return item;
			}) as T;
		}
		return localized;
	}
	return value as T;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>((acc, key) => (acc as Record<string, unknown> | null | undefined)?.[key], obj);
}

export function getConfigValue(path: string): unknown {
	if (!browser) return undefined;
	const cfg = window.GRAPHTOOL_CONFIG ?? {};
	const raw = getNestedValue(cfg, path);
	return resolveI18nValue(raw, getLocale());
}

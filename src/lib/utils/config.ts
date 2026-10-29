import { browser } from '$app/env';
import { getLocale } from '#lib/paraglide/runtime.js';

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

/**
 * Drops later entries whose key repeats an earlier one, warning once per drop.
 *
 * For operator lists the UI renders with a keyed `{#each}`: a repeated key throws
 * during render and takes the whole app down, so a copy-pasted entry has to be
 * caught where the config is read. The first entry wins.
 */
export function uniqueBy<T>(items: T[], keyOf: (item: T) => unknown, what: string): T[] {
	const seen = new Set<unknown>();
	return items.filter((item) => {
		const key = keyOf(item);
		if (seen.has(key)) {
			console.warn(`[modernGraphTool] config.js: skipping duplicate ${what} "${String(key)}"`);
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * `TARGET_MANIFEST` as the target list renders it. Groups sharing a `type` fold into the
 * first one, and a file listed twice — `"Harman"` beside `"Harman Target"` counts — keeps
 * its first spelling, since both rows and groups are keyed. A group without a `files`
 * array is skipped.
 */
export function foldTargetManifest(raw: unknown): { type: string; files: string[] }[] {
	if (!Array.isArray(raw)) return [];
	const byType = new Map<string, string[]>();
	for (const group of raw as { type: string; files?: unknown }[]) {
		if (!Array.isArray(group?.files)) continue;
		const files = byType.get(group.type) ?? [];
		byType.set(group.type, [...files, ...(group.files as string[])]);
	}
	return [...byType].map(([type, files]) => ({
		type,
		files: uniqueBy(
			files,
			(file) => (file.includes(' Target') ? file : `${file} Target`),
			`TARGET_MANIFEST file in "${type}"`
		)
	}));
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

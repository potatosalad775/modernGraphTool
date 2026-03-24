import { browser } from '$app/environment';
import { getLocale } from '$lib/paraglide/runtime';

type I18nValue<T> = T | { default: T; i18n: Record<string, T> };

/** Resolves an operator config value that may be plain or i18n-wrapped. */
function resolveI18nValue<T>(value: I18nValue<T>, lang: string): T {
  if (typeof value === 'object' && value !== null && 'default' in value && 'i18n' in value) {
    return (value as { default: T; i18n: Record<string, T> }).i18n[lang] ?? (value as any).default;
  }
  return value as T;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => (acc as any)?.[key], obj);
}

export function getConfigValue(path: string): unknown {
  if (!browser) return undefined;
  const cfg = (window as any).GRAPHTOOL_CONFIG ?? {};
  const raw = getNestedValue(cfg, path);
  return resolveI18nValue(raw, getLocale());
}

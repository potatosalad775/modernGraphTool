/**
 * Shared helpers for the i18n scripts (check-translations.js, apply-translations.js).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const MESSAGES_DIR = join(import.meta.dirname, '..', 'messages');
export const BASE_LOCALE = 'en';
export const MISSING_PREFIX = '_missing_translations_';
export const INFO_KEY = '@@info';

export const missingFileName = (locale) => `${MISSING_PREFIX}${locale}.json`;

export const readJson = (fileName) =>
	JSON.parse(readFileSync(join(MESSAGES_DIR, fileName), 'utf-8'));

/** Written with tabs + trailing newline to match the existing message files. */
export const writeJson = (fileName, obj) =>
	writeFileSync(join(MESSAGES_DIR, fileName), JSON.stringify(obj, null, '\t') + '\n');

/** Message keys only — drops `$schema` and `@@info` metadata. */
export const messageKeys = (obj) =>
	Object.keys(obj).filter((k) => !k.startsWith('$') && !k.startsWith('@@'));

/**
 * Locales that Paraglide actually compiles — i.e. `messages/<locale>.json`, excluding the
 * `_missing_translations_*.json` staging files (Paraglide ignores those; it only reads the
 * locales listed in project.inlang/settings.json).
 */
export const listLocales = () =>
	readdirSync(MESSAGES_DIR)
		.filter((f) => f.endsWith('.json') && !f.startsWith(MISSING_PREFIX))
		.map((f) => f.replace(/\.json$/, ''));

export const listMissingFiles = () =>
	readdirSync(MESSAGES_DIR).filter((f) => f.startsWith(MISSING_PREFIX) && f.endsWith('.json'));

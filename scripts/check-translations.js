/**
 * Reports missing / stale keys in each messages/<locale>.json against the baseLocale (en).
 *
 * Missing keys are NOT a build error — Paraglide compiles them to a fallback on the baseLocale
 * (see the i18n section of AGENTS.md). This script is contributor visibility only and always
 * exits 0.
 *
 * Usage:
 *   node scripts/check-translations.js            # report only
 *   node scripts/check-translations.js --write    # also write messages/_missing_translations_<locale>.json
 */

import { unlinkSync } from 'fs';
import { join } from 'path';
import {
	MESSAGES_DIR,
	BASE_LOCALE,
	INFO_KEY,
	missingFileName,
	readJson,
	writeJson,
	messageKeys,
	listLocales
} from './i18n-shared.js';

const write = process.argv.includes('--write');

const base = readJson(`${BASE_LOCALE}.json`);
const baseKeys = messageKeys(base);
const baseKeySet = new Set(baseKeys);

const locales = listLocales().filter((l) => l !== BASE_LOCALE);

const info = (locale) => [
	`Keys that exist in <${BASE_LOCALE}> but not in <${locale}>.`,
	`The values below are the ${BASE_LOCALE} source text — replace them with ${locale} translations.`,
	`You do not have to translate all of them; leave out what you are unsure about and open a PR.`,
	`A maintainer then runs 'npm run i18n:apply' to merge this file into messages/${locale}.json.`,
	`Anything still missing afterwards simply renders in ${BASE_LOCALE} at runtime.`
];

let anyGaps = false;

for (const locale of locales) {
	const target = readJson(`${locale}.json`);
	const targetKeys = new Set(messageKeys(target));

	const missing = baseKeys.filter((k) => !targetKeys.has(k));
	const stale = [...targetKeys].filter((k) => !baseKeySet.has(k));
	const fileName = missingFileName(locale);

	if (missing.length === 0 && stale.length === 0) {
		// Locale caught up — drop any stale staging file left over from a previous run.
		if (write) {
			try {
				unlinkSync(join(MESSAGES_DIR, fileName));
				console.log(`${locale}: in sync — removed ${fileName}`);
			} catch {
				// no staging file to clean up
			}
		}
		continue;
	}

	anyGaps = true;
	console.log(`\n${locale}:`);

	if (missing.length > 0) {
		console.log(`  missing (${missing.length}, falls back to ${BASE_LOCALE}):`);
		for (const k of missing) console.log(`    - ${k}`);

		if (write) {
			const stub = { [INFO_KEY]: info(locale) };
			for (const k of missing) stub[k] = base[k];
			writeJson(fileName, stub);
			console.log(`  -> wrote messages/${fileName}`);
		}
	}

	if (stale.length > 0) {
		console.log(`  stale (${stale.length}, not in ${BASE_LOCALE}, safe to remove):`);
		for (const k of stale) console.log(`    - ${k}`);
	}
}

if (!anyGaps) {
	console.log(`All locales in sync with ${BASE_LOCALE}.`);
} else if (!write) {
	console.log(`\nRun 'npm run i18n:missing' to write the gaps into editable stub files.`);
}

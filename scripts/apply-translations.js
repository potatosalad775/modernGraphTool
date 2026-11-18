/**
 * Merges messages/_missing_translations_<locale>.json staging files back into their
 * messages/<locale>.json dictionaries, then deletes the staging files.
 *
 * The staging files are produced by `npm run i18n:missing` and edited by contributors — this is
 * the maintainer-side half of that flow. Keys are written in messages/en.json order so the diffs
 * stay readable.
 *
 * By default, a stub value that's identical to the en.json source is skipped — translators
 * sometimes leave a key untouched or a proper noun genuinely stays in English, but an unreviewed
 * copy shouldn't silently overwrite the fallback. Pass --force to import those too.
 *
 * Plural shorthand in the staging files (see i18n-plural.js) is expanded into Paraglide's variant
 * format on the way in, and a key that would use an input en.json doesn't is skipped.
 *
 * Usage:
 *   node scripts/apply-translations.js            # merge and delete the staging files
 *   node scripts/apply-translations.js --dry-run  # report what would be merged, change nothing
 *   node scripts/apply-translations.js --force    # also import values identical to en.json
 *   node scripts/apply-translations.js --strict   # exit 1 if a translated entry was skipped
 *
 * --strict is for the `/apply` workflow, which pushes the result to a contributor's PR: the staging
 * file is deleted either way, so an entry skipped for a mistake (a malformed plural, an unknown
 * input) would take the translator's work with it. Untranslated entries and keys en.json no longer
 * has are still skipped quietly. The caller discards the working tree on a non-zero exit.
 */

import { unlinkSync } from 'fs';
import { join } from 'path';
import {
	MESSAGES_DIR,
	BASE_LOCALE,
	MISSING_PREFIX,
	readJson,
	writeJson,
	messageKeys,
	listLocales,
	listMissingFiles
} from './i18n-shared.js';
import { toVariant, messageInputs, isVariant } from './i18n-plural.js';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const strict = process.argv.includes('--strict');

const base = readJson(`${BASE_LOCALE}.json`);
const baseKeys = messageKeys(base);
const baseKeySet = new Set(baseKeys);
const knownLocales = new Set(listLocales());

const files = listMissingFiles();

if (files.length === 0) {
	console.log('No _missing_translations_*.json files to apply.');
	process.exit(0);
}

let applied = 0;
/** Translated entries skipped for a mistake someone can fix. */
let rejected = 0;

for (const fileName of files) {
	const locale = fileName.slice(MISSING_PREFIX.length, -'.json'.length);

	if (!knownLocales.has(locale)) {
		console.warn(`${fileName}: no messages/${locale}.json — skipping (add the locale first).`);
		continue;
	}

	const stub = readJson(fileName);
	const target = readJson(`${locale}.json`);
	const targetKeys = new Set(messageKeys(target));

	const merged = {};
	const unknown = [];
	const sameAsEnglish = [];

	for (const key of messageKeys(stub)) {
		if (!baseKeySet.has(key)) {
			unknown.push(key);
			continue;
		}
		// Plural shorthand is expanded here; plain strings and full variant arrays pass through.
		const { value, errors, warnings } = toVariant(stub[key], locale);
		for (const w of warnings) console.warn(`  ${locale}: '${key}': ${w}.`);
		if (errors.length > 0) {
			for (const e of errors) {
				console.warn(`  ${locale}: '${key}': ${e} — skipping (stays on fallback).`);
			}
			rejected++;
			continue;
		}
		// An input en doesn't pass would render "undefined" and break the m.key() call types.
		const allowed = messageInputs(base[key]);
		const extra = [...messageInputs(value)].filter((name) => !allowed.has(name));
		if (extra.length > 0) {
			console.warn(
				`  ${locale}: '${key}' uses {${extra.join('}, {')}}, which ${BASE_LOCALE}.json doesn't — skipping.`
			);
			rejected++;
			continue;
		}
		// A staging file older than a hand-written plural would quietly flatten it back.
		if (!force && typeof value === 'string' && isVariant(target[key])) {
			console.warn(
				`  ${locale}: '${key}' would replace a plural with a plain string — skipping (use --force to import anyway).`
			);
			rejected++;
			continue;
		}
		if (!force && JSON.stringify(value) === JSON.stringify(base[key])) {
			sameAsEnglish.push(key);
			continue;
		}
		merged[key] = value;
	}

	for (const key of unknown) {
		console.warn(`  ${locale}: '${key}' is not in ${BASE_LOCALE}.json — skipping.`);
	}
	for (const key of sameAsEnglish) {
		console.warn(
			`  ${locale}: '${key}' is identical to ${BASE_LOCALE}.json — skipping (use --force to import anyway).`
		);
	}

	// Rebuild in en.json key order. Keys the locale already had win over the stub only if the
	// stub left them untouched; an edited stub value is the newer one, so it takes precedence.
	const next = {};
	if (target.$schema) next.$schema = target.$schema;
	for (const key of baseKeys) {
		const value = merged[key] ?? target[key];
		if (value !== undefined) next[key] = value;
	}
	// Preserve any stale keys (present in the locale but no longer in en) rather than dropping
	// them silently — `npm run i18n:check` reports these so they can be removed deliberately.
	for (const key of targetKeys) {
		if (!baseKeySet.has(key)) next[key] = target[key];
	}

	const added = Object.keys(merged).filter((k) => !targetKeys.has(k)).length;
	const updated = Object.keys(merged).length - added;

	if (dryRun) {
		console.log(`${locale}: would add ${added}, update ${updated} (dry run, nothing written)`);
		continue;
	}

	await writeJson(`${locale}.json`, next);
	unlinkSync(join(MESSAGES_DIR, fileName));
	applied += added + updated;
	console.log(`${locale}: added ${added}, updated ${updated} — merged and removed ${fileName}`);
}

if (strict && rejected > 0) {
	console.error(
		`\n${rejected} translated entry(s) were skipped, listed above. Fix them in the staging file.`
	);
	process.exit(1);
}

if (!dryRun && applied > 0) {
	console.log(`\nDone. Run 'npm run i18n:check' to see what is still untranslated.`);
}

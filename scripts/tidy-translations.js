/**
 * Puts every messages/*.json file into one canonical shape, so translation PRs merge cleanly.
 *
 * The problem it solves: Fink (and hand edits) append a key wherever they like. When two branches
 * add the same key in different places, git merges both copies without a conflict and the file
 * ends up with a duplicate key — JSON.parse silently keeps one, so nothing notices until the two
 * copies drift. With one fixed key order, both branches write the key at the same spot and git
 * collapses the identical lines into one.
 *
 * What it does, per file:
 *  - Duplicate keys are collapsed to their first position. If the copies hold different values
 *    the file is left alone and the script fails: which one is right is a human call.
 *  - en.json keeps its own order, or with --base <ref> the order of that ref's en.json. Use the
 *    latter on a contributor branch that forked from an older main: keys main already has go back
 *    to main's position, so the PR stops touching them at all.
 *  - Every other locale follows en.json order (as `i18n:apply` writes it). Keys en.json lacks keep
 *    their place after their neighbour; `i18n:check` lists them as stale.
 *  - _missing_translations_*.json staging files drop entries the locale has since translated, but
 *    only while the entry is still the untouched English text (plurals in the shorthand
 *    `i18n:missing` writes). An edited entry is someone's work, so it's reported and kept. So is an
 *    entry for a key en.json no longer has: nothing here records what its English used to be, so
 *    "untouched" can't be proven. An emptied file is deleted.
 *
 * Usage:
 *   node scripts/tidy-translations.js                    # tidy in place
 *   node scripts/tidy-translations.js --base origin/main # order en.json like that ref's
 *   node scripts/tidy-translations.js --check            # change nothing; exit 1 if untidy
 *   node scripts/tidy-translations.js --check --duplicates-only
 *                                                        # only fail on duplicate keys (CI)
 */

import { execFileSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
	MESSAGES_DIR,
	BASE_LOCALE,
	MISSING_PREFIX,
	formatJson,
	writeJson,
	messageKeys,
	listLocales,
	listMissingFiles
} from './i18n-shared.js';
import { toShorthand } from './i18n-plural.js';

const args = process.argv.slice(2);
const check = args.includes('--check');
const duplicatesOnly = args.includes('--duplicates-only');
const baseIndex = args.indexOf('--base');
const baseRef = baseIndex === -1 ? null : args[baseIndex + 1];

if (baseIndex !== -1 && (!baseRef || baseRef.startsWith('--'))) {
	console.error('--base needs a git ref, e.g. --base origin/main');
	process.exit(2);
}

const inActions = process.env.GITHUB_ACTIONS === 'true';
/** A GitHub annotation in CI, so the finding shows on the PR's file view; plain text elsewhere. */
const annotate = (level, fileName, line, text) => {
	if (inActions) {
		const at = line ? `,line=${line}` : '';
		console.log(`::${level} file=messages/${fileName}${at}::${text}`);
	} else {
		console.log(`  ${fileName}${line ? `:${line}` : ''}: ${text}`);
	}
};

/**
 * Top-level entries of a JSON object in source order, duplicates included — the one thing
 * JSON.parse can't show. Each entry is { key, line, value }. Assumes valid JSON (it's re-parsed
 * per value, so malformed input still throws).
 */
const scanEntries = (text) => {
	const entries = [];
	let depth = 0;
	let line = 1;
	let state = 'key'; // at depth 1: 'key' → 'colon' → 'value' → (',' →) 'key'
	let current = null;
	let valueStart = -1;

	const close = (end) => {
		current.value = JSON.parse(text.slice(valueStart, end));
		entries.push(current);
		current = null;
		state = 'key';
	};

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '\n') line++;
		else if (c === '"') {
			const start = i;
			for (i++; text[i] !== '"'; i++) if (text[i] === '\\') i++;
			if (depth === 1 && state === 'key') {
				current = { key: JSON.parse(text.slice(start, i + 1)), line };
				state = 'colon';
			}
		} else if (depth === 1 && c === ':' && state === 'colon') {
			state = 'value';
			valueStart = i + 1;
		} else if (depth === 1 && c === ',' && state === 'value') close(i);
		else if (c === '{' || c === '[') depth++;
		else if (c === '}' || c === ']') {
			if (depth === 1 && state === 'value') close(i);
			depth--;
		}
	}
	return entries;
};

/**
 * Every key of `reference` and `keys`, in `reference` order. Keys only `keys` has stay right after
 * the key that preceded them there, so a block of new keys keeps its place and its internal order.
 */
const unionOrder = (keys, reference) => {
	const known = new Set(reference);
	const out = [...reference];
	keys.forEach((key, i) => {
		if (known.has(key)) return;
		out.splice(i === 0 ? 0 : out.indexOf(keys[i - 1]) + 1, 0, key);
	});
	return out;
};

/** `keys` reordered to follow `reference`, as {@link unionOrder} places them. */
const orderLike = (keys, reference) => {
	const present = new Set(keys);
	return unionOrder(keys, reference).filter((k) => present.has(k));
};

const has = (obj, key) => Object.hasOwn(obj, key);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Reads a file and collapses its duplicates. Returns { text, obj, duplicates, conflicts }, where
 * `obj` keeps each key's first position. A conflict is a duplicate whose copies differ.
 */
const load = (fileName) => {
	const text = readFileSync(join(MESSAGES_DIR, fileName), 'utf-8');
	// Null prototype: a key named `__proto__` or `constructor` is just a key here.
	const obj = Object.create(null);
	const firstLine = Object.create(null);
	const duplicates = [];
	const conflicts = [];
	for (const { key, line, value } of scanEntries(text)) {
		if (!has(obj, key)) {
			obj[key] = value;
			firstLine[key] = line;
			continue;
		}
		duplicates.push({ key, line, firstLine: firstLine[key] });
		if (!same(obj[key], value)) conflicts.push({ key, line, firstLine: firstLine[key] });
	}
	return { text, obj, duplicates, conflicts };
};

/** `obj` rebuilt with its metadata keys first, then the message keys in `order`. */
const rebuild = (obj, order) => {
	const messages = new Set(messageKeys(obj));
	const next = Object.create(null);
	for (const key of Object.keys(obj)) if (!messages.has(key)) next[key] = obj[key];
	for (const key of order) next[key] = obj[key];
	return next;
};

const fileNames = [
	`${BASE_LOCALE}.json`,
	...listLocales()
		.filter((l) => l !== BASE_LOCALE)
		.map((l) => `${l}.json`),
	...listMissingFiles()
];

let failed = false;
let untidy = 0;

// --- Duplicates first: they block every other step for the file they're in. ------------------

const loaded = new Map();
for (const fileName of fileNames) {
	const file = load(fileName);
	loaded.set(fileName, file);
	for (const { key, line, firstLine } of file.duplicates) {
		const conflict = file.conflicts.some((c) => c.key === key && c.line === line);
		annotate(
			conflict || duplicatesOnly ? 'error' : 'warning',
			fileName,
			line,
			conflict
				? `'${key}' is also on line ${firstLine} with a different value — keep one by hand.`
				: `'${key}' duplicates line ${firstLine}. Run 'npm run i18n:tidy' to collapse it.`
		);
	}
	if (file.conflicts.length > 0 || (duplicatesOnly && file.duplicates.length > 0)) failed = true;
}

if (duplicatesOnly) {
	if (!failed) console.log('No duplicate keys in messages/.');
	process.exit(failed ? 1 : 0);
}

// --- Canonical order. ------------------------------------------------------------------------

const base = loaded.get(`${BASE_LOCALE}.json`);
const branchEnKeys = messageKeys(base.obj);
// en.json holds only its own keys; the locales follow `canonical`, which with --base also places
// keys only the ref's en.json has, so a translation of one lands where main will put it.
let enOrder = branchEnKeys;
let canonical = branchEnKeys;
const enValues = Object.assign(Object.create(null), base.obj);
if (baseRef) {
	let refText;
	try {
		refText = execFileSync('git', ['show', `${baseRef}:messages/${BASE_LOCALE}.json`], {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch {
		console.error(`Can't read messages/${BASE_LOCALE}.json at '${baseRef}' — fetch it first?`);
		process.exit(2);
	}
	const ref = JSON.parse(refText);
	enOrder = orderLike(branchEnKeys, messageKeys(ref));
	canonical = unionOrder(branchEnKeys, messageKeys(ref));
	for (const key of messageKeys(ref)) if (!has(enValues, key)) enValues[key] = ref[key];
}
const enKeySet = new Set(canonical);
/** A staging value nobody has touched: the English text, as `i18n:missing` wrote it. */
const untouched = (key, value) =>
	same(value, toShorthand(enValues[key]) ?? enValues[key]) || same(value, enValues[key]);

/** What the tidy writes for one file, or `null` to delete it. */
const tidy = (fileName, obj) => {
	if (fileName === `${BASE_LOCALE}.json`) return rebuild(obj, enOrder);

	if (!fileName.startsWith(MISSING_PREFIX)) {
		return rebuild(obj, orderLike(messageKeys(obj), canonical));
	}

	const locale = fileName.slice(MISSING_PREFIX.length, -'.json'.length);
	const target = loaded.get(`${locale}.json`)?.obj ?? Object.create(null);
	const keep = messageKeys(obj).filter((key) => {
		const done = has(target, key);
		if (!done && enKeySet.has(key)) return true;
		if (!enKeySet.has(key)) {
			annotate(
				'warning',
				fileName,
				null,
				`'${key}' is not in ${BASE_LOCALE}.json, and its old English is unknown — kept.`
			);
			return true;
		}
		if (untouched(key, obj[key])) return false;
		annotate(
			'warning',
			fileName,
			null,
			`'${key}' is already in ${locale}.json, but this entry was edited — kept ('i18n:apply' would overwrite it).`
		);
		return true;
	});
	if (keep.length === 0) return null;
	return rebuild(obj, orderLike(keep, canonical));
};

for (const fileName of fileNames) {
	const { text, obj, conflicts, duplicates } = loaded.get(fileName);
	if (conflicts.length > 0) continue; // already reported; left for a human

	const next = tidy(fileName, obj);
	const nextText = next === null ? null : await formatJson(fileName, next);
	if (nextText === text) continue;

	untidy++;
	const dropped = next === null ? 0 : messageKeys(obj).length - messageKeys(next).length;
	const order = fileName === `${BASE_LOCALE}.json` ? (baseRef ?? 'its own') : BASE_LOCALE;
	const reason =
		next === null
			? 'every entry is translated now, so the staging file can go'
			: duplicates.length > 0
				? `${duplicates.length} duplicate key(s) to collapse`
				: dropped > 0
					? `${dropped} entry(s) already translated or gone from ${BASE_LOCALE}.json`
					: `keys out of ${order} order`;

	if (check) {
		annotate('warning', fileName, null, `${reason}. Run 'npm run i18n:tidy'.`);
		continue;
	}
	if (next === null) unlinkSync(join(MESSAGES_DIR, fileName));
	else await writeJson(fileName, next);
	console.log(`${fileName}: ${next === null ? 'deleted' : 'tidied'} (${reason})`);
}

if (untidy === 0 && !failed) console.log('messages/ is tidy.');
else if (check && untidy > 0) {
	console.log(`\n${untidy} file(s) need 'npm run i18n:tidy'.`);
	if (!baseRef) {
		console.log(
			`On a contributor branch behind main, use 'npm run i18n:tidy -- --base origin/main'.`
		);
	}
}

process.exit(failed || (check && untidy > 0) ? 1 : 0);

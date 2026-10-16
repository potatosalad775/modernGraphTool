/**
 * Plural shorthand for the `_missing_translations_<locale>.json` staging files.
 *
 * Paraglide's variant format (declarations / selectors / match) is a lot to ask of a translator,
 * and a message with two counters needs every combination spelled out. The staging files accept
 * two simpler forms instead, which `i18n:apply` expands with toVariant():
 *
 * 1. A whole-sentence object, for one counter:
 *
 *      "key": { "one": "{count} row skipped", "few": "{count} rows skipped", "other": "..." }
 *
 *    `"plural": "total"` picks another input; it defaults to `count`.
 *
 * 2. Inline fragments inside a string (ICU MessageFormat syntax), for when one word changes or
 *    there is more than one counter. `#` stands for the number:
 *
 *      "Showing {count} of {total, plural, one {# match} other {# matches}}"
 *
 * Keys are Intl.PluralRules categories (`zero one two few many other`; `other` is required and
 * becomes the catchall) or exact numbers (`=0`). The full Paraglide array form still works and is
 * passed through unchanged — it is the escape hatch for ordinals, gender and the like.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_INPUT_KEY = 'plural';
const DEFAULT_PLURAL_INPUT = 'count';
const EXACT_KEY = /^=(\d+(?:\.\d+)?)$/;
const IDENTIFIER = /^[A-Za-z_]\w*$/;
const PLACEHOLDER = /\{\s*([A-Za-z_]\w*)\s*\}/g;
const FRAGMENT_START = /\{\s*([A-Za-z_]\w*)\s*,\s*plural\s*,/g;
const NESTED_FRAGMENT = /\{\s*[A-Za-z_]\w*\s*,\s*plural\s*,/;

/** Exact-number keys compile to a strict `=== "0"` before Paraglide 2.27.0 and never match. */
export const EXACT_MATCH_MIN_PARAGLIDE = '2.27.0';

/** Categories Intl.PluralRules can return for `locale` — e.g. uk → one, few, many, other. */
export const pluralCategories = (locale) =>
	new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

const isShorthandObject = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** Paraglide's own variant format: `[{ declarations, selectors, match }]`. */
export const isVariant = (value) =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every((v) => v !== null && typeof v === 'object' && v.match);

const installedParaglideVersion = () => {
	try {
		const pkg = join(import.meta.dirname, '..', 'node_modules', '@inlang', 'paraglide-js');
		return JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf-8')).version;
	} catch {
		return undefined;
	}
};

const versionAtLeast = (version, min) => {
	if (!version) return false;
	const a = version.split('.').map(Number);
	const b = min.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return true;
};

export const exactMatchSupported = () =>
	versionAtLeast(installedParaglideVersion(), EXACT_MATCH_MIN_PARAGLIDE);

/**
 * Splits a string into literal text and `{name, plural, ...}` fragments. Each fragment is
 * `{ input, options: { key: text } }`, with `#` already replaced by `{input}`.
 */
const parseInline = (text, errors) => {
	const segments = [];
	let pos = 0;
	FRAGMENT_START.lastIndex = 0;
	let m;
	while ((m = FRAGMENT_START.exec(text))) {
		segments.push(text.slice(pos, m.index));
		const input = m[1];
		const options = {};
		let i = FRAGMENT_START.lastIndex;
		for (;;) {
			while (/\s/.test(text[i] ?? '')) i++;
			if (text[i] === '}') break;
			if (i >= text.length) {
				errors.push(`plural for "${input}" is missing a closing "}"`);
				return undefined;
			}
			const key = /^(=?[\w.]+)\s*\{/.exec(text.slice(i));
			if (!key) {
				errors.push(`unreadable plural for "${input}" near "${text.slice(i, i + 20)}"`);
				return undefined;
			}
			i += key[0].length;
			let depth = 1;
			const start = i;
			for (; i < text.length && depth > 0; i++) {
				if (text[i] === '{') depth++;
				else if (text[i] === '}') depth--;
			}
			if (depth > 0) {
				errors.push(`plural for "${input}" is missing a closing "}"`);
				return undefined;
			}
			const body = text.slice(start, i - 1);
			if (NESTED_FRAGMENT.test(body)) {
				errors.push(`plural fragments can't be nested`);
				return undefined;
			}
			options[key[1]] = body.replaceAll('#', `{${input}}`);
		}
		segments.push({ input, options });
		pos = i + 1;
		FRAGMENT_START.lastIndex = pos;
	}
	segments.push(text.slice(pos));
	return segments;
};

/** Checks one fragment's keys against the locale. Unusable keys are dropped with a warning. */
const checkOptions = (input, options, locale, errors, warnings) => {
	const allowed = new Set(pluralCategories(locale));
	const kept = {};
	for (const [key, text] of Object.entries(options)) {
		if (typeof text !== 'string' || text.trim() === '') {
			errors.push(`"${key}" for "${input}" has no text`);
		} else if (EXACT_KEY.test(key)) {
			kept[key] = text;
		} else if (!PLURAL_CATEGORIES.includes(key)) {
			errors.push(`"${key}" is not a plural category (${PLURAL_CATEGORIES.join(', ')}) or =N`);
		} else if (!allowed.has(key)) {
			warnings.push(`"${key}" is never used in ${locale} — dropped`);
		} else {
			kept[key] = text;
		}
	}
	if (kept.other === undefined) errors.push(`plural for "${input}" needs an "other" form`);
	const missing = [...allowed].filter((c) => kept[c] === undefined);
	if (missing.length > 0 && kept.other !== undefined) {
		warnings.push(`no "${missing.join('", "')}" for "${input}" — those numbers use "other"`);
	}
	return kept;
};

/**
 * Expands a staging-file value into what goes into `messages/<locale>.json`: a plain string, or
 * Paraglide's variant format. Returns `{ value, errors, warnings }`; any error means the key
 * should be skipped. Strings without plural fragments and full variant arrays pass through.
 */
export const toVariant = (raw, locale) => {
	const errors = [];
	const warnings = [];
	if (isVariant(raw)) return { value: raw, errors, warnings };

	let segments;
	if (isShorthandObject(raw)) {
		const input = raw[PLURAL_INPUT_KEY] ?? DEFAULT_PLURAL_INPUT;
		if (typeof input !== 'string' || !IDENTIFIER.test(input)) {
			errors.push(`"${PLURAL_INPUT_KEY}" must name an input such as "count"`);
			return { value: undefined, errors, warnings };
		}
		const options = Object.fromEntries(
			Object.entries(raw)
				.filter(([k]) => k !== PLURAL_INPUT_KEY)
				.map(([k, v]) => [k, typeof v === 'string' ? v.replaceAll('#', `{${input}}`) : v])
		);
		segments = [{ input, options }];
	} else if (typeof raw === 'string') {
		if (raw.trim() === '') {
			errors.push('no translation');
			return { value: undefined, errors, warnings };
		}
		segments = parseInline(raw, errors);
	} else {
		errors.push('not a string, plural object or Paraglide variant array');
	}
	if (!segments || errors.length > 0) return { value: undefined, errors, warnings };

	const fragments = segments.filter((s) => typeof s !== 'string');
	if (fragments.length === 0) return { value: raw, errors, warnings };
	for (const f of fragments) f.options = checkOptions(f.input, f.options, locale, errors, warnings);
	if (errors.length > 0) return { value: undefined, errors, warnings };

	// One counter may appear in several fragments; its choices are the union of their keys.
	const rules = new Intl.PluralRules(locale);
	const counters = [];
	for (const f of fragments) {
		let c = counters.find((x) => x.input === f.input);
		if (!c) counters.push((c = { input: f.input, exact: new Set(), cats: new Set() }));
		for (const key of Object.keys(f.options)) (EXACT_KEY.test(key) ? c.exact : c.cats).add(key);
	}
	if (counters.some((c) => c.exact.size > 0) && !exactMatchSupported()) {
		errors.push(
			`exact numbers (=N) need Paraglide >= ${EXACT_MATCH_MIN_PARAGLIDE} (installed: ${installedParaglideVersion() ?? 'none'})`
		);
		return { value: undefined, errors, warnings };
	}

	// A fragment that lacks the chosen key falls back to the category that number would get,
	// then to "other".
	const pick = (options, choice) =>
		choice.exact
			? (options[choice.exact] ??
				options[rules.select(Number(choice.exact.slice(1)))] ??
				options.other)
			: (options[choice.cat] ?? options.other);

	const choicesOf = (c) => [
		...[...c.exact].map((exact) => ({ exact })),
		...PLURAL_CATEGORIES.filter((cat) => c.cats.has(cat)).map((cat) => ({ cat }))
	];
	const keyOf = (c, choice) => {
		const plural = `${c.input}Plural=${choice.exact || choice.cat === 'other' ? '*' : choice.cat}`;
		if (c.exact.size === 0) return plural;
		return `${c.input}Exact=${choice.exact ? choice.exact.slice(1) : '*'}, ${plural}`;
	};

	let combos = [[]];
	for (const c of counters) {
		combos = combos.flatMap((combo) => choicesOf(c).map((choice) => [...combo, choice]));
	}

	const match = {};
	const inputs = counters.map((c) => c.input);
	for (const combo of combos) {
		const text = segments
			.map((s) => {
				if (typeof s === 'string') return s;
				return pick(s.options, combo[counters.findIndex((c) => c.input === s.input)]);
			})
			.join('');
		for (const p of text.matchAll(PLACEHOLDER)) if (!inputs.includes(p[1])) inputs.push(p[1]);
		match[counters.map((c, i) => keyOf(c, combo[i])).join(', ')] = text;
	}

	if (combos.length === 1) return { value: Object.values(match)[0], errors, warnings };

	const declarations = inputs.map((name) => `input ${name}`);
	const selectors = [];
	for (const c of counters) {
		if (c.exact.size > 0) {
			declarations.push(`local ${c.input}Exact = ${c.input}`);
			selectors.push(`${c.input}Exact`);
		}
		declarations.push(`local ${c.input}Plural = ${c.input}: plural`);
		selectors.push(`${c.input}Plural`);
	}
	return { value: [{ declarations, selectors, match }], errors, warnings };
};

/**
 * Folds a single-counter variant back into the object shorthand, so an `en` plural shows up in a
 * staging file in the form translators edit. Returns undefined for anything else, which is then
 * written in the full format.
 */
export const toShorthand = (value) => {
	if (!isVariant(value) || value.length !== 1) return undefined;
	const { declarations = [], selectors = [], match } = value[0];
	const input = /^(\w+)Plural$/.exec(selectors.at(-1) ?? '')?.[1];
	if (!input) return undefined;
	const exactVar = `${input}Exact`;
	const pluralVar = `${input}Plural`;
	const hasExact = selectors.length === 2;
	if (hasExact && selectors[0] !== exactVar) return undefined;
	if (selectors.length > 2) return undefined;

	const locals = declarations.filter((d) => d.startsWith('local '));
	const expected = [
		...(hasExact ? [`local ${exactVar} = ${input}`] : []),
		`local ${pluralVar} = ${input}: plural`
	];
	if (JSON.stringify(locals) !== JSON.stringify(expected)) return undefined;

	const out = input === DEFAULT_PLURAL_INPUT ? {} : { [PLURAL_INPUT_KEY]: input };
	const cats = {};
	for (const [key, text] of Object.entries(match)) {
		const parts = Object.fromEntries(key.split(',').map((p) => p.trim().split('=')));
		const exact = hasExact ? parts[exactVar] : '*';
		const cat = parts[pluralVar];
		if (exact === undefined || cat === undefined) return undefined;
		if (exact !== '*') {
			if (cat !== '*') return undefined;
			out[`=${exact}`] = text;
		} else {
			const name = cat === '*' ? 'other' : cat;
			if (!PLURAL_CATEGORIES.includes(name)) return undefined;
			cats[name] = text;
		}
	}
	if (cats.other === undefined) return undefined;
	for (const c of PLURAL_CATEGORIES) if (cats[c] !== undefined) out[c] = cats[c];
	return out;
};

/** The inputs a message reads: `{name}` placeholders plus declared `input`s, minus locals. */
export const messageInputs = (value) => {
	const names = new Set();
	const scan = (text) => {
		for (const m of String(text).matchAll(PLACEHOLDER)) names.add(m[1]);
	};
	if (typeof value === 'string') {
		scan(value);
	} else if (isVariant(value)) {
		const locals = new Set();
		for (const v of value) {
			for (const d of v.declarations ?? []) {
				const input = /^input (\w+)/.exec(d);
				if (input) names.add(input[1]);
				const local = /^local (\w+)/.exec(d);
				if (local) locals.add(local[1]);
			}
			Object.values(v.match).forEach(scan);
		}
		for (const l of locals) names.delete(l);
	}
	return names;
};

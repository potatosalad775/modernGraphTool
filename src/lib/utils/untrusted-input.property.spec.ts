/**
 * Properties of the share-URL codec and the HTML sanitizer, checked on generated input.
 *
 * `url-state.spec.ts` and `html-sanitizer.spec.ts` pin the cases someone thought of. Both
 * modules read text that anyone can send (a link, a `phone_book.json`), so these assert what
 * must hold for every input: a decoder never throws, an encoder's output decodes to its input,
 * and sanitizing twice changes nothing.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import Base62 from './base62.js';
import { sanitizeHtml, stripHtml } from './html-sanitizer.js';
import {
	buildQueryString,
	parseShareParam,
	parseStateParam,
	sanitizeState,
	type URLState
} from './url-state.js';

const DEFAULT_Y_SCALE = 50;

/**
 * One word of a device name. No comma or bracket (the list syntax), and no control characters:
 * no device name has one, and Base62 drops a leading NUL byte.
 */
const word = fc
	.string({ unit: 'grapheme', minLength: 1, maxLength: 8 })
	// eslint-disable-next-line no-control-regex
	.filter((s) => !/[,()[\]{}\s\u0000-\u001f\u007f]/u.test(s));

/** `Brand Model`, optionally with a `(V2, black)` variant whose comma must not split it. */
const deviceName = fc
	.tuple(
		fc.array(word, { minLength: 1, maxLength: 3 }),
		fc.option(fc.array(word, { minLength: 1, maxLength: 2 }), { nil: undefined })
	)
	.map(([words, variant]) =>
		variant ? `${words.join(' ')} (${variant.join(', ')})` : words.join(' ')
	);

const nameList = fc.array(deviceName, { minLength: 1, maxLength: 5 });

function shareRoundTrip(names: string[], useBase62: boolean): string[] {
	const query = buildQueryString(names, {}, DEFAULT_Y_SCALE, useBase62);
	return parseShareParam(new URLSearchParams(query).get('share'));
}

/** A finite number that survives JSON: `-0` comes back as `0`. */
const jsonNumber = fc
	.double({ noNaN: true, noDefaultInfinity: true })
	.map((n) => (n === 0 ? 0 : n));

const stateKey = fc.string({ minLength: 1, maxLength: 12 }).filter((k) => k !== '__proto__');

/** The parts of a state the encoder writes that carry no EQ or sample set. */
const plainState: fc.Arbitrary<URLState> = fc.record(
	{
		yScale: jsonNumber,
		baseline: fc.record({
			key: fc.string(),
			mode: fc.constantFrom('off', 'withoutAdjustment', 'withAdjustment')
		}),
		yOffsets: fc.dictionary(stateKey, jsonNumber, { minKeys: 1, maxKeys: 4 })
	},
	{ requiredKeys: [] }
);

describe('Base62', () => {
	it('decodes what it encodes', () => {
		fc.assert(
			fc.property(fc.array(word, { maxLength: 6 }), (words) => {
				const text = words.join(' ');
				expect(Base62.decode(Base62.encode(text))).toBe(text);
			})
		);
	});
});

describe('share names', () => {
	it('round-trip through a Base62 query', () => {
		fc.assert(
			fc.property(nameList, (names) => {
				expect(shareRoundTrip(names, true)).toEqual(names);
			})
		);
	});

	// The plain form reads `_` as a space, which is how CrinGraph-style links write one.
	it('round-trip through a plain query, apart from an underscore', () => {
		fc.assert(
			fc.property(nameList, (names) => {
				fc.pre(names.every((name) => !name.includes('_')));
				expect(shareRoundTrip(names, false)).toEqual(names);
			})
		);
	});

	it('are read from any string without throwing, as trimmed non-empty names', () => {
		fc.assert(
			fc.property(fc.string({ unit: 'binary' }), (value) => {
				for (const name of parseShareParam(value)) {
					expect(name).toBe(name.trim());
					expect(name).not.toBe('');
				}
			})
		);
	});
});

describe('state', () => {
	it('round-trips what the encoder writes', () => {
		fc.assert(
			fc.property(plainState, (state) => {
				const encoded = Base62.encode(JSON.stringify(state));
				expect(parseStateParam(encoded)).toEqual(state);
			})
		);
	});

	it('is read from any string without throwing', () => {
		fc.assert(
			fc.property(fc.string({ unit: 'binary' }), (value) => {
				const state = parseStateParam(value);
				expect(state === null || typeof state === 'object').toBe(true);
			})
		);
	});

	it('is read from any JSON document without throwing or touching a prototype', () => {
		fc.assert(
			fc.property(fc.jsonValue(), (document) => {
				const state = parseStateParam(Base62.encode(JSON.stringify(document)));
				if (state === null) return;
				expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
				for (const part of [state.yOffsets, state.sampleDisplay]) {
					if (part) expect(Object.getPrototypeOf(part)).toBe(Object.prototype);
				}
			})
		);
	});

	it('keeps only finite numbers, strings and at most 32 bands from a hand-edited state', () => {
		const anything = fc.jsonValue();
		const handEdited = fc.record(
			{
				yScale: anything,
				baseline: fc.record({ key: anything, mode: anything }, { requiredKeys: [] }),
				yOffsets: fc.dictionary(fc.string(), anything),
				eq: fc.record(
					{ filters: fc.array(anything, { maxLength: 40 }), preamp: anything },
					{ requiredKeys: [] }
				)
			},
			{ requiredKeys: [] }
		);
		fc.assert(
			fc.property(handEdited, (raw) => {
				const state = sanitizeState(raw as Record<string, unknown>);
				if (state.yScale !== undefined) expect(Number.isFinite(state.yScale)).toBe(true);
				if (state.baseline) {
					expect(typeof state.baseline.key).toBe('string');
					expect(typeof state.baseline.mode).toBe('string');
				}
				for (const offset of Object.values(state.yOffsets ?? {})) {
					expect(Number.isFinite(offset)).toBe(true);
				}
				if (state.eq) {
					expect(Number.isFinite(state.eq.preamp)).toBe(true);
					expect(state.eq.filters.length).toBeLessThanOrEqual(32);
				}
			})
		);
	});

	it('is unchanged by a second sanitizeState', () => {
		fc.assert(
			fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (raw) => {
				const once = sanitizeState(raw);
				expect(sanitizeState(once as Record<string, unknown>)).toEqual(once);
			})
		);
	});
});

/** Markup-shaped noise: tags, attributes and entities in any order, closed or not. */
const htmlish = fc
	.array(
		fc.oneof(
			fc.string({ maxLength: 6 }),
			fc.constantFrom(
				'<b>',
				'</b>',
				'<a href="https://example.com">',
				'<a href="javascript:alert(1)">',
				'<a href="&#106;avascript:alert(1)">',
				'</a>',
				'<script>',
				'</script>',
				'<img src=x onerror=alert(1)>',
				'<span title="t" onclick="x()">',
				'</span>',
				'<div>',
				'<br>',
				'<svg onload=x>',
				'<!--',
				'-->',
				'&lt;',
				'&amp;',
				'&#60;script&#62;',
				'<',
				'>',
				'"',
				"'"
			)
		),
		{ maxLength: 12 }
	)
	.map((parts) => parts.join(''));

describe('sanitizeHtml', () => {
	it('keeps no script, event handler or javascript: URL, whatever it is given', () => {
		fc.assert(
			fc.property(fc.oneof(htmlish, fc.string({ unit: 'binary' })), (input) => {
				const output = sanitizeHtml(input);
				expect(output).not.toMatch(/<\s*(script|svg|img|div|iframe)\b/i);
				expect(output).not.toMatch(/<[^>]*\son\w+\s*=/i);
				expect(output).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
			})
		);
	});

	it('drops the content of a script, style, iframe or svg along with the tag', () => {
		const opaque = fc.constantFrom('script', 'style', 'iframe', 'svg');
		fc.assert(
			fc.property(htmlish, opaque, htmlish, (before, tag, after) => {
				// `before` must leave the marker's tag intact: no comment or opaque tag opened
				// around it, and no unfinished `<` that would swallow it as an attribute.
				fc.pre(!/<!--|<(script|svg)|<[^>]*$/i.test(before));
				const output = sanitizeHtml(`${before}<${tag}>SECRETBODY</${tag}>${after}`);
				expect(output).not.toContain('SECRETBODY');
			})
		);
	});

	it('is unchanged by a second pass', () => {
		fc.assert(
			fc.property(htmlish, (input) => {
				const once = sanitizeHtml(input);
				expect(sanitizeHtml(once)).toBe(once);
			})
		);
	});

	// The result is text for a `title` attribute, so a decoded `&#60;script&#62;` may stay in it.
	it('strips any input to text without throwing', () => {
		fc.assert(
			fc.property(fc.oneof(htmlish, fc.string({ unit: 'binary' })), (input) => {
				expect(typeof stripHtml(input)).toBe('string');
			})
		);
	});
});

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
import { EQ_FILTER_TYPES } from './equalizer.js';
import { sanitizeHtml, stripHtml } from './html-sanitizer.js';
import {
	BASE62_PREFIX,
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

/** Any text, half of the time behind the prefix that sends it down the Base62 branch. */
const junk = fc.string({ unit: 'binary' });
const shareValue = fc.oneof(
	junk,
	junk.map((value) => BASE62_PREFIX + value)
);

const anything = fc.jsonValue();

const bandNumber = fc.option(jsonNumber, { nil: null });

/** A band `parseFilter` accepts as it is. */
const validBand = fc.record(
	{
		enabled: fc.boolean(),
		type: fc.constantFrom(...EQ_FILTER_TYPES),
		freq: bandNumber,
		q: bandNumber,
		gain: bandNumber,
		channel: fc.constantFrom('L' as const, 'R' as const)
	},
	{ requiredKeys: ['enabled', 'type', 'freq', 'q', 'gain'] }
);

/** A band with one field wrong, or something that is no band at all. */
const brokenBand = fc.oneof(
	validBand.map((band) => ({ ...band, type: 'XX' })),
	validBand.map((band) => ({ ...band, gain: '3' })),
	validBand.map(({ enabled, ...rest }) => ({ ...rest, enabled: String(enabled) })),
	fc.oneof(fc.string(), jsonNumber, fc.constant(null), fc.array(anything, { maxLength: 2 }))
);

/**
 * A record keyed by device name, `__proto__` among the keys. `Object.fromEntries` makes it an
 * own property, as `JSON.parse` does; a plain assignment would swap the prototype instead.
 */
const namedRecord = fc
	.array(fc.tuple(fc.oneof(fc.string(), fc.constant('__proto__')), anything), { maxLength: 4 })
	.map((entries): Record<string, unknown> => Object.fromEntries(entries));

/** A state someone edited by hand: the keys the decoder knows, holding anything. */
const handEdited = fc.record(
	{
		yScale: anything,
		baseline: fc.record({ key: anything, mode: anything }, { requiredKeys: [] }),
		yOffsets: namedRecord,
		eq: fc.record(
			{ filters: fc.array(fc.oneof(validBand, anything), { maxLength: 40 }), preamp: anything },
			{ requiredKeys: [] }
		),
		sampleDisplay: namedRecord,
		hptfDisplay: namedRecord
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
			fc.property(shareValue, (value) => {
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
			fc.property(
				fc.oneof(plainState, fc.constant<URLState>({ yScale: DEFAULT_Y_SCALE })),
				(state) => {
					const query = buildQueryString([], state, DEFAULT_Y_SCALE, true);
					const encoded = new URLSearchParams(query).get('state');
					// A state that says nothing beyond the default scale is left out of the URL.
					const empty =
						!state.baseline &&
						!state.yOffsets &&
						(state.yScale ?? DEFAULT_Y_SCALE) === DEFAULT_Y_SCALE;
					if (empty) expect(encoded).toBeNull();
					else expect(parseStateParam(encoded)).toEqual(state);
				}
			)
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
			fc.property(fc.oneof(anything, handEdited), (document) => {
				const state = parseStateParam(Base62.encode(JSON.stringify(document)));
				const isObject =
					typeof document === 'object' && document !== null && !Array.isArray(document);
				expect(state !== null).toBe(isObject);
				if (state === null) return;
				expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
				for (const part of Object.values(state)) {
					if (typeof part !== 'object') continue;
					expect(Object.getPrototypeOf(part)).toBe(Object.prototype);
					expect(Object.hasOwn(part, '__proto__')).toBe(false);
				}
			})
		);
	});

	it('keeps only finite numbers, strings and at most 32 bands from a hand-edited state', () => {
		fc.assert(
			fc.property(handEdited, (raw) => {
				const state = sanitizeState(raw);
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

	it('keeps the first 32 valid bands, in order', () => {
		const band = fc.oneof(
			{ weight: 5, arbitrary: validBand.map((value) => ({ value, valid: true })) },
			{ weight: 1, arbitrary: brokenBand.map((value) => ({ value, valid: false })) }
		);
		fc.assert(
			fc.property(fc.array(band, { maxLength: 64, size: 'max' }), (bands) => {
				const state = sanitizeState({ eq: { filters: bands.map((b) => b.value) } });
				const valid = bands.filter((b) => b.valid).map((b) => b.value);
				expect(state.eq?.filters).toEqual(valid.slice(0, 32));
			})
		);
	});

	it('is unchanged by a second sanitizeState', () => {
		fc.assert(
			fc.property(handEdited, (raw) => {
				const once = sanitizeState(raw);
				expect(sanitizeState(once as Record<string, unknown>)).toEqual(once);
			})
		);
	});
});

/** A link whose query holds entities, escaped once or more, and names that look like one. */
const entityHref = fc
	.array(fc.constantFrom('&amp;', 'amp;', '&lt=', '&tab=', '&#38;', '&', 'a=1', 'b'), {
		maxLength: 5
	})
	.map((parts) => `<a href="https://x.test/?${parts.join('')}">`);

/** Markup-shaped noise: tags, attributes and entities in any order, closed or not. */
const htmlish = fc
	.array(
		fc.oneof(
			fc.string({ maxLength: 6 }),
			entityHref,
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

/** Whole tokens only, so that whatever is put between two of these lands outside any tag. */
const wellFormed = fc
	.array(
		fc.oneof(
			fc.string({ maxLength: 6 }).filter((text) => !/[<&]/.test(text)),
			fc.constantFrom(
				'<b>',
				'</b>',
				'<a href="https://example.com">',
				'</a>',
				'<span title="t" onclick="x()">',
				'</span>',
				'<div>',
				'<br>',
				'<img src=x onerror=alert(1)>',
				'&lt;',
				'&amp;',
				'>',
				'"',
				"'"
			)
		),
		{ maxLength: 8 }
	)
	.map((parts) => parts.join(''));

interface OutputTag {
	name: string;
	attrs: Map<string, string>;
}

const OUTPUT_TAG = /<\/?([a-z0-9]+)((?: [a-z]+="[^"<>]*")*)>/g;

/**
 * The tags of sanitized output, read as markup and not as text: `<span title=" onx=1">` has a
 * `title` and no handler. Fails when a `<` or `>` is left that belongs to no such tag.
 */
function outputTags(output: string): OutputTag[] {
	expect(output.replace(OUTPUT_TAG, '')).not.toMatch(/[<>]/);
	return [...output.matchAll(OUTPUT_TAG)].map(([, name, attrs]) => ({
		name,
		attrs: new Map(
			[...attrs.matchAll(/ ([a-z]+)="([^"]*)"/g)].map(([, attr, value]) => [attr, value])
		)
	}));
}

/** An attribute value as the browser reads it back; `escapeAttr` wrote these five. */
function unescapeAttr(value: string): string {
	return value
		.replace(/&(quot|#39|lt|gt);/g, (_, name: string) =>
			name === 'quot' ? '"' : name === '#39' ? "'" : name === 'lt' ? '<' : '>'
		)
		.replace(/&amp;/g, '&');
}

describe('sanitizeHtml', () => {
	it('keeps no script, event handler or javascript: URL, whatever it is given', () => {
		fc.assert(
			fc.property(fc.oneof(htmlish, fc.string({ unit: 'binary' })), (input) => {
				const output = sanitizeHtml(input);
				for (const { name, attrs } of outputTags(output)) {
					expect(name).not.toMatch(/^(script|svg|img|div|iframe)$/);
					for (const attr of attrs.keys())
						expect(['href', 'title', 'target', 'rel']).toContain(attr);
					// eslint-disable-next-line no-control-regex
					const href = unescapeAttr(attrs.get('href') ?? '').replace(/[\u0000-\u0020]/g, '');
					const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1].toLowerCase();
					if (scheme) expect(['http', 'https', 'mailto', 'tel']).toContain(scheme);
				}
			})
		);
	});

	it('drops the content of a script, style, iframe or svg along with the tag', () => {
		const opaque = fc.constantFrom('script', 'style', 'iframe', 'svg');
		fc.assert(
			fc.property(wellFormed, opaque, wellFormed, (before, tag, after) => {
				// Compared with the same text without the element, so a `SECRETBODY` that the
				// surrounding text spells by chance is not taken for the one inside it.
				const output = sanitizeHtml(`${before}<${tag}>SECRETBODY</${tag}>${after}`);
				expect(output).toBe(sanitizeHtml(before + after));
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

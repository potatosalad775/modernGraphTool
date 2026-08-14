import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	parseV1Config,
	parseCrinGraphConfig,
	convertV1ToV2,
	convertCrinGraphToV2,
	parseV2Config,
	configToFormState,
	formStateToConfigString
} from './configConverter';
import { createDefaultConfig, type ConfigFormState } from './configDefaults';

/**
 * These converters emit `config.js` files that operators paste into live
 * deployments, so the property under test is round-trip fidelity: whatever the
 * editor holds must survive emit → re-parse → re-import unchanged. A field that
 * silently drops here ships a wrong config with no error anywhere.
 */

/** state → config.js → state, the full path the editor's export/import takes */
function roundTrip(state: ConfigFormState): ConfigFormState {
	return configToFormState(parseV2Config(formStateToConfigString(state)));
}

describe('v2 round trip', () => {
	it('preserves the default config exactly', () => {
		const original = createDefaultConfig();
		expect(roundTrip(original)).toEqual(original);
	});

	it('emits a file that assigns window.GRAPHTOOL_CONFIG', () => {
		const source = formStateToConfigString(createDefaultConfig());
		expect(source).toContain('window.GRAPHTOOL_CONFIG = CONFIG;');
		// parseV2Config evals the source — a syntax error surfaces here
		expect(() => parseV2Config(source)).not.toThrow();
	});

	it('preserves every optional section when enabled', () => {
		const original: ConfigFormState = {
			...createDefaultConfig(),
			CDN_MODE_ENABLED: true,
			PREFERENCE_BOUND_ENABLED: true,
			TARGET_CUSTOMIZER_ENABLED: true,
			DOWNLOAD_ENABLED: true,
			EQUALIZER_ENABLED: true,
			SQUIGLINK_ENABLED: true
		};
		expect(roundTrip(original)).toEqual(original);
	});

	it('drops optional sections when disabled and restores them as disabled', () => {
		const original = createDefaultConfig();
		const source = formStateToConfigString(original);

		expect(source).not.toContain('PREFERENCE_BOUND:');
		expect(source).not.toContain('TARGET_CUSTOMIZER:');
		expect(source).not.toContain('SQUIGLINK:');

		const back = roundTrip(original);
		expect(back.PREFERENCE_BOUND_ENABLED).toBe(false);
		expect(back.TARGET_CUSTOMIZER_ENABLED).toBe(false);
		expect(back.SQUIGLINK_ENABLED).toBe(false);
	});

	it('round-trips CDN_MODE with only MAJOR_VERSION set', () => {
		// formStateToConfigString omits empty BASE/BASE_PATH/VERSIONS_URL, so this
		// is the asymmetric case: emitted narrow, re-imported wide.
		const original: ConfigFormState = {
			...createDefaultConfig(),
			CDN_MODE_ENABLED: true
		};
		const back = roundTrip(original);
		expect(back.CDN_MODE_ENABLED).toBe(true);
		expect(back.CDN_MODE.MAJOR_VERSION).toBe(original.CDN_MODE.MAJOR_VERSION);
	});
});

describe('i18n-wrapped fields', () => {
	it('preserves the plain-array form', () => {
		const original = createDefaultConfig();
		const back = roundTrip(original);
		expect(back.TARGET_MANIFEST.useI18n).toBe(false);
		expect(back.TARGET_MANIFEST.items).toEqual(original.TARGET_MANIFEST.items);
		expect(back.TOPBAR.LINK_LIST.useI18n).toBe(false);
		expect(back.DESCRIPTION.useI18n).toBe(false);
	});

	it('preserves the { default, i18n } wrapper form', () => {
		const base = createDefaultConfig();
		const original: ConfigFormState = {
			...base,
			TARGET_MANIFEST: {
				useI18n: true,
				items: [{ type: 'Harman', files: ['Harman IE 2019v2'] }],
				i18n: { ko: [{ type: '하만', files: ['Harman IE 2019v2'] }] }
			},
			TOPBAR: {
				...base.TOPBAR,
				LINK_LIST: {
					useI18n: true,
					items: [{ TITLE: 'Github', URL: 'https://www.github.com' }],
					i18n: { ko: [{ TITLE: '깃허브', URL: 'https://www.github.com' }] }
				}
			},
			DESCRIPTION: {
				useI18n: true,
				items: [{ TYPE: 'text', CONTENT: 'hello' }],
				i18n: { ko: [{ TYPE: 'text', CONTENT: '안녕하세요' }] }
			}
		} as ConfigFormState;

		const back = roundTrip(original);
		expect(back.TARGET_MANIFEST).toEqual(original.TARGET_MANIFEST);
		expect(back.TOPBAR.LINK_LIST).toEqual(original.TOPBAR.LINK_LIST);
		expect(back.DESCRIPTION).toEqual(original.DESCRIPTION);
	});
});

describe('string escaping', () => {
	// Device and target names routinely contain +, &, quotes and non-ASCII —
	// these go through prettyPrint into a JS source file, so a missed escape is
	// a syntax error in the operator's config.js rather than a wrong value.
	const hostile = [
		"O'Reilly IEM",
		'Moondrop "Blessing" 2',
		'Sennheiser HD 6XX + Amp',
		'Fiio & Jade Audio',
		'Δ Universal',
		'한국어 타겟',
		'back\\slash',
		'line\nbreak',
		'tab\there'
	];

	it('survives quotes, backslashes, newlines and non-ASCII in array values', () => {
		const original: ConfigFormState = {
			...createDefaultConfig(),
			INITIAL_PHONES: hostile
		};
		expect(roundTrip(original).INITIAL_PHONES).toEqual(hostile);
	});

	it('survives them in nested object values', () => {
		const base = createDefaultConfig();
		const original: ConfigFormState = {
			...base,
			VISUALIZATION: {
				...base.VISUALIZATION,
				RIG_DESCRIPTION: hostile.join(' / ')
			}
		};
		expect(roundTrip(original).VISUALIZATION.RIG_DESCRIPTION).toBe(hostile.join(' / '));
	});
});

describe('array ordering', () => {
	it('preserves order of the colour palette and target manifest', () => {
		const base = createDefaultConfig();
		const original: ConfigFormState = {
			...base,
			TRACE_STYLING: {
				...base.TRACE_STYLING,
				CURVE_COLOR_PALETTE: ['#111111', '#222222', '#333333', '#444444']
			}
		};
		const back = roundTrip(original);
		expect(back.TRACE_STYLING.CURVE_COLOR_PALETTE).toEqual([
			'#111111',
			'#222222',
			'#333333',
			'#444444'
		]);
		expect(back.TARGET_MANIFEST.items.map((t) => t.type)).toEqual(
			original.TARGET_MANIFEST.items.map((t) => t.type)
		);
	});
});

describe('the shipped defaults/config.js', () => {
	// The generator must be able to import the file the project actually ships;
	// if defaults/config.js gains a key shape the parser chokes on, that is a
	// real break for every operator who starts from it.
	const shipped = readFileSync(
		fileURLToPath(new URL('../../../../defaults/config.js', import.meta.url)),
		'utf8'
	);

	it('parses', () => {
		const raw = parseV2Config(shipped);
		expect(raw).toBeTypeOf('object');
		expect(raw.PATH).toBeDefined();
	});

	it('imports into form state and re-exports without loss', () => {
		const state = configToFormState(parseV2Config(shipped));
		expect(roundTrip(state)).toEqual(state);
	});

	it('keeps LANGUAGE live, since an absent LANGUAGE hides the language picker', () => {
		const raw = parseV2Config(shipped);
		expect(raw.LANGUAGE).toBeDefined();
		expect(raw.LANGUAGE.ENABLE_I18N).toBeTypeOf('boolean');
	});
});

describe('v1 import', () => {
	const v1Source = `const CONFIG = {
		INITIAL_PHONES: ["Aria 2"],
		INITIAL_TARGETS: ["Harman IE 2019v2"],
		INITIAL_PANEL: "graph",
		NORMALIZATION: { TYPE: "Hz", HZ_VALUE: 500 },
		VISUALIZATION: { DEFAULT_Y_SCALE: 45 },
		PATH: {
			PHONE_MEASUREMENT: "./data/phones",
			TARGET_MEASUREMENT: "./data/target",
			PHONE_BOOK: "./data/phone_book.json"
		},
		WATERMARK: [{ TYPE: "TEXT", CONTENT: "© 2024 someone" }]
	};
	window.GRAPHTOOL_CONFIG = CONFIG;`;

	it('parses and converts to an importable v2 config', () => {
		const v1 = parseV1Config(v1Source);
		expect(v1.INITIAL_PHONES).toEqual(['Aria 2']);

		const { output } = convertV1ToV2(v1, null);
		const state = configToFormState(parseV2Config(output));

		expect(state.INITIAL_PHONES).toEqual(['Aria 2']);
		expect(state.INITIAL_TARGETS).toEqual(['Harman IE 2019v2']);
		expect(state.PATH.PHONE_BOOK).toBe('./data/phone_book.json');
	});

	it('warns about a Y scale v2 does not support and maps it', () => {
		const { warnings } = convertV1ToV2(parseV1Config(v1Source), null);
		expect(warnings.some((w) => w.includes('DEFAULT_Y_SCALE'))).toBe(true);
	});

	it('produces output that itself round-trips', () => {
		const { output } = convertV1ToV2(parseV1Config(v1Source), null);
		const state = configToFormState(parseV2Config(output));
		expect(roundTrip(state)).toEqual(state);
	});
});

describe('CrinGraph import', () => {
	const crinSource = `
		var init_phones = ["Aria 2"];
		var default_normalization = "dB";
		var default_norm_db = 60;
		var watermark_text = "example.squig.link";
	`;

	it('parses and converts to an importable v2 config', () => {
		const crin = parseCrinGraphConfig(crinSource);
		const { output } = convertCrinGraphToV2(crin);
		const state = configToFormState(parseV2Config(output));

		expect(state.INITIAL_PHONES).toEqual(['Aria 2']);
	});

	it('maps CrinGraph dB normalization onto Hz, since v2 has no dB mode', () => {
		const { warnings } = convertCrinGraphToV2(parseCrinGraphConfig(crinSource));
		const state = configToFormState(
			parseV2Config(convertCrinGraphToV2(parseCrinGraphConfig(crinSource)).output)
		);
		expect(state.NORMALIZATION.TYPE).toBe('Hz');
		expect(warnings.some((w) => w.includes('dB'))).toBe(true);
	});

	it('produces output that itself round-trips', () => {
		const { output } = convertCrinGraphToV2(parseCrinGraphConfig(crinSource));
		const state = configToFormState(parseV2Config(output));
		expect(roundTrip(state)).toEqual(state);
	});
});

describe('malformed input', () => {
	it('throws a useful error on a syntax error', () => {
		expect(() => parseV2Config('const CONFIG = { oops: ; };')).toThrow(/Syntax error/);
	});

	it('throws when no CONFIG object is present', () => {
		expect(() => parseV2Config('const NOT_CONFIG = 1;')).toThrow();
	});
});

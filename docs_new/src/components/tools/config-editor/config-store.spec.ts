import { describe, it, expect, beforeEach } from 'vitest';
import { configEditor } from './config-store.svelte';
import { createDefaultConfig } from '../../../utils/configDefaults';
import {
	formStateToConfigString,
	parseV2Config,
	configToFormState
} from '../../../utils/configConverter';

/**
 * The port's one architectural change is that the editor mutates a `$state`
 * config in place, where the React version rebuilt an immutable tree through a
 * reducer. Everything downstream — `formStateToConfigString` above all — was
 * written against plain objects and now receives Svelte's deep proxies instead.
 *
 * The section components stay uncovered on purpose (a mis-wired field surfaces
 * as a failing round-trip in the converter specs), but that assumption only
 * holds if the converters cannot tell a proxy from a plain object. That is what
 * this file pins.
 */

describe('the config store is transparent to the converters', () => {
	beforeEach(() => configEditor.reset());

	it('emits byte-identical output for the store and a plain default config', () => {
		expect(formStateToConfigString(configEditor.config)).toBe(
			formStateToConfigString(createDefaultConfig())
		);
	});

	it('round-trips deep in-place mutations of every shape a section performs', () => {
		const c = configEditor.config;

		c.NORMALIZATION.HZ_VALUE = 1000; // nested scalar
		c.INITIAL_PHONES.push('Moondrop Aria 2'); // array push
		c.LANGUAGE.LANGUAGE_LIST.push(['ja', '日本語']); // nested tuple array
		c.TARGET_CUSTOMIZER_ENABLED = true; // optional-section toggle
		c.TARGET_CUSTOMIZER.FILTERS[0].description = 'added'; // optional key added
		c.TARGET_CUSTOMIZER.FILTER_PRESET[0].filter.bass = 9.5; // Record<string, number>
		c.WATERMARK.splice(0, 1); // array removal

		const back = configToFormState(parseV2Config(formStateToConfigString(c)));

		expect(back.NORMALIZATION.HZ_VALUE).toBe(1000);
		expect(back.INITIAL_PHONES).toEqual(['Moondrop Aria 2']);
		expect(back.LANGUAGE.LANGUAGE_LIST).toContainEqual(['ja', '日本語']);
		expect(back.TARGET_CUSTOMIZER.FILTERS[0].description).toBe('added');
		expect(back.TARGET_CUSTOMIZER.FILTER_PRESET[0].filter.bass).toBe(9.5);
		expect(back.WATERMARK).toEqual([]);
	});

	it('deleting an optional key drops it from the emitted config', () => {
		// TargetCustomizerSection deletes rather than blanks, because the converter
		// writes back whatever key is present — `description: ''` would ship.
		const c = configEditor.config;
		c.TARGET_CUSTOMIZER_ENABLED = true;
		delete c.TARGET_CUSTOMIZER.FILTERS[4].description;

		const back = configToFormState(parseV2Config(formStateToConfigString(c)));
		expect(back.TARGET_CUSTOMIZER.FILTERS[4].description).toBeUndefined();
	});

	it('load() and reset() swap the whole tree without stale reads', () => {
		const imported = createDefaultConfig();
		imported.VISUALIZATION.RIG_DESCRIPTION = 'Measured with 5128';
		configEditor.load(imported);
		expect(configEditor.config.VISUALIZATION.RIG_DESCRIPTION).toBe('Measured with 5128');

		configEditor.reset();
		expect(configEditor.config.VISUALIZATION.RIG_DESCRIPTION).toBe(
			'Measured with IEC 60318-4 (711)'
		);
	});
});

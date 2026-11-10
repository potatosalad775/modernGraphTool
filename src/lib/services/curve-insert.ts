import type {
	Channel,
	FRDataType,
	FRDataObject,
	FRColors,
	ParsedFRData,
	FRInputMetadata
} from '#lib/types/data-types.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { AddFRDataCommand } from './commands.js';
import { pickChannels, processingParams } from './curve-data.js';
import { DataProcessor } from '#lib/utils/data-processor.js';
import { getConfigValue } from '#lib/utils/config.js';
import {
	nextCurveColor,
	parseOklch,
	formatOklch,
	resolveCurvePalette
} from '#lib/utils/curve-palette.js';

/**
 * Defaults a new curve gets when it lands in `frStore`, and the raw-insert path built on them.
 * Shared by `DataProvider` (add / insert) and `eqCurve` (a frozen EQ curve), which cannot import
 * each other: `DataProvider` calls `eqCurve.rebuild()`.
 */

export function getChannelValue(sourceType: FRDataType, available: Channel[]): Channel[] {
	const phoneCount = [...frStore.entries.values()].filter((e) => e.type === 'phone').length;
	if (sourceType !== 'phone') return ['AVG'];
	if (phoneCount < 1) return available.filter((ch) => ch !== 'AVG');
	return available.includes('AVG') ? ['AVG'] : [available[0]];
}

export function getColorForType(sourceType: FRDataType): FRColors {
	const used = [...frStore.entries.values()].flatMap((e) =>
		[e.colors.AVG, e.colors.L, e.colors.R].filter((c): c is string => Boolean(c))
	);
	const palette = getConfigValue('TRACE_STYLING.CURVE_COLOR_PALETTE') as string[] | undefined;
	const randomize = Boolean(getConfigValue('TRACE_STYLING.CURVE_COLOR_PALETTE_RANDOMIZE'));
	const base = nextCurveColor(used, resolveCurvePalette(palette, randomize), {
		isTarget: sourceType === 'target'
	});

	if (sourceType === 'target') return { AVG: base };

	const [L, C, H] = parseOklch(base);
	return {
		L: formatOklch(L, C, (H - 10 + 360) % 360),
		R: formatOklch(L, C, (H + 10) % 360),
		AVG: base
	};
}

export function getDashForType(sourceType: FRDataType, identifier: string): string {
	if (sourceType !== 'target') return '1 0';
	const list = getConfigValue('TRACE_STYLING.TARGET_TRACE_DASH') as
		Array<{ name: string; dash: string }> | undefined;
	const match = list?.find(
		(o) => (o.name.endsWith(' Target') ? o.name : o.name + ' Target') === identifier
	);
	return match?.dash ?? randomDash();
}

function randomDash(): string {
	const numPairs = 1 + Math.floor(Math.random() * 3);
	const space = 5 + Math.floor(Math.random() * 3);
	return Array.from({ length: numPairs }, (_, i) =>
		i % 2 === 0 ? `${5 + Math.floor(Math.random() * 5)} ${space}` : `2 ${space}`
	).join(' ');
}

/**
 * Process `rawData` with the graph's current params and add it to `frStore` as an undoable
 * `inserted-*` curve. It has no runs, so its raw cache is the channels alone.
 */
export function insertRawCurve(
	sourceType: FRDataType,
	identifier: string,
	rawData: ParsedFRData,
	inputMetadata: FRInputMetadata
): void {
	const processed = pickChannels(DataProcessor.processChannels(rawData, processingParams()));
	const channels = Object.keys(processed) as Channel[];

	const frObject: FRDataObject = {
		uuid: crypto.randomUUID(),
		type: `inserted-${sourceType}` as FRDataType,
		identifier,
		channels: processed,
		dispChannel: inputMetadata.dispChannel ?? getChannelValue(sourceType, channels),
		dispSuffix: inputMetadata.dispSuffix ?? '(Inserted)',
		colors: getColorForType(sourceType),
		dash: getDashForType(sourceType, identifier),
		_rawData: { channels: rawData }
	};

	commandHistory.execute(new AddFRDataCommand(frObject), frStore);
}

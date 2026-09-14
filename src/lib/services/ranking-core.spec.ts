import { describe, it, expect, vi } from 'vitest';
import { csvToRows } from '$lib/utils/csv.js';
import {
	adaptInlineSource,
	adaptSquigRankingConfig,
	buildRankIndex,
	lookupRank,
	readableTextColor,
	renderStars,
	resolveRankDisplay,
	type ResolvedRankSource
} from './ranking-core.js';

/** A squigRanking config in the shape its `letter` preset ships. */
const squigConfig = {
	configVersion: 4,
	types: {
		earphone: {
			label: 'Earphones',
			source: { kind: 'csv', url: 'https://sheets.example/earphones.csv' },
			phonebook: '../data/phone_book.json'
		},
		headphone: {
			label: 'Headphones',
			source: { kind: 'csv', url: 'https://sheets.example/headphones.csv' },
			rowFilter: { field: 'Style', values: ['Open', 'Closed'] }
		}
	},
	columns: [
		{
			id: 'rank',
			source: 'Grade',
			role: 'rank',
			label: 'Rank',
			scale: [
				{ value: 'S', score: 5, color: '#6c63ff' },
				{ value: 'A', score: 4, color: '#00bfff', label: { default: 'A', i18n: { ko: '가' } } },
				{ value: 'F', score: 0, color: '#ffc107', textColor: '#222222' }
			],
			render: { kind: 'rank-badge' }
		},
		{ id: 'brand', source: 'Brand', role: 'brand', label: 'Brand' },
		{ id: 'model', source: 'Model', role: 'model', label: 'Model' }
	]
};

function sourceOf(overrides: Partial<ResolvedRankSource> = {}): ResolvedRankSource {
	return {
		csvUrl: 'https://sheets.example/earphones.csv',
		rankColumn: 'Rank',
		brandColumn: 'Brand',
		modelColumn: 'Model',
		scale: [],
		rowFilter: null,
		deepLinkTemplate: '{Brand}-{Model}',
		slugify: 'lowercase-hyphen',
		...overrides
	};
}

describe('adaptSquigRankingConfig', () => {
	it('reads the named type, its sheet, and the rank column with its scale', () => {
		const source = adaptSquigRankingConfig(squigConfig, 'earphone');
		expect(source).toMatchObject({
			csvUrl: 'https://sheets.example/earphones.csv',
			rankColumn: 'Grade',
			brandColumn: 'Brand',
			modelColumn: 'Model',
			deepLinkTemplate: '{Brand}-{Model}',
			slugify: 'lowercase-hyphen'
		});
		expect(source?.scale.map((step) => step.value)).toEqual(['S', 'A', 'F']);
	});

	it('carries the type row filter, so a single sheet split by column stays split', () => {
		expect(adaptSquigRankingConfig(squigConfig, 'headphone')).toMatchObject({
			csvUrl: 'https://sheets.example/headphones.csv',
			rowFilter: { field: 'Style', values: ['Open', 'Closed'] }
		});
	});

	it('refuses a multi-type config when RANKING.TYPE names none of them', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(adaptSquigRankingConfig(squigConfig, 'speaker')).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it('needs no RANKING.TYPE when the config declares exactly one type', () => {
		const single = { types: { iem: { source: { url: 'https://sheets.example/one.csv' } } } };
		expect(adaptSquigRankingConfig(single, 'earphone')).toMatchObject({
			csvUrl: 'https://sheets.example/one.csv',
			// Roles absent entirely — the shipped template headers stand in.
			rankColumn: 'Rank',
			brandColumn: 'Brand',
			modelColumn: 'Model'
		});
	});

	it('honors an explicit deepLink, which is what the page anchors cards with', () => {
		const config = { ...squigConfig, deepLink: { template: '{Brand}_{Model}', slugify: 'none' } };
		expect(adaptSquigRankingConfig(config, 'earphone')).toMatchObject({
			deepLinkTemplate: '{Brand}_{Model}',
			slugify: 'none'
		});
	});

	it('tolerates a config it cannot use rather than throwing at the visitor', () => {
		expect(adaptSquigRankingConfig(null, 'earphone')).toBeNull();
		expect(adaptSquigRankingConfig({ types: {} }, 'earphone')).toBeNull();
		expect(adaptSquigRankingConfig({ types: { a: {} } }, 'a')).toBeNull();
	});

	it('reads a configVersion from the future without complaint', () => {
		const future = { ...squigConfig, configVersion: 99, somethingNew: true };
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(adaptSquigRankingConfig(future, 'earphone')).not.toBeNull();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('adaptInlineSource', () => {
	it('defaults every header to squigRanking template names', () => {
		expect(adaptInlineSource({ CSV_URL: ' https://x/y.csv ' })).toEqual(
			sourceOf({ csvUrl: 'https://x/y.csv' })
		);
	});

	it('carries overrides and the row filter', () => {
		expect(
			adaptInlineSource({
				CSV_URL: 'https://x/y.csv',
				RANK_COLUMN: 'Tier',
				SCALE: [{ value: 'S' }],
				ROW_FILTER: { FIELD: 'Type', VALUES: ['IEM'] }
			})
		).toMatchObject({
			rankColumn: 'Tier',
			scale: [{ value: 'S' }],
			rowFilter: { field: 'Type', values: ['IEM'] }
		});
	});
});

describe('lookupRank', () => {
	const csv = [
		'Brand,Model,Rank,Style',
		'GrinEar,Reference,S,IEM',
		'TrueEar,Projekt Wen,A,IEM',
		'LX,Whatever,,IEM',
		'Moondrop,Blessing 2 Dusk,A,IEM'
	].join('\n');
	const index = buildRankIndex(csvToRows(csv), sourceOf(), 'strict');

	it('matches an exact brand and model', () => {
		expect(lookupRank(index, 'GrinEar', 'Reference')).toMatchObject({ value: 'S' });
	});

	it('matches across case and whitespace differences', () => {
		expect(lookupRank(index, 'trueear', 'projekt   wen')).toMatchObject({ value: 'A' });
	});

	it('matches across punctuation the two files spell differently', () => {
		expect(lookupRank(index, 'True-Ear', 'Projekt.Wen')).toMatchObject({ value: 'A' });
	});

	it('returns the brand and model as the sheet spells them, for the deep link', () => {
		expect(lookupRank(index, 'trueear', 'projekt wen')).toMatchObject({
			brand: 'TrueEar',
			model: 'Projekt Wen',
			slug: 'trueear-projekt-wen'
		});
	});

	it('ignores a row whose rank cell is blank, so the phone book still shows through', () => {
		expect(lookupRank(index, 'LX', 'Whatever')).toBeNull();
	});

	it('refuses a substring match in strict mode — a wrong grade is worse than none', () => {
		expect(lookupRank(index, 'Moondrop', 'Blessing 2')).toBeNull();
	});

	it('accepts that same substring in loose mode', () => {
		const loose = buildRankIndex(csvToRows(csv), sourceOf(), 'loose');
		expect(lookupRank(loose, 'Moondrop', 'Blessing 2')).toMatchObject({ value: 'A' });
	});

	it('caches misses as well as hits', () => {
		const cached = buildRankIndex(csvToRows(csv), sourceOf(), 'strict');
		expect(lookupRank(cached, 'Nobody', 'Nothing')).toBeNull();
		expect(cached.cache.size).toBe(1);
	});

	it('returns null for an absent index, an empty brand or an empty model', () => {
		expect(lookupRank(null, 'GrinEar', 'Reference')).toBeNull();
		expect(lookupRank(index, '', 'Reference')).toBeNull();
		expect(lookupRank(index, 'GrinEar', '')).toBeNull();
	});

	it('applies a row filter, so one sheet can serve two deploys', () => {
		const open = buildRankIndex(
			csvToRows('Brand,Model,Rank,Style\nA,One,S,IEM\nB,Two,S,Open'),
			sourceOf({ rowFilter: { field: 'Style', values: ['Open'] } }),
			'strict'
		);
		expect(lookupRank(open, 'A', 'One')).toBeNull();
		expect(lookupRank(open, 'B', 'Two')).toMatchObject({ value: 'S' });
	});

	it('builds the slug with the ranking page own template', () => {
		const custom = buildRankIndex(
			csvToRows('Brand,Model,Rank\nGrinEar,Reference,S'),
			sourceOf({ deepLinkTemplate: '{Brand}_{Model}', slugify: 'none' }),
			'strict'
		);
		expect(lookupRank(custom, 'GrinEar', 'Reference')?.slug).toBe('GrinEar_Reference');
	});
});

describe('readableTextColor', () => {
	it('puts white on a dark badge and black on a light one', () => {
		expect(readableTextColor('#b71c1c')).toBe('#ffffff');
		expect(readableTextColor('#ffc107')).toBe('#000000');
	});

	// Mid-tone badge colors are the ones worth pinning: squigRanking's own
	// `letter` preset runs through this purple, and white on it is the lower
	// contrast of the two (4.31 against black's 4.87) despite looking like the
	// obvious choice.
	it('picks the higher contrast even where the darker text looks unexpected', () => {
		expect(readableTextColor('#6c63ff')).toBe('#000000');
	});

	it('expands three-digit hex', () => {
		expect(readableTextColor('#fff')).toBe('#000000');
	});

	it('keeps squigRanking documented default for a color it cannot measure', () => {
		expect(readableTextColor('rebeccapurple')).toBe('#ffffff');
		expect(readableTextColor(undefined)).toBeUndefined();
	});
});

describe('renderStars', () => {
	it('draws halves and clamps to the 0-5 row the tool has always drawn', () => {
		expect(renderStars(4)).toBe('★★★★☆');
		expect(renderStars(4.5)).toBe('★★★★⭐');
		expect(renderStars(9)).toBe('★★★★★');
		expect(renderStars(-1)).toBe('☆☆☆☆☆');
	});
});

describe('resolveRankDisplay', () => {
	const scale = adaptSquigRankingConfig(squigConfig, 'earphone')!.scale;

	it('still draws a bare 0-5 score as stars when no scale describes it', () => {
		expect(resolveRankDisplay(4, [])).toMatchObject({ kind: 'stars', text: '★★★★☆' });
	});

	it('still draws an unknown value as its own text', () => {
		expect(resolveRankDisplay('A+', [])).toMatchObject({ kind: 'text', text: 'A+' });
	});

	it('draws a scale value as a badge carrying its color and a contrasting text color', () => {
		expect(resolveRankDisplay('S', scale)).toMatchObject({
			kind: 'badge',
			text: 'S',
			color: '#6c63ff',
			textColor: '#000000'
		});
	});

	it('keeps an explicit textColor from the scale', () => {
		expect(resolveRankDisplay('F', scale)).toMatchObject({ textColor: '#222222' });
	});

	it('matches a scale value across case and spacing', () => {
		expect(resolveRankDisplay(' s ', scale)).toMatchObject({ kind: 'badge', color: '#6c63ff' });
	});

	it('renders a phone_book score through the same scale as a sheet cell', () => {
		expect(resolveRankDisplay('A', scale)).toMatchObject({ kind: 'badge', color: '#00bfff' });
	});

	it('honors an explicit display mode', () => {
		expect(resolveRankDisplay('S', scale, 'text')).toMatchObject({ kind: 'text', text: 'S' });
		expect(resolveRankDisplay('S', scale, 'stars')).toMatchObject({ kind: 'stars', text: '★★★★★' });
		expect(resolveRankDisplay('A+', [], 'badge')).toMatchObject({
			kind: 'badge',
			color: undefined
		});
	});

	it('falls back to text when stars are asked for a value with no number behind it', () => {
		expect(resolveRankDisplay('A+', [], 'stars')).toMatchObject({ kind: 'text' });
	});

	it('shows nothing for an empty or absent rank', () => {
		expect(resolveRankDisplay(undefined, scale)).toBeNull();
		expect(resolveRankDisplay('   ', scale)).toBeNull();
	});
});

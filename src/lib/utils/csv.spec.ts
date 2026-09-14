import { describe, it, expect } from 'vitest';
import { csvToRows, parseCsv } from './csv.js';

describe('parseCsv', () => {
	it('splits plain rows on commas and either line ending', () => {
		expect(parseCsv('a,b\r\nc,d\ne,f')).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f']
		]);
	});

	it('keeps commas, newlines and escaped quotes inside a quoted field', () => {
		const text =
			'Brand,Pros\nGrinEar,"Even tonality\nExcellent detail, really"\nLX,"He said ""no"""';
		expect(parseCsv(text)).toEqual([
			['Brand', 'Pros'],
			['GrinEar', 'Even tonality\nExcellent detail, really'],
			['LX', 'He said "no"']
		]);
	});

	it('keeps empty trailing cells', () => {
		expect(parseCsv('a,,c,')).toEqual([['a', '', 'c', '']]);
	});
});

describe('csvToRows', () => {
	it('keys cells by trimmed header and trims the values', () => {
		expect(csvToRows('Brand , Model\n GrinEar , Reference ')).toEqual([
			{ Brand: 'GrinEar', Model: 'Reference' }
		]);
	});

	it('skips blank rows, including the trailing newline a sheet export ends with', () => {
		expect(csvToRows('Brand,Model\nGrinEar,Reference\n,\n')).toEqual([
			{ Brand: 'GrinEar', Model: 'Reference' }
		]);
	});

	it('fills missing trailing cells rather than leaving them undefined', () => {
		expect(csvToRows('Brand,Model,Rank\nGrinEar,Reference')).toEqual([
			{ Brand: 'GrinEar', Model: 'Reference', Rank: '' }
		]);
	});

	it('returns nothing for empty input', () => {
		expect(csvToRows('')).toEqual([]);
	});
});

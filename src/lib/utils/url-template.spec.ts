import { describe, it, expect } from 'vitest';
import { buildRankingUrl } from './url-template.js';

describe('buildRankingUrl', () => {
	const ctx = { type: 'earphone', brand: 'Apple', model: 'AirPods Max USB-C' };

	it('returns null for empty, null, or undefined templates', () => {
		expect(buildRankingUrl('', ctx)).toBeNull();
		expect(buildRankingUrl(null, ctx)).toBeNull();
		expect(buildRankingUrl(undefined, ctx)).toBeNull();
	});

	it('returns the template verbatim when no placeholders are present', () => {
		const raw = 'https://docs.google.com/spreadsheets/d/abc/pubhtml';
		expect(buildRankingUrl(raw, ctx)).toBe(raw);
	});

	it('substitutes {slug} in lowercase-hyphen form matching squigRanking buildCardId', () => {
		expect(buildRankingUrl('/ranking/#{slug}', ctx)).toBe('/ranking/#apple-airpods-max-usb-c');
	});

	it('substitutes {type}, {brand}, {model}, {fullName} with URL-encoded values', () => {
		const tpl = '/r/?type={type}&b={brand}&m={model}&n={fullName}';
		expect(buildRankingUrl(tpl, ctx)).toBe(
			'/r/?type=earphone&b=Apple&m=AirPods%20Max%20USB-C&n=Apple%20AirPods%20Max%20USB-C'
		);
	});

	it('combines {type} and {slug} for the canonical deep-link template', () => {
		expect(buildRankingUrl('/ranking/?type={type}#{slug}', ctx)).toBe(
			'/ranking/?type=earphone#apple-airpods-max-usb-c'
		);
	});

	it('leaves unknown placeholders as empty strings', () => {
		expect(buildRankingUrl('/x/{unknown}/{slug}', ctx)).toBe('/x//apple-airpods-max-usb-c');
	});
});

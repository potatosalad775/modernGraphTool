import { describe, it, expect, beforeEach } from 'vitest';
import { squiglinkStore } from './squiglink-store.svelte.js';
import type { SquiglinkSite, ShopLinkEntry } from '$lib/types/squiglink-types.js';

function makeSite(overrides: Partial<SquiglinkSite> = {}): SquiglinkSite {
	return {
		username: 'testsite',
		name: 'Test Site',
		urlType: 'subdomain',
		dbs: [{ type: 'IEM', folder: 'data' }],
		...overrides
	};
}

function makeShopLink(overrides: Partial<ShopLinkEntry> = {}): ShopLinkEntry {
	return {
		model: 'Test Model',
		squiglink_url: 'https://squig.link/test',
		embed_code: '',
		type: 'IEM',
		hfg_com: '',
		hfg_amzus: '',
		hfg_amzjp: '',
		hfg_ali: '',
		...overrides
	};
}

describe('SquiglinkStore', () => {
	// ── buildSiteUrl ──────────────────────────────────────────────────────

	describe('buildSiteUrl', () => {
		it('builds root URL for root urlType', () => {
			const site = makeSite({ urlType: 'root' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://squig.link');
		});

		it('uses altDomain when urlType is altDomain and altDomain is set', () => {
			const site = makeSite({ urlType: 'altDomain', altDomain: 'https://custom.example.com' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://custom.example.com');
		});

		it('falls back to subdomain URL when altDomain urlType but altDomain is missing', () => {
			const site = makeSite({ urlType: 'altDomain', username: 'bob' });
			// altDomain is undefined, so fallback: `https://${username}.squig.link`
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://bob.squig.link');
		});

		it('builds subdomain URL for subdomain urlType', () => {
			const site = makeSite({ urlType: 'subdomain', username: 'alice' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://alice.squig.link');
		});

		it('builds lab folder URL for labFolder urlType', () => {
			const site = makeSite({ urlType: 'labFolder', username: 'labuser' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://squig.link/lab/labuser');
		});

		it('defaults to subdomain for unknown urlType', () => {
			const site = makeSite({ urlType: 'unknown' as any, username: 'fallback' });
			expect(squiglinkStore.buildSiteUrl(site)).toBe('https://fallback.squig.link');
		});
	});

	// ── findShopLink ──────────────────────────────────────────────────────

	describe('findShopLink', () => {
		beforeEach(() => {
			squiglinkStore.shopLinks = [];
		});

		it('returns undefined when shopLinks is empty', () => {
			expect(squiglinkStore.findShopLink('Test Model')).toBeUndefined();
		});

		it('finds exact case-insensitive match', () => {
			squiglinkStore.shopLinks = [
				makeShopLink({ model: 'Sennheiser HD 600' }),
				makeShopLink({ model: 'Moondrop Blessing 3' })
			];
			const result = squiglinkStore.findShopLink('sennheiser hd 600');
			expect(result).toBeDefined();
			expect(result!.model).toBe('Sennheiser HD 600');
		});

		it('returns undefined when no match', () => {
			squiglinkStore.shopLinks = [makeShopLink({ model: 'Sennheiser HD 600' })];
			expect(squiglinkStore.findShopLink('NonExistent')).toBeUndefined();
		});
	});

	// ── searchResults ─────────────────────────────────────────────────────

	describe('searchResults', () => {
		beforeEach(() => {
			squiglinkStore.searchQuery = '';
			squiglinkStore.sites = [];
			squiglinkStore.shopLinks = [];
		});

		it('returns empty array for query shorter than 2 chars', () => {
			squiglinkStore.searchQuery = 'a';
			expect(squiglinkStore.searchResults).toEqual([]);
		});

		it('returns empty array for empty query', () => {
			squiglinkStore.searchQuery = '';
			expect(squiglinkStore.searchResults).toEqual([]);
		});

		it('returns empty when no phoneBooks loaded', () => {
			squiglinkStore.sites = [makeSite({ username: 'othersite' })];
			squiglinkStore.searchQuery = 'HD 600';
			expect(squiglinkStore.searchResults).toEqual([]);
		});
	});
});

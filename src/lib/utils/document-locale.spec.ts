import { describe, it, expect } from 'vitest';
import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';
import { applyDocumentLocale } from './document-locale.js';

describe('applyDocumentLocale', () => {
	it('stamps the resolved locale and its text direction onto the root', () => {
		const root = { lang: 'en', dir: '' };
		applyDocumentLocale(root);
		expect(root.lang).toBe(getLocale());
		expect(root.dir).toBe(getTextDirection(getLocale()));
	});
});

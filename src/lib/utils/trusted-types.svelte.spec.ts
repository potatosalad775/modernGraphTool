/**
 * Runs in Chromium, which has Trusted Types: a policy can be created and used without a CSP
 * that enforces it. The enforced case (a plain string thrown out at the sink) is covered by
 * `npm run test:smoke`, which serves the build with `require-trusted-types-for 'script'`.
 */
import { describe, it, expect } from 'vitest';
import { trustedHtml, trustedScriptUrl } from './trusted-types.js';

describe('trustedHtml', () => {
	it('hands the markup over unchanged, as a TrustedHTML', () => {
		const html = '<a href="https://example.com">link</a>';
		const trusted = trustedHtml(html) as unknown;
		expect(String(trusted)).toBe(html);
		expect(Object.prototype.toString.call(trusted)).toBe('[object TrustedHTML]');
	});

	it('is accepted by innerHTML', () => {
		const div = document.createElement('div');
		div.innerHTML = trustedHtml('<b>bold</b>');
		expect(div.querySelector('b')?.textContent).toBe('bold');
	});
});

describe('trustedScriptUrl', () => {
	it.each([
		['a same-origin path', '/_app/immutable/workers/autoeq.worker.js'],
		['a same-origin absolute URL', `${location.origin}/x.js`],
		['an https URL', 'https://www.googletagmanager.com/gtag/js?id=G-ABC123'],
		['a blob URL', `blob:${location.origin}/0f8fad5b-d9cb-469f-a165-70867728950e`]
	])('accepts %s', (_name, url) => {
		const trusted = trustedScriptUrl(url) as unknown;
		expect(String(trusted)).toBe(url);
		expect(Object.prototype.toString.call(trusted)).toBe('[object TrustedScriptURL]');
	});

	it.each([
		['plain http on another host', 'http://example.com/x.js'],
		['a data URL', 'data:text/javascript,alert(1)'],
		['a javascript URL', 'javascript:alert(1)']
	])('refuses %s', (_name, url) => {
		expect(() => trustedScriptUrl(url)).toThrow(/Refusing to load a script/);
	});
});

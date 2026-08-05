import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeUrl, stripHtml } from './html-sanitizer.js';

describe('sanitizeUrl', () => {
	it('keeps the safe schemes', () => {
		expect(sanitizeUrl('https://example.com/x?a=1&b=2')).toBe('https://example.com/x?a=1&b=2');
		expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
		expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
		expect(sanitizeUrl('tel:+1234')).toBe('tel:+1234');
	});

	it('keeps schemeless URLs — they resolve against the deployment origin', () => {
		expect(sanitizeUrl('/data/notes.html')).toBe('/data/notes.html');
		expect(sanitizeUrl('#anchor')).toBe('#anchor');
		expect(sanitizeUrl('//cdn.example.com/x')).toBe('//cdn.example.com/x');
		// A colon inside a path is not a scheme.
		expect(sanitizeUrl('path/to:thing')).toBe('path/to:thing');
	});

	it('rejects script-bearing schemes', () => {
		expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
		expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeNull();
		expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(sanitizeUrl('vbscript:msgbox')).toBeNull();
	});

	it('rejects schemes hidden behind entities or control characters', () => {
		expect(sanitizeUrl('java&#115;cript:alert(1)')).toBeNull();
		expect(sanitizeUrl('javascript&colon;alert(1)')).toBeNull();
		expect(sanitizeUrl('java\nscript:alert(1)')).toBeNull();
		expect(sanitizeUrl('  \tjavascript:alert(1)')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(sanitizeUrl('')).toBeNull();
		expect(sanitizeUrl(null)).toBeNull();
		expect(sanitizeUrl(undefined)).toBeNull();
		expect(sanitizeUrl('   ')).toBeNull();
	});
});

describe('sanitizeHtml', () => {
	it('passes plain text through, escaping bare ampersands', () => {
		expect(sanitizeHtml('B&K 5128 measurement')).toBe('B&amp;K 5128 measurement');
	});

	it('leaves an author-written entity alone rather than double-escaping it', () => {
		expect(sanitizeHtml('B&amp;K &#8212; 5128')).toBe('B&amp;K &#8212; 5128');
	});

	it('keeps an allowed anchor and forces safe link attributes', () => {
		expect(sanitizeHtml('see <a href="https://example.com/x">here</a>')).toBe(
			'see <a href="https://example.com/x" target="_blank" rel="external noopener noreferrer">here</a>'
		);
	});

	it('keeps the inline formatting tags', () => {
		expect(sanitizeHtml('<b>a</b> <em>b</em> <code>c</code><br><sup>d</sup>')).toBe(
			'<b>a</b> <em>b</em> <code>c</code><br><sup>d</sup>'
		);
	});

	it('strips the anchor href when the scheme is unsafe, keeping the text', () => {
		expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
	});

	it('drops event handlers, styles and every other attribute', () => {
		expect(sanitizeHtml('<b onclick="alert(1)" style="color:red" class="x">hi</b>')).toBe(
			'<b>hi</b>'
		);
		expect(sanitizeHtml('<a href="https://a.b" onmouseover="alert(1)">x</a>')).toBe(
			'<a href="https://a.b" target="_blank" rel="external noopener noreferrer">x</a>'
		);
	});

	it('unwraps unknown tags but keeps their text', () => {
		expect(sanitizeHtml('<div>outer <span>inner</span></div>')).toBe('outer <span>inner</span>');
		expect(sanitizeHtml('<img src="x" onerror="alert(1)">left')).toBe('left');
	});

	it('drops opaque tags together with their content', () => {
		expect(sanitizeHtml('a<script>alert(1)</script>b')).toBe('ab');
		expect(sanitizeHtml('a<style>body{}</style>b')).toBe('ab');
		expect(sanitizeHtml('a<iframe src="https://evil"></iframe>b')).toBe('ab');
		expect(sanitizeHtml('a<svg><script>alert(1)</script></svg>b')).toBe('ab');
	});

	it('drops comments and doctypes', () => {
		expect(sanitizeHtml('a<!-- <script>alert(1)</script> -->b')).toBe('ab');
		expect(sanitizeHtml('<!doctype html>text')).toBe('text');
	});

	it('closes tags the author left open', () => {
		expect(sanitizeHtml('<b>bold')).toBe('<b>bold</b>');
		expect(sanitizeHtml('<b><i>x')).toBe('<b><i>x</i></b>');
	});

	it('drops a close tag with no matching open tag', () => {
		expect(sanitizeHtml('x</b>y')).toBe('xy');
	});

	it('closes intervening tags when the author closes out of order', () => {
		expect(sanitizeHtml('<b><i>x</b>y')).toBe('<b><i>x</i></b>y');
	});

	it('escapes a bare or unterminated angle bracket instead of eating the rest', () => {
		expect(sanitizeHtml('5 < 10 and 10 > 5')).toBe('5 &lt; 10 and 10 &gt; 5');
		expect(sanitizeHtml('trailing <b')).toBe('trailing &lt;b');
	});

	it('does not let a quoted attribute value terminate the tag early', () => {
		expect(sanitizeHtml('<a title="a > b" href="https://a.b">x</a>')).toBe(
			'<a href="https://a.b" title="a &gt; b" target="_blank" rel="external noopener noreferrer">x</a>'
		);
	});

	it('returns an empty string for empty input', () => {
		expect(sanitizeHtml('')).toBe('');
		expect(sanitizeHtml(null)).toBe('');
		expect(sanitizeHtml(undefined)).toBe('');
	});
});

describe('stripHtml', () => {
	it('flattens markup to text for use in a title attribute', () => {
		expect(stripHtml('B&K5128 measurement is available <a href="https://x.y">here</a>')).toBe(
			'B&K5128 measurement is available here'
		);
	});

	it('decodes entities and collapses whitespace', () => {
		expect(stripHtml('a&amp;b  &#8212;\n  c')).toBe('a&b — c');
	});

	it('turns a line break into a space rather than joining words', () => {
		expect(stripHtml('first<br>second')).toBe('first second');
	});

	it('drops opaque content the same way sanitizeHtml does', () => {
		expect(stripHtml('a<script>alert(1)</script>b')).toBe('ab');
	});

	it('returns an empty string for empty input', () => {
		expect(stripHtml('')).toBe('');
		expect(stripHtml(null)).toBe('');
		expect(stripHtml(undefined)).toBe('');
	});
});

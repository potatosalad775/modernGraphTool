import { describe, it, expect } from 'vitest';
import { extractDeclaredLiteral, readJsLiteral, JsLiteralError } from './js-literal.js';

const read = (src: string) => readJsLiteral(src).value;

// Shaped like the live squig.link scripts: single-quoted keys and values, `\'` escapes inside a
// `url("data:…")` value, a block of legacy CrinGraph code after the literal.
const INTRO_SCRIPT = `let introMode = 'prod',
    urlParams = new URLSearchParams(window.location.search);

let contentWelcome = [
    { 'heading': 'Welcome' }
];

// Sponsorship stuff
let contentSponsor = [
        {
            'sponsorId': 'dunu-vitruvian',
            'heading': 'HiFiGo supports Squiglink',
            'sponsorLogo': 'url("data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\'%3E")',
            'sponsorMessage': 'New! Dunu DaVinci, refined',
            'creative': 'https://squig.link/sponsorship/hifigo/dunu-vitruvian.jpg',
            'creativeBgColor': '#120401',
            'cta2Text': 'AliExpress',
            'ctaLink': 'https://hifigo.com/products/dunu-davinci-vitruvian'
        }
    ];

// Check if lastshoplink exists
//function checkLastShoplink() {
//    let lastShoplink = localStorage.getItem('last-shoplink');
//}

let parent = document.querySelector('body');
document.body.appendChild(\`<main>\${parent}</main>\`);
`;

const DETAILS_SCRIPT = `let shoplinksMode = 'prod';

let sponsorDetails = {
    'sponsorName': 'HiFiGo',
    'utmParams': '?utm_source=squiglink&utm_medium=shoplink&utm_campaign=818sale2024Q3'
};

function shopLink() {
    let conditionsMet = countActivePhones(activePhones);
}
`;

describe('readJsLiteral — what it accepts', () => {
	it('reads strict JSON', () => {
		expect(read('{"a": [1, 2.5, -3e2, true, false, null], "b": {"c": "d"}}')).toEqual({
			a: [1, 2.5, -300, true, false, null],
			b: { c: 'd' }
		});
	});

	it('reads single-quoted strings and unquoted keys', () => {
		expect(read("{ name: 'HiFiGo', 'ctaLink': \"https://x.test\" }")).toEqual({
			name: 'HiFiGo',
			ctaLink: 'https://x.test'
		});
	});

	it('allows trailing commas and comments', () => {
		const src = `[
			// a line comment
			{ a: 1, /* inline */ b: 2, },
			'x', /* before the end */
		]`;
		expect(read(src)).toEqual([{ a: 1, b: 2 }, 'x']);
	});

	it('decodes the ES string escapes', () => {
		expect(read(String.raw`'it\'s \"q\" \\ \/ \n\t \x41 \u00e9 \u{1F3A7} \0 \-'`)).toBe(
			'it\'s "q" \\ / \n\t A \u00e9 \u{1F3A7} \0 -'
		);
	});

	it('joins a line continuation inside a string', () => {
		expect(read("'ab\\\ncd'")).toBe('abcd');
		expect(read("'ab\\\r\ncd'")).toBe('abcd');
	});

	it('keeps quotes of the other kind and `//` inside strings', () => {
		expect(read(`'say "hi" // not a comment /* nor this */'`)).toBe(
			'say "hi" // not a comment /* nor this */'
		);
	});

	it('lets a later duplicate key win, as JS does', () => {
		expect(read('{ a: 1, a: 2 }')).toEqual({ a: 2 });
	});

	it('returns where the literal ended, and ignores what follows', () => {
		const src = "[1, 2]; document.querySelector('#x').click();";
		expect(readJsLiteral(src)).toEqual({ value: [1, 2], end: 6 });
	});

	it('starts from the given index', () => {
		expect(readJsLiteral('let x = {a: 1}', 8).value).toEqual({ a: 1 });
	});
});

describe('readJsLiteral — what it rejects', () => {
	const hostile: Array<[string, string]> = [
		['a function call', "{ a: alert('x') }"],
		['an IIFE', '(function(){})()'],
		['an identifier', '{ a: window }'],
		['undefined', '{ a: undefined }'],
		['NaN / Infinity', '[NaN, Infinity]'],
		['an operator expression', '{ a: 1 + 2 }'],
		['string concatenation', "{ a: 'x' + 'y' }"],
		['a template literal', '{ a: `x` }'],
		['a template with interpolation', '{ a: `${alert(1)}` }'],
		['a getter', "{ get a() { return 'x'; } }"],
		['a setter', '{ set a(v) {} }'],
		['a method', '{ a() { return 1; } }'],
		['an async method', '{ async a() {} }'],
		['a shorthand member', '{ a }'],
		['a computed key', "{ ['a']: 1 }"],
		['a spread member', '{ ...x }'],
		['a spread element', '[...x]'],
		['an array hole', '[1,,2]'],
		['a leading array comma', '[,1]'],
		['a function expression', '{ a: function () {} }'],
		['an arrow function', '{ a: () => 1 }'],
		['a class', '{ a: class {} }'],
		['a regex literal', '{ a: /x/ }'],
		['a hex number', '[0x10]'],
		['a number with a unit suffix', '[10px]'],
		['a numeric key', '{ 1: 2 }'],
		['a __proto__ key', '{ "__proto__": { polluted: true } }'],
		['an unquoted __proto__ key', '{ __proto__: null }'],
		['an octal escape', "'\\101'"],
		['a short hex escape', "'\\x4'"],
		['a short unicode escape', "'\\u12'"],
		['an out-of-range code point', "'\\u{110000}'"],
		['a raw newline in a string', "'a\nb'"],
		['an unterminated string', "'abc"],
		['an unterminated comment', '/* [1]'],
		['an unterminated object', '{ a: 1'],
		['an unterminated array', '[1, 2'],
		['a missing colon', '{ a 1 }'],
		['a missing comma', '[1 2]'],
		['an empty input', ''],
		['only a comment', '// nothing']
	];

	it.each(hostile)('rejects %s', (_label, src) => {
		expect(() => readJsLiteral(src)).toThrow(JsLiteralError);
	});

	it('does not run a rejected call', () => {
		const g = globalThis as unknown as Record<string, unknown>;
		g.__jsLiteralRan = false;
		expect(() => readJsLiteral('{ a: (globalThis.__jsLiteralRan = true) }')).toThrow(
			JsLiteralError
		);
		expect(g.__jsLiteralRan).toBe(false);
		delete g.__jsLiteralRan;
	});

	it('does not touch Object.prototype through a __proto__ key', () => {
		expect(() => readJsLiteral('{"__proto__": {"polluted": 1}}')).toThrow(JsLiteralError);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('stops a deeply nested payload instead of overflowing the stack', () => {
		expect(() => readJsLiteral('['.repeat(5000))).toThrow(JsLiteralError);
		expect(() => readJsLiteral('['.repeat(40) + ']'.repeat(40))).toThrow(JsLiteralError);
	});

	it('names the position of the failure', () => {
		try {
			readJsLiteral('[1, foo]');
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(JsLiteralError);
			expect((e as JsLiteralError).index).toBe(4);
		}
	});
});

describe('extractDeclaredLiteral', () => {
	it('reads the sponsor array out of a squiglink-intro-shaped script', () => {
		const data = extractDeclaredLiteral(INTRO_SCRIPT, 'contentSponsor') as Record<string, string>[];

		expect(data).toHaveLength(1);
		expect(data[0].sponsorId).toBe('dunu-vitruvian');
		expect(data[0].creative).toBe('https://squig.link/sponsorship/hifigo/dunu-vitruvian.jpg');
		expect(data[0].sponsorLogo).toBe(
			'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E")'
		);
	});

	it('picks the named declaration, not the neighbouring ones', () => {
		const data = extractDeclaredLiteral(INTRO_SCRIPT, 'contentWelcome');
		expect(data).toEqual([{ heading: 'Welcome' }]);
	});

	it('reads the sponsor details object out of a shoplinks-shaped script', () => {
		expect(extractDeclaredLiteral(DETAILS_SCRIPT, 'sponsorDetails')).toEqual({
			sponsorName: 'HiFiGo',
			utmParams: '?utm_source=squiglink&utm_medium=shoplink&utm_campaign=818sale2024Q3'
		});
	});

	it('accepts const and var', () => {
		expect(extractDeclaredLiteral('const a = [1];', 'a')).toEqual([1]);
		expect(extractDeclaredLiteral('var a = [1];', 'a')).toEqual([1]);
	});

	it('returns undefined when there is no such declaration', () => {
		expect(extractDeclaredLiteral(DETAILS_SCRIPT, 'contentSponsor')).toBeUndefined();
		expect(extractDeclaredLiteral('', 'x')).toBeUndefined();
	});

	it('does not match a longer name or a mention in the middle of a line', () => {
		expect(
			extractDeclaredLiteral('let sponsorDetailsX = {a: 1};', 'sponsorDetails')
		).toBeUndefined();
		expect(extractDeclaredLiteral("log('let a = [1]');", 'a')).toBeUndefined();
	});

	it('treats the name as a literal, not a pattern', () => {
		expect(extractDeclaredLiteral('let abc = [1];', 'a.c')).toBeUndefined();
		expect(extractDeclaredLiteral('let $x = [1];', '$x')).toEqual([1]);
	});

	it('refuses a declaration whose value is code', () => {
		expect(() => extractDeclaredLiteral("let a = fetch('https://evil.test');", 'a')).toThrow(
			JsLiteralError
		);
		expect(() => extractDeclaredLiteral('let a = [1].concat(window.x);', 'a')).toThrow(
			JsLiteralError
		);
	});

	it.each([
		['a method call', 'let a = [1].concat(window.x);'],
		['a method call on the next line', 'let a = [1]\n\t.concat(window.x);'],
		['a call', "let a = {x: 1}('y');"],
		['an index', 'let a = [1][0];'],
		['an operator', "let a = 'x' + document.cookie;"],
		['an operator hidden behind a comment', "let a = 'x' /* c */ + document.cookie;"],
		['a conditional', 'let a = [1] ? window.x : 2;'],
		['an in-expression on the next line', "let a = 'x'\nin window;"],
		['a stray token', 'let a = [1] foo;']
	])('refuses a literal that is only the start of an expression: %s', (_label, src) => {
		expect(() => extractDeclaredLiteral(src, 'a')).toThrow(JsLiteralError);
	});

	it.each([
		['a semicolon', 'let a = [1];\nfoo();'],
		['no semicolon, then a statement', 'let a = [1]\nfoo();'],
		['no semicolon, then a declaration', 'let a = [1]\nlet b = 2;'],
		['end of input', 'let a = [1]'],
		['trailing spaces and end of input', 'let a = [1]   \n'],
		['a comma-joined declaration', 'let a = [1], b = new Foo();'],
		['a trailing comment', 'let a = [1]; // done'],
		['a comment, then a statement on the next line', 'let a = [1] // done\nfoo();'],
		['a block comment, then a statement on the next line', 'let a = [1] /* x */\nfoo();']
	])('accepts a literal that ends the declaration: %s', (_label, src) => {
		expect(extractDeclaredLiteral(src, 'a')).toEqual([1]);
	});

	it('refuses a literal that smuggles a call in a later member', () => {
		const src = "let a = { ok: 'fine', bad: eval('1') };";
		expect(() => extractDeclaredLiteral(src, 'a')).toThrow(JsLiteralError);
	});
});

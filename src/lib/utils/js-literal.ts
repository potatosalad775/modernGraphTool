/**
 * Reads a JavaScript object / array literal as data, without running it.
 *
 * squig.link publishes its sponsor data as scripts that declare a literal
 * (`let contentSponsor = [ { 'sponsorId': '…', … } ];`) followed by CrinGraph DOM code.
 * The literal is not JSON (single quotes, `\'` escapes, comments, trailing commas), and the
 * store used to `eval` the whole script to get at it, which forced `'unsafe-eval'` into any
 * CSP. This reads just the literal.
 *
 * It accepts the data subset of the ECMAScript grammar and **rejects everything else**:
 * identifiers other than `true` / `false` / `null`, calls, operators, template literals,
 * computed keys, shorthand and method members, getters, spread and array holes. A rejected
 * input throws `JsLiteralError`; there is deliberately no fallback to `eval`.
 *
 * Accepted: objects, arrays, single- or double-quoted strings (with the ES escapes),
 * decimal numbers, `true` / `false` / `null`, `//` and block comments, trailing commas, and
 * identifier or string keys. A `__proto__` key is refused.
 */

export class JsLiteralError extends Error {
	readonly index: number;

	constructor(message: string, index: number) {
		super(`${message} (at ${index})`);
		this.name = 'JsLiteralError';
		this.index = index;
	}
}

/** Deeper than any real payload; stops a hostile `[[[[…` from exhausting the stack. */
const MAX_DEPTH = 32;

const SIMPLE_ESCAPES: Record<string, string> = {
	n: '\n',
	t: '\t',
	r: '\r',
	b: '\b',
	f: '\f',
	v: '\v'
};

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const HEX = /^[0-9a-fA-F]+$/;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** What, at the start of the next line, still belongs to the previous expression. */
const CONTINUES_EXPRESSION = /^(?:[.([+\-*/%?:=<>&|^`]|in\b|instanceof\b)/;

/**
 * Parse the literal that starts at `from` (leading whitespace and comments are skipped).
 * Returns the value and the index just past it, so the rest of the script is never read.
 */
export function readJsLiteral(
	source: string,
	from = 0,
	options: { statement?: boolean } = {}
): { value: unknown; end: number } {
	let i = from;

	const fail = (message: string): never => {
		throw new JsLiteralError(message, i);
	};

	/** Returns whether the skipped trivia held a line break. */
	function skipTrivia(): boolean {
		let sawLineBreak = false;
		while (i < source.length) {
			const c = source[i];
			if (/\s/.test(c)) {
				if (LINE_BREAK.test(c)) sawLineBreak = true;
				i++;
			} else if (c === '/' && source[i + 1] === '/') {
				while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
			} else if (c === '/' && source[i + 1] === '*') {
				const close = source.indexOf('*/', i + 2);
				if (close === -1) fail('Unterminated comment');
				if (LINE_BREAK.test(source.slice(i, close))) sawLineBreak = true;
				i = close + 2;
			} else {
				break;
			}
		}
		return sawLineBreak;
	}

	function readHex(count: number): number {
		const digits = source.slice(i, i + count);
		if (digits.length !== count || !HEX.test(digits)) fail('Bad escape sequence');
		i += count;
		return Number.parseInt(digits, 16);
	}

	function readString(): string {
		const quote = source[i++];
		let out = '';
		while (i < source.length) {
			const c = source[i];
			if (c === quote) {
				i++;
				return out;
			}
			if (c === '\n' || c === '\r') fail('Unterminated string');
			i++;
			out += c === '\\' ? readEscape() : c;
		}
		return fail('Unterminated string');
	}

	/** Reads what follows a backslash in a string and returns the text it stands for. */
	function readEscape(): string {
		const e = source.at(i);
		if (e === undefined) return fail('Unterminated string');
		if (/\d/.test(e)) {
			if (e !== '0' || /\d/.test(source[i + 1] ?? '')) fail('Octal escapes are not allowed');
			i++;
			return '\0';
		}
		i++;
		if (e in SIMPLE_ESCAPES) return SIMPLE_ESCAPES[e];
		if (e === 'x') return String.fromCharCode(readHex(2));
		if (e === 'u') return readUnicodeEscape();
		// Line continuation: a backslash before a newline adds nothing
		if (e === '\r') {
			if (source[i] === '\n') i++;
			return '';
		}
		if (e === '\n' || e === ' ' || e === ' ') return '';
		// `\'` `\"` `\\` `\/` and any other escaped character stand for themselves
		return e;
	}

	/** The rest of a `\u` escape: four hex digits, or a code point in braces. */
	function readUnicodeEscape(): string {
		if (source[i] !== '{') return String.fromCharCode(readHex(4));
		const close = source.indexOf('}', i);
		const digits = close === -1 ? '' : source.slice(i + 1, close);
		if (!HEX.test(digits)) fail('Bad escape sequence');
		const code = Number.parseInt(digits, 16);
		if (code > 0x10ffff) fail('Bad escape sequence');
		i = close + 1;
		return String.fromCodePoint(code);
	}

	function readIdentifier(): string {
		const start = i;
		if (!IDENT_START.test(source[i] ?? '')) fail('Unexpected character');
		while (i < source.length && IDENT_PART.test(source[i])) i++;
		return source.slice(start, i);
	}

	function readNumber(): number {
		NUMBER.lastIndex = i;
		const match = NUMBER.exec(source);
		if (!match) return fail('Unexpected character');
		i += match[0].length;
		if (IDENT_PART.test(source[i] ?? '')) fail('Unexpected character after number');
		const n = Number(match[0]);
		if (!Number.isFinite(n)) fail('Number out of range');
		return n;
	}

	function readValue(depth: number): unknown {
		if (depth > MAX_DEPTH) fail('Nested too deeply');
		skipTrivia();
		const c = source.at(i);
		if (c === '{') return readObject(depth);
		if (c === '[') return readArray(depth);
		if (c === "'" || c === '"') return readString();
		if (c === undefined) return fail('Unexpected end of input');
		if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return readNumber();
		if (IDENT_START.test(c)) return readKeyword();
		return fail('Unexpected character');
	}

	/** `true`, `false` or `null`: the only identifiers that are data. */
	function readKeyword(): boolean | null {
		const word = readIdentifier();
		if (word === 'true') return true;
		if (word === 'false') return false;
		if (word === 'null') return null;
		i -= word.length;
		return fail(`Identifier "${word}" is not a literal`);
	}

	function readObject(depth: number): Record<string, unknown> {
		i++; // {
		const out: Record<string, unknown> = {};
		for (;;) {
			skipTrivia();
			if (source[i] === '}') {
				i++;
				return out;
			}
			const c = source.at(i);
			let key: string;
			if (c === "'" || c === '"') key = readString();
			else if (c !== undefined && IDENT_START.test(c)) key = readIdentifier();
			else return fail('Expected a property name');
			if (key === '__proto__') fail('"__proto__" is not allowed');
			skipTrivia();
			// A getter, method, shorthand member or computed key all stop here
			if (source[i] !== ':') fail('Expected ":" after a property name');
			i++;
			out[key] = readValue(depth + 1);
			skipTrivia();
			if (source[i] === ',') i++;
			else if (source[i] !== '}') fail('Expected "," or "}"');
		}
	}

	function readArray(depth: number): unknown[] {
		i++; // [
		const out: unknown[] = [];
		for (;;) {
			skipTrivia();
			if (source[i] === ']') {
				i++;
				return out;
			}
			if (source[i] === ',') fail('Array holes are not allowed');
			out.push(readValue(depth + 1));
			skipTrivia();
			if (source[i] === ',') i++;
			else if (source[i] !== ']') fail('Expected "," or "]"');
		}
	}

	/**
	 * `statement`: the literal is a whole initializer. Without this a value such as
	 * `[1].concat(window.x)` would read as `[1]` and silently drop the part that makes it code.
	 * What follows must end the declaration: end of input, `;`, `,`, or a line break before
	 * something that starts a new statement.
	 */
	function requireStatementEnd(): void {
		const literalEnd = i;
		const sawLineBreak = skipTrivia();
		const c = source.at(i);
		const ends =
			c === undefined ||
			c === ';' ||
			c === ',' ||
			(sawLineBreak && !CONTINUES_EXPRESSION.test(source.slice(i, i + 12)));
		if (!ends) fail('Expected the end of the declaration after the literal');
		i = literalEnd;
	}

	const value = readValue(0);
	if (options.statement) requireStatementEnd();
	return { value, end: i };
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One forward pass over `script` that records the `[start, end)` ranges holding a block comment,
 * a line comment or a string / template literal. Regex literals and `${}` nesting are not
 * parsed: a template literal is taken to run to its closing unescaped backtick, and a quote
 * inside a regex literal can open a string that is cut off again at the end of its line (only
 * a template literal may span lines).
 */
function findNonCodeRanges(script: string): [number, number][] {
	const ranges: [number, number][] = [];
	let i = 0;
	while (i < script.length) {
		const c = script[i];
		const start = i;
		if (c === '/' && script[i + 1] === '/') {
			while (i < script.length && !LINE_BREAK.test(script[i])) i++;
		} else if (c === '/' && script[i + 1] === '*') {
			const close = script.indexOf('*/', i + 2);
			i = close === -1 ? script.length : close + 2;
		} else if (c === "'" || c === '"' || c === '`') {
			i = quotedEnd(script, i);
		} else {
			i++;
			continue;
		}
		ranges.push([start, i]);
	}
	return ranges;
}

/** The index just past the string or template literal that opens at `open`. */
function quotedEnd(script: string, open: number): number {
	const quote = script[open];
	let i = open + 1;
	while (i < script.length && script[i] !== quote) {
		if (script[i] === '\\') i++;
		else if (quote !== '`' && LINE_BREAK.test(script[i])) break;
		i++;
	}
	return Math.min(i + 1, script.length);
}

/**
 * Find `let|const|var <name> = <literal>` at the start of a line in `script` and return the
 * literal's value; `undefined` when the script has no real such declaration. A match inside a
 * block comment, a `//` comment or a string / template literal is skipped. The first real
 * match wins: if its value is not a pure literal this throws `JsLiteralError` rather than
 * falling through to a later declaration. Whatever follows the literal (the legacy DOM code)
 * is never read.
 */
export function extractDeclaredLiteral(script: string, name: string): unknown {
	const declaration = new RegExp(
		`^[ \\t]*(?:let|const|var)[ \\t]+${escapeRegExp(name)}[ \\t]*=`,
		'gm'
	);
	let ranges: [number, number][] | undefined;
	for (let match = declaration.exec(script); match; match = declaration.exec(script)) {
		const keyword = match.index + match[0].search(/\S/);
		ranges ??= findNonCodeRanges(script);
		if (ranges.some(([from, to]) => keyword >= from && keyword < to)) continue;
		return readJsLiteral(script, match.index + match[0].length, { statement: true }).value;
	}
	return undefined;
}

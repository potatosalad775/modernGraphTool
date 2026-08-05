/**
 * Minimal allowlist HTML sanitizer for operator-authored strings.
 *
 * `phone_book.json` descriptions are hand-written by whoever runs the database,
 * so they are not hostile input in the usual sense — but they are fetched at
 * runtime from a plain JSON file, and rendering them through `{@html}` means a
 * mirrored or user-supplied book would otherwise reach the DOM verbatim. This
 * keeps the useful part (a link, some emphasis) and drops everything else.
 *
 * Deliberately hand-rolled rather than DOMPurify-backed: the allowlist is a
 * dozen inline tags, the output has to be identical in the browser and in the
 * node test project (no DOM), and it saves a runtime dependency on a static
 * site that operators self-host.
 *
 * The output is well-formed — unclosed tags are closed, stray close tags are
 * dropped — so `{@html}` can never leak markup into the surrounding row.
 */

/** Tag → attributes kept on it. Everything here is inline-level on purpose:
 *  descriptions render inside a `<button>`, where block content is invalid. */
const ALLOWED_TAGS = new Map<string, readonly string[]>([
	['a', ['href', 'title']],
	['abbr', ['title']],
	['b', []],
	['br', []],
	['code', []],
	['del', []],
	['em', []],
	['i', []],
	['ins', []],
	['kbd', []],
	['mark', []],
	['s', []],
	['small', []],
	['span', ['title']],
	['strong', []],
	['sub', []],
	['sup', []],
	['u', []],
	['wbr', []]
]);

const VOID_TAGS = new Set(['br', 'wbr']);

/** Tags dropped *with their content* — unwrapping these would surface script
 *  or style source as visible text. Everything else outside the allowlist is
 *  unwrapped instead, so `<div>text</div>` keeps `text`. */
const OPAQUE_TAGS = new Set([
	'script',
	'style',
	'noscript',
	'template',
	'iframe',
	'frame',
	'frameset',
	'object',
	'embed',
	'applet',
	'svg',
	'math',
	'title',
	'textarea'
]);

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Enough of the entity table to defeat scheme obfuscation (`java&#115;cript:`,
 *  `javascript&colon;`) and to round-trip the common text entities. */
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	colon: ':',
	sol: '/',
	tab: '\t',
	newline: '\n',
	lpar: '(',
	rpar: ')'
};

function decodeEntities(input: string): string {
	return input.replace(
		/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g,
		(whole, body: string) => {
			if (body[0] === '#') {
				const code =
					body[1] === 'x' || body[1] === 'X'
						? Number.parseInt(body.slice(2), 16)
						: Number.parseInt(body.slice(1), 10);
				if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
				try {
					return String.fromCodePoint(code);
				} catch {
					return whole;
				}
			}
			return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
		}
	);
}

/** Escape text content. A bare `&` is escaped but an author-written entity
 *  (`&amp;`, `&#8212;`) is left alone, so both `B&K 5128` and `B&amp;K 5128`
 *  render as the operator meant them to. */
function escapeText(input: string): string {
	return input
		.replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#[xX][0-9a-fA-F]+;)/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Attribute values are decoded before validation, so they are re-escaped in
 *  full — including `>`, which is what lets `stripHtml` strip tags with a
 *  regex without an attribute value ever terminating one early. */
function escapeAttr(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Validate a URL for use in an `href`. Returns the cleaned URL, or `null` when
 * the scheme is not one a link may safely carry (`javascript:`, `data:`, …).
 *
 * Relative URLs, fragments and protocol-relative URLs pass through — they
 * resolve against the deployment's own origin or inherit its scheme.
 */
export function sanitizeUrl(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// Control characters and whitespace are ignored by URL parsers, so they have
	// to go before the scheme is read — `java\nscript:` is a working URL.
	const cleaned = decodeEntities(String(raw))
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u0020\u007f]/g, '')
		.trim();
	if (!cleaned) return null;
	const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
	if (!scheme) return cleaned;
	return SAFE_SCHEMES.has(scheme[1].toLowerCase()) ? cleaned : null;
}

interface ParsedTag {
	name: string;
	closing: boolean;
	attrs: string;
	/** Index just past the closing `>`. */
	end: number;
}

/** Read a start/end tag at `at` (which must point at a `<`). Returns `null`
 *  when what follows is not a tag name, so the `<` is emitted as text. */
function matchTag(src: string, at: number): ParsedTag | null {
	let i = at + 1;
	const closing = src[i] === '/';
	if (closing) i++;
	const nameStart = i;
	while (i < src.length && /[a-zA-Z0-9-]/.test(src[i])) i++;
	if (i === nameStart || !/[a-zA-Z]/.test(src[nameStart])) return null;
	const name = src.slice(nameStart, i).toLowerCase();

	// Scan to the closing `>`, skipping over quoted attribute values so a `>`
	// inside one does not end the tag early.
	const attrStart = i;
	let quote: string | null = null;
	while (i < src.length) {
		const c = src[i];
		if (quote) {
			if (c === quote) quote = null;
		} else if (c === '"' || c === "'") {
			quote = c;
		} else if (c === '>') {
			break;
		}
		i++;
	}
	if (i >= src.length) return null; // unterminated tag — treat as text
	return { name, closing, attrs: src.slice(attrStart, i), end: i + 1 };
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function unquote(value: string | undefined): string {
	if (value === undefined) return '';
	const first = value[0];
	if ((first === '"' || first === "'") && value.endsWith(first) && value.length >= 2) {
		return value.slice(1, -1);
	}
	return value;
}

function buildAttrs(name: string, rawAttrs: string, allowed: readonly string[]): string {
	if (allowed.length === 0) return '';
	const kept: string[] = [];
	let href: string | null = null;

	ATTR_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ATTR_RE.exec(rawAttrs)) !== null) {
		const attr = match[1].toLowerCase();
		if (!allowed.includes(attr)) continue;
		const value = decodeEntities(unquote(match[2]));
		if (attr === 'href') {
			href = sanitizeUrl(value);
			continue;
		}
		if (!value) continue;
		kept.push(`${attr}="${escapeAttr(value)}"`);
	}

	// An anchor whose href did not survive validation stays in the output as an
	// inert `<a>` — the text is preserved and nothing is clickable, which beats
	// unwrapping it (that would need a matching drop of its close tag).
	if (name === 'a' && href) {
		kept.unshift(`href="${escapeAttr(href)}"`);
		kept.push('target="_blank"', 'rel="external noopener noreferrer"');
	}

	return kept.length ? ' ' + kept.join(' ') : '';
}

/**
 * Sanitize operator-authored HTML down to the inline allowlist above.
 *
 * Unknown tags are unwrapped (content kept), `OPAQUE_TAGS` are dropped whole,
 * comments and doctypes are removed, and the tag stack is balanced on the way
 * out. Safe to hand to `{@html}`.
 */
export function sanitizeHtml(input: string | null | undefined): string {
	if (!input) return '';
	const src = String(input);
	let out = '';
	const open: string[] = [];
	let i = 0;

	while (i < src.length) {
		const lt = src.indexOf('<', i);
		if (lt === -1) {
			out += escapeText(src.slice(i));
			break;
		}
		out += escapeText(src.slice(i, lt));

		// Comments, doctypes and processing instructions carry no text worth
		// keeping, and a bogus comment can hide markup from a naive scan.
		if (src.startsWith('<!--', lt)) {
			const end = src.indexOf('-->', lt + 4);
			i = end === -1 ? src.length : end + 3;
			continue;
		}
		if (src[lt + 1] === '!' || src[lt + 1] === '?') {
			const end = src.indexOf('>', lt);
			i = end === -1 ? src.length : end + 1;
			continue;
		}

		const tag = matchTag(src, lt);
		if (!tag) {
			out += '&lt;';
			i = lt + 1;
			continue;
		}
		i = tag.end;

		if (OPAQUE_TAGS.has(tag.name)) {
			if (!tag.closing) {
				// Skip to the matching close tag. `tag.name` came out of the
				// [a-zA-Z0-9-] scan above, so it is safe to splice into a pattern.
				const close = new RegExp(`</\\s*${tag.name}\\b[^>]*>`, 'i').exec(src.slice(i));
				i = close ? i + close.index + close[0].length : src.length;
			}
			continue;
		}

		const allowed = ALLOWED_TAGS.get(tag.name);
		if (!allowed) continue; // unwrap: drop the tag, keep whatever it contained

		if (tag.closing) {
			const depth = open.lastIndexOf(tag.name);
			if (depth === -1) continue; // stray close tag
			while (open.length > depth) out += `</${open.pop()}>`;
			continue;
		}

		out += `<${tag.name}${buildAttrs(tag.name, tag.attrs, allowed)}>`;
		if (!VOID_TAGS.has(tag.name)) open.push(tag.name);
	}

	while (open.length) out += `</${open.pop()}>`;
	return out;
}

/**
 * Flatten the same input to plain text — for `title` attributes and anywhere
 * else markup would show up as literal angle brackets.
 *
 * Runs through `sanitizeHtml` first so the tag-stripping regex only ever meets
 * well-formed tags with fully escaped attribute values.
 */
export function stripHtml(input: string | null | undefined): string {
	if (!input) return '';
	return decodeEntities(
		sanitizeHtml(input)
			.replace(/<(?:br|wbr)\s*\/?>/gi, ' ')
			.replace(/<[^>]*>/g, '')
	)
		.replace(/\s+/g, ' ')
		.trim();
}

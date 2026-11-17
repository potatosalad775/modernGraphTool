/**
 * The light palette from the loaded `theme.css`, for the PNG export.
 *
 * The export always renders in light mode, whatever the page is showing. `.dark` sits on `<html>`
 * and custom properties inherit, so no element under it can be asked "what would you be in light
 * mode?" - the values have to come from the rules themselves. This reads the declarations of the
 * `:root` rules out of `document.styleSheets` (the stylesheet is same-origin on both the static and
 * the CDN build: `theme.css` is a relative link next to `index.html`), which is synchronous and
 * never touches the live theme, so there is no flash and no `.dark` toggle for observers to see.
 *
 * `FALLBACK_LIGHT_THEME` is the shipped light palette. It fills any token the stylesheet does not
 * declare, and stands in whole when no stylesheet can be read (a cross-origin sheet throws on
 * `cssRules`, and so does a sheet that has not loaded yet).
 */

export const FALLBACK_LIGHT_THEME: Readonly<Record<string, string>> = {
	'--color-graph-grid-major': 'rgba(0, 0, 0, 0.15)',
	'--color-graph-grid-minor': 'rgba(0, 0, 0, 0.06)',
	'--color-graph-axis-label': 'rgba(0, 0, 0, 0.7)',
	'--color-graph-grid-text': 'rgba(0, 0, 0, 0.58)',
	'--color-graph-baseline': 'rgba(0, 0, 0, 0.25)',
	'--color-graph-compare': 'rgba(0, 0, 0, 0.55)',
	'--color-graph-bg': 'transparent',
	'--color-base-100': 'oklch(98% 0.003 247.858)',
	'--color-base-200': 'oklch(96% 0.007 247.896)',
	'--color-base-content': 'oklch(17% 0.042 265.755)'
};

const WHITE = '#ffffff';

/** Only these selectors carry the light values; `.dark`, media queries and the like do not. */
function isRootSelector(selectorText: string): boolean {
	return selectorText.split(',').some((s) => {
		const sel = s.trim();
		return sel === ':root' || sel === 'html';
	});
}

interface Declarations {
	layered: Map<string, string>;
	unlayered: Map<string, string>;
}

// Duck-typed on purpose: the CSSOM classes are not there under node, and the specs pass fakes.
type RuleLike = {
	selectorText?: string;
	style?: CSSStyleDeclaration;
	styleSheet?: SheetLike | null;
	cssRules?: ArrayLike<RuleLike>;
	constructor?: { name?: string };
};
type SheetLike = { cssRules: ArrayLike<RuleLike> };

function collect(sheet: SheetLike, into: Declarations, layered: boolean, depth: number): void {
	if (depth > 8) return;
	let rules: ArrayLike<RuleLike>;
	try {
		rules = sheet.cssRules;
	} catch {
		return; // cross-origin, or not loaded yet
	}
	for (const rule of Array.from(rules)) {
		if (rule.styleSheet) {
			collect(rule.styleSheet, into, layered, depth + 1); // @import
		} else if (rule.constructor?.name === 'CSSLayerBlockRule' && rule.cssRules) {
			collect({ cssRules: rule.cssRules }, into, true, depth + 1);
		} else if (rule.selectorText !== undefined && rule.style && isRootSelector(rule.selectorText)) {
			const target = layered ? into.layered : into.unlayered;
			for (let i = 0; i < rule.style.length; i++) {
				const name = rule.style[i];
				if (!name.startsWith('--color-')) continue;
				const value = rule.style.getPropertyValue(name).trim();
				if (value) target.set(name, value);
			}
		}
	}
}

const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g;

/**
 * Replace `var(--x)` with the other collected values. A reference cannot be left in: the value ends
 * up on an element under `.dark`, where it would resolve to the dark palette. Returns null when a
 * reference has no value (or loops), so the caller falls back to the shipped value.
 */
function substitute(
	name: string,
	vars: Map<string, string>,
	seen: Set<string> = new Set()
): string | null {
	const raw = vars.get(name);
	if (raw === undefined || seen.has(name)) return null;
	seen.add(name);
	let ok = true;
	const out = raw.replace(VAR_RE, (_, ref: string, fallback?: string) => {
		const inner = substitute(ref, vars, new Set(seen));
		if (inner !== null) return inner;
		if (fallback !== undefined) return fallback.trim();
		ok = false;
		return '';
	});
	return ok ? out : null;
}

/** The `--color-*` declarations of the `:root` rules in `sheets`, with `var()` resolved. */
export function readLightThemeVars(
	sheets: ArrayLike<SheetLike> = typeof document === 'undefined'
		? []
		: (document.styleSheets as unknown as ArrayLike<SheetLike>)
): Record<string, string> {
	const found: Declarations = { layered: new Map(), unlayered: new Map() };
	for (const sheet of Array.from(sheets)) collect(sheet, found, false, 0);

	// Unlayered rules beat layered ones whatever the source order (Tailwind's `@layer theme`
	// carries `--color-x: var(--color-x)` stubs that must never win over theme.css).
	const merged = new Map([...found.layered, ...found.unlayered]);
	const result: Record<string, string> = {};
	for (const name of merged.keys()) {
		const value = substitute(name, merged);
		if (value) result[name] = value;
	}
	return result;
}

/** The light palette for the export: the stylesheet's values over the shipped ones. */
export function resolveLightTheme(sheets?: ArrayLike<SheetLike>): Record<string, string> {
	return { ...FALLBACK_LIGHT_THEME, ...readLightThemeVars(sheets) };
}

/** True for `transparent` and for a colour whose alpha is 0. */
export function isTransparentColor(value: string): boolean {
	const v = value.trim().toLowerCase();
	if (v === '' || v === 'transparent') return true;
	if (/^#([0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(v)) return true;
	if (/^(rgb|hsl)a\(.*,\s*0(\.0+)?\s*\)$/.test(v)) return true;
	return /\/\s*0(\.0+)?%?\s*\)$/.test(v);
}

/**
 * Fills painted behind the exported graph, bottom first. Always pure white, as before, so a
 * theme without a `--color-graph-bg` exports exactly what it did; a light theme that sets one
 * paints it on top of the white, so a translucent value cannot leave holes in the PNG.
 */
export function exportBackgroundFills(vars: Record<string, string>): string[] {
	const bg = vars['--color-graph-bg'];
	return bg && !isTransparentColor(bg) ? [WHITE, bg] : [WHITE];
}

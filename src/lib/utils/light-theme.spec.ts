import { describe, expect, it } from 'vitest';
import {
	FALLBACK_LIGHT_THEME,
	exportBackgroundFills,
	isTransparentColor,
	readLightThemeVars,
	resolveLightTheme
} from './light-theme.js';

function style(decls: Record<string, string>) {
	const names = Object.keys(decls);
	return Object.assign(names.slice(), {
		length: names.length,
		getPropertyValue: (n: string) => decls[n] ?? ''
	}) as unknown as CSSStyleDeclaration;
}
const rule = (selectorText: string, decls: Record<string, string>) => ({
	selectorText,
	style: style(decls)
});
// Named like the real class: the reader tells `@layer` blocks apart by it.
class CSSLayerBlockRule {
	cssRules: unknown[];
	constructor(rules: unknown[]) {
		this.cssRules = rules;
	}
}
const sheet = (...rules: unknown[]) => ({ cssRules: rules });

describe('readLightThemeVars', () => {
	it('reads :root declarations and ignores .dark', () => {
		const vars = readLightThemeVars([
			sheet(
				rule(':root', { '--color-base-100': 'oklch(99% 0 0)', '--other': 'x' }),
				rule('.dark', { '--color-base-100': 'oklch(30% 0 0)' })
			)
		] as never);
		expect(vars).toEqual({ '--color-base-100': 'oklch(99% 0 0)' });
	});

	it('lets a later rule win and accepts a selector list', () => {
		const vars = readLightThemeVars([
			sheet(
				rule(':root', { '--color-base-200': 'red' }),
				rule(':root, :host', { '--color-base-200': 'blue' })
			)
		] as never);
		expect(vars['--color-base-200']).toBe('blue');
	});

	it('skips a sheet whose cssRules throws (cross-origin)', () => {
		const blocked = {
			get cssRules(): never {
				throw new DOMException('blocked', 'SecurityError');
			}
		};
		const vars = readLightThemeVars([
			blocked,
			sheet(rule(':root', { '--color-base-content': 'black' }))
		] as never);
		expect(vars).toEqual({ '--color-base-content': 'black' });
	});

	it('follows @import', () => {
		const inner = sheet(rule(':root', { '--color-base-100': 'white' }));
		const vars = readLightThemeVars([sheet({ styleSheet: inner })] as never);
		expect(vars['--color-base-100']).toBe('white');
	});

	it('prefers unlayered over layered, and drops a self-referencing stub', () => {
		const layered = new CSSLayerBlockRule([
			rule(':root, :host', {
				'--color-base-100': 'var(--color-base-100)',
				'--color-base-200': 'var(--color-base-200)'
			})
		]);
		const vars = readLightThemeVars([
			sheet(layered),
			sheet(rule(':root', { '--color-base-100': 'ivory' }))
		] as never);
		expect(vars).toEqual({ '--color-base-100': 'ivory' });
	});

	it('resolves var() against the collected values, with fallbacks', () => {
		const vars = readLightThemeVars([
			sheet(
				rule(':root', {
					'--color-base-100': 'oklch(99% 0 0)',
					'--color-graph-bg': 'var(--color-base-100)',
					'--color-graph-compare': 'var(--color-missing, rgba(0, 0, 0, 0.5))',
					'--color-graph-baseline': 'var(--color-missing)'
				})
			)
		] as never);
		expect(vars['--color-graph-bg']).toBe('oklch(99% 0 0)');
		expect(vars['--color-graph-compare']).toBe('rgba(0, 0, 0, 0.5)');
		expect(vars['--color-graph-baseline']).toBeUndefined();
	});

	it('returns nothing when there is no document', () => {
		expect(readLightThemeVars([])).toEqual({});
	});
});

describe('resolveLightTheme', () => {
	it('is the shipped palette when no stylesheet declares anything', () => {
		expect(resolveLightTheme([])).toEqual(FALLBACK_LIGHT_THEME);
	});

	it('lets theme.css override the shipped values and keeps the rest', () => {
		const vars = resolveLightTheme([
			sheet(rule(':root', { '--color-graph-grid-major': 'rgba(10, 20, 30, 0.2)' }))
		] as never);
		expect(vars['--color-graph-grid-major']).toBe('rgba(10, 20, 30, 0.2)');
		expect(vars['--color-graph-grid-minor']).toBe(FALLBACK_LIGHT_THEME['--color-graph-grid-minor']);
	});
});

describe('export background', () => {
	it('recognises transparent colours', () => {
		for (const c of ['transparent', 'rgba(0, 0, 0, 0)', 'oklch(50% 0.1 20 / 0)', '#00000000']) {
			expect(isTransparentColor(c)).toBe(true);
		}
		for (const c of ['#fff', 'rgba(0, 0, 0, 0.5)', 'oklch(98% 0.003 247.858)']) {
			expect(isTransparentColor(c)).toBe(false);
		}
	});

	it('is plain white for the shipped theme', () => {
		expect(exportBackgroundFills(FALLBACK_LIGHT_THEME as Record<string, string>)).toEqual([
			'#ffffff'
		]);
	});

	it('paints a theme-set graph background over the white', () => {
		expect(exportBackgroundFills({ '--color-graph-bg': 'rgba(255, 240, 200, 0.5)' })).toEqual([
			'#ffffff',
			'rgba(255, 240, 200, 0.5)'
		]);
	});
});

import { describe, it, expect } from 'vitest';
import { resolveI18nValue, getNestedValue } from './config.js';

describe('resolveI18nValue', () => {
	it('returns plain string as-is', () => {
		expect(resolveI18nValue('hello', 'en')).toBe('hello');
	});

	it('returns plain number as-is', () => {
		expect(resolveI18nValue(42, 'en')).toBe(42);
	});

	it('returns plain array as-is', () => {
		const arr = [1, 2, 3];
		expect(resolveI18nValue(arr, 'en')).toEqual([1, 2, 3]);
	});

	it('returns default when i18n has no matching lang', () => {
		const value = { default: 'English', i18n: { ko: '한국어' } };
		expect(resolveI18nValue(value, 'ja')).toBe('English');
	});

	it('returns localized value when lang matches', () => {
		const value = { default: 'English', i18n: { ko: '한국어' } };
		expect(resolveI18nValue(value, 'ko')).toBe('한국어');
	});

	it('merges array items by index when both default and localized are arrays of objects', () => {
		const value = {
			default: [
				{ name: 'Item A', files: ['a.txt'] },
				{ name: 'Item B', files: ['b.txt'] }
			],
			i18n: {
				ko: [{ name: '항목 A' }, { name: '항목 B' }]
			}
		};
		const result = resolveI18nValue(value, 'ko') as Array<{ name: string; files?: string[] }>;
		expect(result[0].name).toBe('항목 A');
		expect(result[0].files).toEqual(['a.txt']); // preserved from default
		expect(result[1].name).toBe('항목 B');
		expect(result[1].files).toEqual(['b.txt']); // preserved from default
	});

	it('localized array item completely overrides non-object entries', () => {
		const value = {
			default: ['alpha', 'beta'],
			i18n: { ko: ['가', '나'] }
		};
		const result = resolveI18nValue(value, 'ko');
		expect(result).toEqual(['가', '나']);
	});

	it('handles shorter localized array than default', () => {
		const value = {
			default: [
				{ name: 'A', files: ['a.txt'] },
				{ name: 'B', files: ['b.txt'] }
			],
			i18n: {
				ko: [{ name: '가' }]
			}
		};
		const result = resolveI18nValue(value, 'ko') as Array<{ name: string; files?: string[] }>;
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('가');
		expect(result[0].files).toEqual(['a.txt']);
	});

	it('returns null as plain value', () => {
		expect(resolveI18nValue(null, 'en')).toBeNull();
	});

	it('returns boolean as plain value', () => {
		expect(resolveI18nValue(true, 'en')).toBe(true);
	});
});

describe('getNestedValue', () => {
	it('resolves single-level path', () => {
		expect(getNestedValue({ foo: 1 }, 'foo')).toBe(1);
	});

	it('resolves multi-level path', () => {
		expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
	});

	it('returns undefined for missing path', () => {
		expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.x')).toBeUndefined();
	});

	it('returns undefined for empty object', () => {
		expect(getNestedValue({}, 'a.b')).toBeUndefined();
	});

	it('handles path through null intermediate', () => {
		expect(getNestedValue({ a: null }, 'a.b')).toBeUndefined();
	});
});

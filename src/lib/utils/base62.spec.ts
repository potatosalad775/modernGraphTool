import { describe, it, expect } from 'vitest';
import Base62 from './base62.js';

describe('Base62', () => {
	describe('encode', () => {
		it('returns "0" for an empty string', () => {
			expect(Base62.encode('')).toBe('0');
		});

		it('encodes a single character', () => {
			const encoded = Base62.encode('A');
			expect(encoded).toBeTruthy();
			expect(typeof encoded).toBe('string');
		});

		it('encodes a simple ASCII string', () => {
			const encoded = Base62.encode('hello');
			expect(encoded).toBeTruthy();
			expect(encoded.length).toBeGreaterThan(0);
		});

		it('only uses Base62 charset characters', () => {
			const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
			const encoded = Base62.encode('test string with spaces!');
			for (const ch of encoded) {
				expect(charset).toContain(ch);
			}
		});
	});

	describe('decode', () => {
		it('decodes back to the original string', () => {
			const original = 'hello';
			const encoded = Base62.encode(original);
			expect(Base62.decode(encoded)).toBe(original);
		});
	});

	describe('roundtrip', () => {
		it('roundtrips a simple word', () => {
			const input = 'world';
			expect(Base62.decode(Base62.encode(input))).toBe(input);
		});

		it('roundtrips a string with special characters', () => {
			const input = 'Hello, World! @#$%';
			expect(Base62.decode(Base62.encode(input))).toBe(input);
		});

		it('roundtrips a URL-like string', () => {
			const input = 'phone=SonyWF-1000XM5&target=Harman2019';
			expect(Base62.decode(Base62.encode(input))).toBe(input);
		});

		it('roundtrips unicode text', () => {
			const input = '한국어 테스트';
			expect(Base62.decode(Base62.encode(input))).toBe(input);
		});

		it('roundtrips a long string', () => {
			const input = 'a'.repeat(500);
			expect(Base62.decode(Base62.encode(input))).toBe(input);
		});

		it('produces different encodings for different inputs', () => {
			const a = Base62.encode('abc');
			const b = Base62.encode('xyz');
			expect(a).not.toBe(b);
		});
	});
});

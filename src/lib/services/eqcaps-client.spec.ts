import { describe, it, expect, beforeEach, vi } from 'vitest';

const created = vi.hoisted(() => [] as { baseUrl?: string }[]);
vi.mock('@potatosalad775/eqcaps-client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@potatosalad775/eqcaps-client')>();
	return {
		...actual,
		createClient: (options: { baseUrl?: string }) => {
			created.push(options);
			return actual.createClient(options);
		}
	};
});

const config = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('$lib/utils/config.js', () => ({ getConfigValue: () => config.value }));

const { eqcapsClient, resetEqcapsClient } = await import('./eqcaps-client.js');
const { V1_URL } = await import('@potatosalad775/eqcaps-client');

describe('eqcapsClient', () => {
	beforeEach(() => {
		created.length = 0;
		config.value = undefined;
		resetEqcapsClient();
	});

	it('defaults to the format’s /v1/ channel and is a singleton', () => {
		expect(eqcapsClient()).toBe(eqcapsClient());
		expect(created).toHaveLength(1);
		expect(created[0].baseUrl).toBe(V1_URL);
	});

	it('takes a mirror from EQUALIZER.EQCAPS_URL, with a trailing slash', () => {
		config.value = ' https://mirror.example/eqcaps/v1 ';
		eqcapsClient();
		expect(created[0].baseUrl).toBe('https://mirror.example/eqcaps/v1/');
	});

	it('ignores a blank or non-string setting', () => {
		config.value = '  ';
		eqcapsClient();
		resetEqcapsClient();
		config.value = 42;
		eqcapsClient();
		expect(created.map((c) => c.baseUrl)).toEqual([V1_URL, V1_URL]);
	});
});

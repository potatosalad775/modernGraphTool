import { describe, it, expect, vi, afterEach } from 'vitest';
import { getHidConfig, getSerialConfig, getBleConfig, getNetworkHandlers } from './registry.js';
import type { DeviceHandler } from './types.js';

/**
 * The registry is where "add one import line to add a device" goes wrong
 * quietly: an unresolved `handlerRef` only surfaces as a console.warn at
 * runtime, and a duplicated vendor/product pair makes one device shadow
 * another during connector matching. Both are cheap to assert statically.
 */

const HANDLER_METHODS = ['getCurrentSlot', 'pullFromDevice', 'pushToDevice', 'enablePEQ'] as const;

function isHandler(value: unknown): value is DeviceHandler {
	return (
		!!value &&
		typeof value === 'object' &&
		HANDLER_METHODS.every((m) => typeof (value as Record<string, unknown>)[m] === 'function')
	);
}

describe('device-peq registry', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('HID config', () => {
		it('resolves every handlerRef — the console.warn path must never fire', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			// Bypass the module-level cache by asserting on a fresh resolution
			// alongside the warning spy; a stale cache would still expose an
			// unresolved entry below.
			const configs = await getHidConfig();

			const unresolved: string[] = [];
			for (const config of configs) {
				for (const [name, entry] of Object.entries(config.devices)) {
					if (entry.handlerRef && !entry.handler) unresolved.push(`${config.manufacturer}/${name}`);
				}
			}

			expect(unresolved).toEqual([]);
			expect(warn.mock.calls.filter((c) => String(c[0]).includes('unresolved handlerRef'))).toEqual(
				[]
			);
		});

		it('gives every device entry a usable handler', async () => {
			const configs = await getHidConfig();

			for (const config of configs) {
				expect(isHandler(config.handler)).toBe(true);
				for (const [name, entry] of Object.entries(config.devices)) {
					const handler = entry.handler ?? config.handler;
					expect(isHandler(handler), `${config.manufacturer}/${name}`).toBe(true);
				}
			}
		});

		it('declares at least one vendor ID per config', async () => {
			const configs = await getHidConfig();
			for (const config of configs) {
				expect(config.vendorIds.length, config.manufacturer).toBeGreaterThan(0);
			}
		});

		it('does not claim the same vendor ID from two configs', async () => {
			const configs = await getHidConfig();
			const owners = new Map<number, string>();
			const clashes: string[] = [];

			for (const config of configs) {
				for (const vendorId of config.vendorIds) {
					const existing = owners.get(vendorId);
					if (existing) {
						clashes.push(`0x${vendorId.toString(16)}: ${existing} vs ${config.manufacturer}`);
					} else {
						owners.set(vendorId, config.manufacturer);
					}
				}
			}

			expect(clashes).toEqual([]);
		});

		it('does not list the same productId in two device groups of one config', async () => {
			const configs = await getHidConfig();
			const clashes: string[] = [];

			for (const config of configs) {
				const owners = new Map<number, string>();
				for (const [groupName, group] of Object.entries(config.deviceGroups ?? {})) {
					for (const productId of group.productIds) {
						const existing = owners.get(productId);
						if (existing) {
							clashes.push(
								`${config.manufacturer} 0x${productId.toString(16)}: ${existing} vs ${groupName}`
							);
						} else {
							owners.set(productId, groupName);
						}
					}
				}
			}

			expect(clashes).toEqual([]);
		});

		it('caches the resolved config', async () => {
			expect(await getHidConfig()).toBe(await getHidConfig());
		});
	});

	describe('serial config', () => {
		it('gives every vendor a usable handler', async () => {
			const configs = await getSerialConfig();
			expect(configs.length).toBeGreaterThan(0);

			for (const config of configs) {
				expect(isHandler(config.handler), config.manufacturer).toBe(true);
			}
		});

		it('does not claim the same vendorId/usbProductId pair twice', async () => {
			const configs = await getSerialConfig();
			const owners = new Map<string, string>();
			const clashes: string[] = [];

			for (const config of configs) {
				for (const [name, entry] of Object.entries(config.devices)) {
					if (config.vendorId == null || entry.usbProductId == null) continue;
					const key = `${config.vendorId}:${entry.usbProductId}`;
					const existing = owners.get(key);
					if (existing) clashes.push(`${key}: ${existing} vs ${config.manufacturer}/${name}`);
					else owners.set(key, `${config.manufacturer}/${name}`);
				}
			}

			expect(clashes).toEqual([]);
		});

		it('gives every device a model config with a sane filter budget', async () => {
			const configs = await getSerialConfig();

			for (const config of configs) {
				for (const [name, entry] of Object.entries(config.devices)) {
					expect(entry.modelConfig, `${config.manufacturer}/${name}`).toBeDefined();
					expect(entry.modelConfig.maxFilters, `${config.manufacturer}/${name}`).toBeGreaterThan(0);
					expect(entry.modelConfig.minGain).toBeLessThan(entry.modelConfig.maxGain);
				}
			}
		});

		it('caches the resolved config', async () => {
			expect(await getSerialConfig()).toBe(await getSerialConfig());
		});
	});

	describe('BLE config', () => {
		it('gives every entry a handler and a complete GATT triple', async () => {
			const configs = await getBleConfig();
			expect(configs.length).toBeGreaterThan(0);

			for (const config of configs) {
				expect(isHandler(config.handler), config.manufacturer).toBe(true);
				expect(config.gatt.serviceUuid, config.manufacturer).toBeTruthy();
				expect(config.gatt.txCharacteristicUuid).toBeTruthy();
				expect(config.gatt.rxCharacteristicUuid).toBeTruthy();
			}
		});

		it('caches the resolved config', async () => {
			expect(await getBleConfig()).toBe(await getBleConfig());
		});
	});

	describe('network handlers', () => {
		it('keys each handler by its device type', async () => {
			const handlers = await getNetworkHandlers();
			expect(Object.keys(handlers).length).toBeGreaterThan(0);

			for (const [deviceType, entry] of Object.entries(handlers)) {
				expect(isHandler(entry.handler), deviceType).toBe(true);
				expect(entry.defaultModelConfig, deviceType).toBeDefined();
			}
		});

		it('caches the resolved handlers', async () => {
			expect(await getNetworkHandlers()).toBe(await getNetworkHandlers());
		});
	});
});

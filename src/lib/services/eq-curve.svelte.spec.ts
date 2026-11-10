import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eqCurve } from './eq-curve.svelte.js';
import { dataProvider } from './data-provider.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import type { Channel, FRDataObject, FRDataPoint } from '#lib/types/data-types.js';

/** Generate synthetic FR data points spanning 20–20kHz at 1/48-octave spacing */
function makeFRPoints(baseDb = 80, count = 480): FRDataPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const data: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		data.push([freq, baseDb + Math.sin(i * 0.1) * 3]);
		freq *= step;
	}
	return data;
}

function makeFRDataObject(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Brand Phone-${uuid}`,
		channels: {
			L: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } },
			R: { data: [[1000, 78]], metadata: { minFreq: 20, maxFreq: 20000 } },
			AVG: { data: [[1000, 79]], metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '1 0',
		...overrides
	};
}

describe('eqCurve', () => {
	beforeEach(() => {
		frStore.clear();
		commandHistory.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
	});

	// ── Per-channel EQ ───────────────────────────────────────────────────────

	describe('rebuild', () => {
		/** Flat 0 dB on every channel, so a band's effect is the whole reading. */
		function seedEqSource(): void {
			const flat = () => ({
				data: makeFRPoints(0).map(([f]) => [f, 0] as FRDataPoint),
				metadata: { minFreq: 20, maxFreq: 20000 }
			});
			frStore.set(
				'src',
				makeFRDataObject('src', {
					channels: { L: flat(), R: flat(), AVG: flat() },
					dispChannel: ['L', 'R']
				})
			);
			eqStore.sourcePhoneUUID = 'src';
			eqStore.isEnabled = true;
			eqStore.preamp = 0;
		}

		function band(gain: number, channel?: 'L' | 'R') {
			return {
				enabled: true,
				type: 'PK' as const,
				freq: 1000,
				q: 1,
				gain,
				...(channel ? { channel } : {})
			};
		}

		/** The EQ curve's dB at 1 kHz, per channel. */
		function eqDbAt1k(channel: Channel): number {
			const eqObj = frStore.get(eqStore.eqCurveUUID!)!;
			const raw = eqObj._rawData!.channels[channel]!.data;
			return raw.reduce((best, p) =>
				Math.abs(p[0] - 1000) < Math.abs(best[0] - 1000) ? p : best
			)[1];
		}

		beforeEach(() => {
			eqStore.filters = [];
			eqStore.preamp = 0;
			eqStore.isEnabled = false;
			eqStore.eqCurveUUID = null;
			eqStore.channelScope = 'BOTH';
			eqStore.eqModifiedData.clear();
			settingsStore.linkEqNormalization = true;
		});

		afterEach(() => {
			eqStore.filters = [];
			eqStore.isEnabled = false;
			eqStore.eqCurveUUID = null;
			eqStore.sourcePhoneUUID = null;
			eqStore.eqModifiedData.clear();
		});

		it('applies a shared band to both channels equally', () => {
			seedEqSource();
			eqStore.filters = [band(6)];

			eqCurve.rebuild();

			expect(eqDbAt1k('L')).toBeCloseTo(eqDbAt1k('R'), 6);
			expect(eqDbAt1k('L')).toBeGreaterThan(4);
		});

		it('applies a pinned band to its own ear only', () => {
			seedEqSource();
			eqStore.filters = [band(6, 'L')];

			eqCurve.rebuild();

			expect(eqDbAt1k('L')).toBeGreaterThan(4);
			expect(eqDbAt1k('R')).toBeCloseTo(0, 6);
		});

		it('gives each ear the shared bands plus its own', () => {
			seedEqSource();
			eqStore.filters = [band(3), band(3, 'L')];

			eqCurve.rebuild();

			// Left gets both bands, right only the shared one.
			expect(eqDbAt1k('L')).toBeGreaterThan(eqDbAt1k('R') + 2);
			expect(eqDbAt1k('R')).toBeGreaterThan(2);
		});

		// Without this the average silently ignores every single-ear correction,
		// so a user watching AVG sees no effect from half their EQ.
		it('recomputes AVG as the mean of the EQd channels when a band is pinned', () => {
			seedEqSource();
			eqStore.filters = [band(6, 'L')];

			eqCurve.rebuild();

			expect(eqDbAt1k('AVG')).toBeCloseTo((eqDbAt1k('L') + eqDbAt1k('R')) / 2, 6);
		});

		it('leaves AVG on the shared-band path when nothing is pinned', () => {
			seedEqSource();
			eqStore.filters = [band(6)];

			eqCurve.rebuild();

			// All three channels are the same flat source under the same bands.
			expect(eqDbAt1k('AVG')).toBeCloseTo(eqDbAt1k('L'), 6);
		});

		it('keeps a channel picked on the EQ curve across a filter edit', () => {
			seedEqSource();
			eqStore.filters = [band(6)];
			eqCurve.rebuild();
			const eqUUID = eqStore.eqCurveUUID!;
			expect(frStore.get(eqUUID)!.dispChannel).toEqual(['L', 'R']);

			dataProvider.updateDisplayChannel(eqUUID, ['R']);
			eqStore.filters = [band(3)];
			eqCurve.rebuild();

			expect(frStore.get(eqUUID)!.dispChannel).toEqual(['R']);
		});

		it('follows the source when the source channel changes', () => {
			seedEqSource();
			eqStore.filters = [band(6)];
			eqCurve.rebuild();
			const eqUUID = eqStore.eqCurveUUID!;
			dataProvider.updateDisplayChannel(eqUUID, ['R']);

			dataProvider.updateDisplayChannel('src', ['AVG']);
			eqCurve.rebuild();

			expect(frStore.get(eqUUID)!.dispChannel).toEqual(['AVG']);
		});

		describe('with a run as the source', () => {
			/** The flat source plus two runs at +3 / +6 dB, so each is identifiable. */
			function seedRuns(): void {
				seedEqSource();
				const at = (db: number) => ({
					data: makeFRPoints(0).map(([f]) => [f, db] as FRDataPoint),
					metadata: { minFreq: 20, maxFreq: 20000 }
				});
				const src = frStore.get('src')!;
				frStore.set('src', {
					...src,
					dispSuffix: 'Depths',
					samples: [
						{ label: 'Shallow', L: at(3), R: at(3), AVG: at(3) },
						{ label: 'Deep', L: at(6), R: at(6), AVG: at(6) }
					]
				});
			}

			afterEach(() => {
				eqStore.sourceSample = null;
			});

			it('EQs the picked run instead of the average', () => {
				seedRuns();
				eqStore.sourceSample = { index: 1, variant: 'Depths' };
				eqStore.filters = [band(6)];

				eqCurve.rebuild();

				// The run sits 6 dB up, the band adds roughly 6 more at 1 kHz.
				expect(eqDbAt1k('AVG')).toBeGreaterThan(10);
			});

			it('names the run in the EQ curve label', () => {
				seedRuns();
				eqStore.sourceSample = { index: 0, variant: 'Depths' };
				eqStore.filters = [band(6)];

				eqCurve.rebuild();
				expect(frStore.get(eqStore.eqCurveUUID!)!.dispSuffix).toBe('(EQ · Shallow)');

				eqStore.sourceSample = null;
				eqCurve.rebuild();
				expect(frStore.get(eqStore.eqCurveUUID!)!.dispSuffix).toBe('(EQ)');
			});

			it('falls back to the average once the source shows another variant', () => {
				seedRuns();
				eqStore.sourceSample = { index: 1, variant: 'Repeat Runs' };
				eqStore.filters = [band(6)];

				eqCurve.rebuild();

				expect(eqDbAt1k('AVG')).toBeLessThan(7);
				expect(frStore.get(eqStore.eqCurveUUID!)!.dispSuffix).toBe('(EQ)');
			});
		});

		describe('History & Compare: channelsFor / insertFrozen', () => {
			afterEach(() => {
				for (const [uuid, obj] of [...frStore.entries]) {
					if (obj.type === 'inserted-phone') frStore.delete(uuid);
				}
			});

			it('builds the same curve the live EQ would, without touching the stores', () => {
				seedEqSource();
				const filters = [band(6), band(-3, 'R')];
				const before = frStore.size;

				const built = eqCurve.channelsFor(filters)!;
				expect(frStore.size).toBe(before);
				expect(eqStore.eqCurveUUID).toBeNull();

				eqStore.filters = filters;
				eqCurve.rebuild();
				const live = frStore.get(eqStore.eqCurveUUID!)!;
				for (const ch of ['L', 'R', 'AVG'] as const) {
					expect(built.raw[ch]!.data).toEqual(live._rawData!.channels[ch]!.data);
					expect(built.processed[ch]!.data).toEqual(live.channels[ch]!.data);
				}
			});

			it('is null with no EQ source', () => {
				eqStore.sourcePhoneUUID = null;
				expect(eqCurve.channelsFor([band(6)])).toBeNull();
				expect(eqCurve.insertFrozen([band(6)], 'x')).toBe(false);
			});

			it('inserts a frozen curve named after the source and the entry', () => {
				seedEqSource();
				const source = frStore.get('src')!;

				expect(eqCurve.insertFrozen([band(6)], 'Bass-light v2')).toBe(true);

				const inserted = [...frStore.entries.values()].find((o) => o.type === 'inserted-phone')!;
				expect(inserted.identifier).toBe(source.identifier);
				expect(inserted.dispSuffix).toBe('(EQ · Bass-light v2)');
				expect(inserted.dispChannel).toEqual(['L', 'R']);
				const raw = inserted._rawData!.channels.L!.data;
				const at1k = raw.reduce((best, p) =>
					Math.abs(p[0] - 1000) < Math.abs(best[0] - 1000) ? p : best
				)[1];
				expect(at1k).toBeGreaterThan(4);
				// Frozen: the live EQ curve is not involved.
				expect(eqStore.eqCurveUUID).toBeNull();
			});

			describe('smoothing', () => {
				afterEach(() => {
					graphStore.smoothValue = '1/48';
				});

				/**
				 * The flat source, drawn at 0 dB (smoothed, as drawn channels are) but cached
				 * raw 10 dB up — so the two are told apart.
				 */
				function seedWithRawCache(): void {
					seedEqSource();
					const at = (db: number, smoothing?: string) => ({
						data: makeFRPoints(0).map(([f]) => [f, db] as FRDataPoint),
						metadata: { minFreq: 20, maxFreq: 20000, ...(smoothing && { smoothing }) }
					});
					frStore.set('src', {
						...frStore.get('src')!,
						channels: { L: at(0, '1/48'), R: at(0, '1/48'), AVG: at(0, '1/48') },
						_rawData: { channels: { L: at(10), R: at(10), AVG: at(10) } }
					});
				}

				// The drawn channels are already smoothed; freezing them as the inserted
				// curve's "raw" would smooth them a second time.
				it('freezes the source raw cache, not its drawn channels', () => {
					seedWithRawCache();
					eqCurve.insertFrozen([band(6)], 'x');

					const inserted = [...frStore.entries.values()].find((o) => o.type === 'inserted-phone')!;
					const raw = inserted._rawData!.channels.L!;
					expect(raw.metadata.smoothing).toBeUndefined();
					const at1k = raw.data.reduce((best, p) =>
						Math.abs(p[0] - 1000) < Math.abs(best[0] - 1000) ? p : best
					)[1];
					expect(at1k).toBeGreaterThan(14);
				});

				it('re-smooths a frozen curve when the smoothing changes', async () => {
					seedWithRawCache();
					eqCurve.insertFrozen([band(6)], 'x');

					graphStore.smoothValue = '1/3';
					await dataProvider.reSmoothAll();

					const inserted = [...frStore.entries.values()].find((o) => o.type === 'inserted-phone')!;
					expect(inserted.channels.L!.metadata.smoothing).toBe('1/3');
				});

				// Unlinked, the live curve used to go through reSmoothAll's own loop and be
				// re-smoothed from `_rawData` — the source's drawn, already-smoothed channels.
				it('rebuilds an unlinked live EQ curve from the source instead of re-smoothing it', async () => {
					settingsStore.linkEqNormalization = false;
					seedWithRawCache();
					eqStore.filters = [band(6)];
					eqCurve.rebuild();

					graphStore.smoothValue = '1/3';
					await expect(dataProvider.reSmoothAll()).resolves.toBeUndefined();

					const live = frStore.get(eqStore.eqCurveUUID!)!;
					expect(live.channels.L!.metadata.smoothing).toBe('1/3');
				});
			});
		});

		it('ignores per-channel bands on a source measured as a single curve', () => {
			const flat = {
				data: makeFRPoints(0).map(([f]) => [f, 0] as FRDataPoint),
				metadata: { minFreq: 20, maxFreq: 20000 }
			};
			frStore.set(
				'src',
				makeFRDataObject('src', { channels: { AVG: flat }, dispChannel: ['AVG'] })
			);
			eqStore.sourcePhoneUUID = 'src';
			eqStore.isEnabled = true;
			eqStore.filters = [band(6, 'L')];

			eqCurve.rebuild();

			// No L/R to bind the band to, so AVG keeps only the shared set (empty).
			expect(eqDbAt1k('AVG')).toBeCloseTo(0, 6);
		});
	});
});

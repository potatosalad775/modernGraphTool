import {
	isTargetType,
	type FRDataObject,
	type FRDataPoint,
	type SampleEnvelope
} from '#lib/types/data-types.js';
import { eqSourceChannels, eqSourceRun, type EqSourceSample } from '#lib/utils/eq-source.js';
import { curveBaseName, curveDisplayName, sampleKeyParts } from './curve-label.js';

/**
 * What a curve item puts on the graph.
 *
 * The engine (paths), the labels (rows) and the hover readout (rows) all need
 * the same answer to "which traces does this item draw?", and each used to work
 * it out on its own — and had drifted: the hover listed an average that was not
 * drawn, a ghosted run drawn with the average off got no label, and the engine
 * and the readers disagreed on what counts as a target. They all call
 * `curveTraces` now. Pure on purpose (no stores, no d3): callers derive the EQ
 * context and keep everything about presentation — opacity, thickness, dash,
 * `yOffset`, baseline compensation, `hidden`, sort order.
 */

export type TraceChannel = 'L' | 'R' | 'AVG';

/**
 * Passed when the item is the enabled EQ source (`eqStore.isEnabled` and its
 * `sourcePhoneUUID`), `null` otherwise. `sample` is `eqStore.sourceSample`:
 * null means the average is the source, a pick means one run of the set.
 */
export interface EqSourceContext {
	sample: EqSourceSample | null;
}

interface TraceBase {
	/** Unique within the item: `'fill'`, a run key (`sample1_L`), or a main channel. */
	key: string;
	color: string;
	/** `curveDisplayName` for runs and main traces; the bare base name for the fill. */
	name: string;
	/** Drawn dimmed as the EQ's "before" curve. */
	ghost: boolean;
}

/** The min/max band of a sample set. */
export interface FillTrace extends TraceBase {
	kind: 'fill';
	/** A band spans channels, so it has none of its own. */
	channel: null;
	/** Already picked and combined by `dispChannel`; never empty. */
	envelope: SampleEnvelope;
}

/** One run of a sample set. */
export interface RunTrace extends TraceBase {
	kind: 'run';
	channel: TraceChannel;
	data: FRDataPoint[];
}

/** An averaged channel, a target's curve, or the EQ source run standing in for the average. */
export interface MainTrace extends TraceBase {
	kind: 'main';
	channel: TraceChannel;
	data: FRDataPoint[];
	/** This is the EQ source run, not the item's own channel; `name` is the run's. */
	fromRun: boolean;
}

export type CurveTrace = FillTrace | RunTrace | MainTrace;

const FALLBACK_COLOR = 'var(--color-base-content)';

/**
 * Merge several per-channel envelopes into one by taking the widest spread at
 * each frequency index, so a fill over L+R reflects every run's extremes.
 */
export function combineEnvelopes(envelopes: SampleEnvelope[]): SampleEnvelope {
	const valid = envelopes.filter((e) => e?.upper.length && e?.lower.length);
	if (valid.length === 0) return { upper: [], lower: [] };
	if (valid.length === 1) return valid[0];
	const base = valid[0];
	const upper: FRDataPoint[] = base.upper.map(([freq], i) => {
		let max = -Infinity;
		for (const e of valid) {
			const v = e.upper[i]?.[1];
			if (v !== undefined && v > max) max = v;
		}
		return [freq, max] as FRDataPoint;
	});
	const lower: FRDataPoint[] = base.lower.map(([freq], i) => {
		let min = Infinity;
		for (const e of valid) {
			const v = e.lower[i]?.[1];
			if (v !== undefined && v < min) min = v;
		}
		return [freq, min] as FRDataPoint;
	});
	return { upper, lower };
}

/**
 * The envelope a fill draws, chosen by `dispChannel`. Empty when there is none.
 *
 *   dispChannel = ['L']         → envelope.L only
 *   dispChannel = ['R']         → envelope.R only
 *   dispChannel = ['AVG']       → combined L+R envelope (NOT envelope.AVG — that hides true spread)
 *   dispChannel = ['L','R'] etc → combined L+R envelope
 */
export function selectEnvelope(obj: FRDataObject): SampleEnvelope {
	const envelope = obj.envelope;
	if (!envelope) return { upper: [], lower: [] };
	let pick: TraceChannel[];
	const single = obj.dispChannel.length === 1 ? obj.dispChannel[0] : null;
	if (single === 'L') {
		pick = ['L'];
	} else if (single === 'R') {
		pick = ['R'];
	} else {
		const available: ('L' | 'R')[] = [];
		if (envelope.L?.upper.length) available.push('L');
		if (envelope.R?.upper.length) available.push('R');
		pick = available.length > 0 ? available : envelope.AVG?.upper.length ? ['AVG'] : [];
	}
	return combineEnvelopes(pick.map((c) => envelope[c]));
}

/**
 * The traces an item draws, in draw order: fill, then runs, then main traces
 * (so the main curves sit on top). Hidden items are not filtered here.
 *
 * - **Targets** (`target` and uploaded `inserted-target`): one AVG main trace,
 *   whatever `dispChannel` says.
 * - **Everything else** follows the phone rule: a fill when `showFill` and there
 *   is an envelope to draw; one run per `dispSamples` key that parses and whose
 *   run has that channel; main traces when `showAvg !== false` or the EQ source
 *   is a run, one per `dispChannel` entry with data in the main channels.
 * - **Main channels** are the EQ source run's when `eqSource` picks a run, else
 *   `obj.channels`. That run is the "before" curve, so those traces are named
 *   by the run, like the item's other runs, not "(AVG)".
 * - **Ghost** marks the fill and main traces of the EQ source. Only for `phone`
 *   items: an `inserted-phone` that is the source has never been dimmed.
 *
 * A trace for something that has no data is simply absent.
 */
export function curveTraces(obj: FRDataObject, eqSource: EqSourceContext | null): CurveTrace[] {
	if (isTargetType(obj)) {
		const data = obj.channels.AVG?.data;
		if (!data) return [];
		return [
			{
				kind: 'main',
				key: 'AVG',
				channel: 'AVG',
				data,
				color: obj.colors.AVG || FALLBACK_COLOR,
				name: curveDisplayName(obj, 'AVG'),
				ghost: false,
				fromRun: false
			}
		];
	}

	const traces: CurveTrace[] = [];
	const avgColor = obj.colors.AVG || FALLBACK_COLOR;
	const ghost = eqSource !== null && obj.type === 'phone';
	// EQ'ing one run of a set makes that run the "before" curve, drawn in place
	// of the average — even with the average toggled off.
	const runSample = eqSource?.sample && eqSourceRun(obj, eqSource.sample) ? eqSource.sample : null;

	if (obj.showFill && obj.envelope) {
		const envelope = selectEnvelope(obj);
		if (envelope.upper.length) {
			traces.push({
				kind: 'fill',
				key: 'fill',
				channel: null,
				envelope,
				color: avgColor,
				name: curveBaseName(obj),
				ghost
			});
		}
	}

	for (const key of obj.dispSamples ?? []) {
		const parts = sampleKeyParts(obj, key);
		if (!parts) continue;
		const channel = obj.samples?.[parts.index]?.[parts.channel];
		if (!channel) continue;
		traces.push({
			kind: 'run',
			key,
			channel: parts.channel,
			data: channel.data,
			color: obj.colors.samples?.[key] || avgColor,
			name: curveDisplayName(obj, parts.channel, parts.label),
			ghost: false
		});
	}

	if (obj.showAvg !== false || runSample) {
		const mainChannels = runSample ? eqSourceChannels(obj, runSample) : obj.channels;
		for (const channel of obj.dispChannel) {
			const data = mainChannels[channel]?.data;
			if (!data) continue;
			const label = runSample
				? sampleKeyParts(obj, `sample${runSample.index}_${channel}`)?.label
				: undefined;
			traces.push({
				kind: 'main',
				key: channel,
				channel,
				data,
				color: obj.colors[channel] || avgColor,
				name: curveDisplayName(obj, channel, label),
				ghost,
				fromRun: !!runSample
			});
		}
	}

	return traces;
}

/**
 * The traces that get a row — in a list or a hover readout — in the order those
 * lists read: main traces, then runs. The fill never gets a row of its own.
 */
export function listedTraces(traces: CurveTrace[]): (RunTrace | MainTrace)[] {
	return [
		...traces.filter((t): t is MainTrace => t.kind === 'main'),
		...traces.filter((t): t is RunTrace => t.kind === 'run')
	];
}

import type {
	ChannelData,
	FRDataObject,
	FRDataPoint,
	ParsedFRData
} from '$lib/types/data-types.js';

/** Channels an average can be produced for, in the order they are written out. */
const CHANNEL_ORDER = ['L', 'R', 'AVG'] as const;
type Channel = (typeof CHANNEL_ORDER)[number];

/** The subset of an `FRDataObject` the averaging math actually reads. */
export interface AverageSource {
	channels: ParsedFRData;
	dispChannel: Channel[];
}

/**
 * Whether an item takes part in "average all visible".
 *
 * Phones only — a target or an EQ curve averaged against a measurement produces
 * a curve that means nothing, and the graph already has better ways to compare
 * against those. Inserted phones count: an uploaded measurement is exactly the
 * case the feature exists for, and a previous average can legitimately be folded
 * into a new one.
 */
export function isAveragable(item: FRDataObject): boolean {
	if (item.hidden) return false;
	if (item.type !== 'phone' && item.type !== 'inserted-phone') return false;
	return CHANNEL_ORDER.some((ch) => item.dispChannel.includes(ch) && item.channels[ch]);
}

/**
 * Mean of every drawn curve, per channel.
 *
 * Averages **what is on screen**: a channel is included for an item only if the
 * item is currently displaying it (`dispChannel`), so a device shown as AVG
 * contributes to AVG and not to L/R. Channels are averaged independently, so a
 * selection mixing L/R devices with AVG-only ones still produces every channel
 * it has data for — each over its own contributor count.
 *
 * Feed this **raw** (unsmoothed, unnormalized) channels and process the result
 * afterwards, rather than averaging the processed curves. Smoothing and
 * normalization are both linear in the curve, so `process(mean(x))` and
 * `mean(process(x))` describe the same curve — they differ only by the 0.01 dB
 * quantum `clampDB` rounds every stored value to, which is why the spec asserts
 * agreement to that tolerance rather than exactly. Only the raw order leaves the
 * average with a genuine `_rawData` cache, though, which is what lets
 * `reSmoothAll` rebuild it alongside everything else instead of stranding it at
 * whatever smoothing was active when it was made.
 *
 * A channel with fewer than two contributors is omitted: averaging one curve
 * with itself is a no-op worth refusing rather than silently performing.
 */
export function averageChannels(sources: AverageSource[]): ParsedFRData {
	const averaged: ParsedFRData = {};

	for (const ch of CHANNEL_ORDER) {
		const contributors = sources.filter((s) => s.dispChannel.includes(ch) && s.channels[ch]);
		if (contributors.length < 2) continue;
		averaged[ch] = meanOf(contributors.map((s) => s.channels[ch]!));
	}

	return averaged;
}

/**
 * Point-by-point mean.
 *
 * Averaging by index is safe because `FRParser.parseFRData` interpolates every
 * curve onto the same 1/48oct grid before anything else touches it. The length
 * clamp is belt-and-braces: an item whose data was truncated would otherwise
 * read past the end of its array and poison the whole result with NaN.
 *
 * Note that a per-curve vertical offset — `yOffset`, the nudge buttons in the
 * selection list — deliberately plays no part here. It is a frequency-independent
 * constant, so it survives the mean as a constant, and normalization then strips
 * it right back off: it cannot change the shape of the result, only where the
 * result would sit before it is re-anchored.
 */
function meanOf(channels: ChannelData[]): ChannelData {
	const length = channels.reduce((min, ch) => Math.min(min, ch.data.length), Infinity);
	const count = channels.length;

	const data: FRDataPoint[] = [];
	for (let i = 0; i < length; i++) {
		let sum = 0;
		for (const ch of channels) sum += ch.data[i][1];
		data.push([channels[0].data[i][0], sum / count]);
	}

	return {
		data,
		metadata: {
			minFreq: Math.max(...channels.map((ch) => ch.metadata.minFreq)),
			maxFreq: Math.min(...channels.map((ch) => ch.metadata.maxFreq))
		}
	};
}

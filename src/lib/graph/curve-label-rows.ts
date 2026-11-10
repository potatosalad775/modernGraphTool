import type { FRDataObject } from '#lib/types/data-types.js';
import { curveBaseName } from '#lib/utils/curve-name.js';
import { listedTraces, type CurveTrace } from './curve-traces.js';

/** One line of the on-graph legend. `key` is the trace key (`'fill'` for the combined row). */
export interface LabelRow {
	key: string;
	text: string;
	color: string;
}

/**
 * The legend rows for one item, from the traces it draws.
 *
 * A fill is genuinely one object across channels, so an item whose only trace
 * is the fill collapses to a single line rather than one row per channel.
 * Otherwise the fill gets no row and every main and run trace gets one.
 */
export function labelRows(obj: FRDataObject, traces: CurveTrace[]): LabelRow[] {
	const fill = traces[0];
	if (traces.length === 1 && fill.kind === 'fill') {
		const channels = obj.dispChannel;
		const channelStr =
			channels.length === 2 && channels.includes('L') && channels.includes('R')
				? 'L+R'
				: channels.join('+');
		const desc = obj.sampleDescription ? ` ${obj.sampleDescription}` : '';
		const channelPart = channelStr ? ` (${channelStr})` : '';
		return [
			{ key: fill.key, text: `${curveBaseName(obj)}${desc}${channelPart}`, color: fill.color }
		];
	}

	return listedTraces(traces).map((trace) => {
		// The caption describes the set's deviation, so it rides on the average
		// line, not on the EQ source run.
		const caption =
			trace.kind === 'main' && !trace.fromRun && obj.showFill && obj.sampleDescription
				? ` ${obj.sampleDescription}`
				: '';
		return { key: trace.key, text: `${trace.name}${caption}`, color: trace.color };
	});
}

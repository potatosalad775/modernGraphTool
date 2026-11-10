import * as m from '#lib/paraglide/messages.js';
import type { Channel, FRDataObject } from '#lib/types/data-types.js';

/** One radio / select choice for which channels a curve item displays. */
export type ChannelOption = { value: string; label: string };

/** The choices an item offers: L, R, L+R when it has both, then AVG. */
export function channelOptions(item: FRDataObject): ChannelOption[] {
	const keys = Object.keys(item.channels) as Channel[];
	const opts: ChannelOption[] = [];
	const hasL = keys.includes('L');
	const hasR = keys.includes('R');
	const hasAVG = keys.includes('AVG');
	if (hasL) opts.push({ value: 'L', label: m.selection_list_channel_left() });
	if (hasR) opts.push({ value: 'R', label: m.selection_list_channel_right() });
	if (hasL && hasR) opts.push({ value: 'L+R', label: m.selection_list_channel_left_and_right() });
	if (hasAVG) opts.push({ value: 'AVG', label: m.selection_list_channel_average() });
	return opts;
}

/** The choice value matching an item's `dispChannel`; `AVG` when it is empty. */
export function dispChannelToSelectValue(dispChannel: Channel[]): string {
	if (dispChannel.includes('L') && dispChannel.includes('R')) return 'L+R';
	return dispChannel[0] ?? 'AVG';
}

/** Inverse of `dispChannelToSelectValue`. */
export function selectValueToDispChannel(value: string): Channel[] {
	if (value === 'L+R') return ['L', 'R'];
	return [value as Channel];
}

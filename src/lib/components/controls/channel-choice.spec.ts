import { describe, it, expect } from 'vitest';
import * as m from '#lib/paraglide/messages.js';
import type { ChannelData, FRDataObject, ParsedFRData } from '#lib/types/data-types.js';
import {
	channelOptions,
	dispChannelToSelectValue,
	selectValueToDispChannel
} from './channel-choice.js';

const channel: ChannelData = { data: [[1000, 0]], metadata: { minFreq: 20, maxFreq: 20000 } };

function item(channels: ParsedFRData): FRDataObject {
	return { channels } as FRDataObject;
}

describe('channelOptions', () => {
	it('offers only L for an L-only item', () => {
		expect(channelOptions(item({ L: channel }))).toEqual([
			{ value: 'L', label: m.selection_list_channel_left() }
		]);
	});

	it('adds the combined L+R choice when both ears exist', () => {
		expect(channelOptions(item({ L: channel, R: channel }))).toEqual([
			{ value: 'L', label: m.selection_list_channel_left() },
			{ value: 'R', label: m.selection_list_channel_right() },
			{ value: 'L+R', label: m.selection_list_channel_left_and_right() }
		]);
	});

	it('offers only AVG for a single-curve item', () => {
		expect(channelOptions(item({ AVG: channel }))).toEqual([
			{ value: 'AVG', label: m.selection_list_channel_average() }
		]);
	});

	it('lists L, R, L+R, AVG in that order when all three exist', () => {
		const values = channelOptions(item({ AVG: channel, R: channel, L: channel })).map(
			(o) => o.value
		);
		expect(values).toEqual(['L', 'R', 'L+R', 'AVG']);
	});
});

describe('dispChannelToSelectValue', () => {
	it('maps both ears to L+R', () => {
		expect(dispChannelToSelectValue(['L', 'R'])).toBe('L+R');
		expect(dispChannelToSelectValue(['R', 'L'])).toBe('L+R');
	});

	it('maps a single channel to itself', () => {
		expect(dispChannelToSelectValue(['L'])).toBe('L');
		expect(dispChannelToSelectValue(['R'])).toBe('R');
		expect(dispChannelToSelectValue(['AVG'])).toBe('AVG');
	});

	it('falls back to AVG when nothing is displayed', () => {
		expect(dispChannelToSelectValue([])).toBe('AVG');
	});
});

describe('selectValueToDispChannel', () => {
	it('expands L+R to both ears', () => {
		expect(selectValueToDispChannel('L+R')).toEqual(['L', 'R']);
	});

	it('wraps a single value', () => {
		expect(selectValueToDispChannel('L')).toEqual(['L']);
		expect(selectValueToDispChannel('R')).toEqual(['R']);
		expect(selectValueToDispChannel('AVG')).toEqual(['AVG']);
	});
});

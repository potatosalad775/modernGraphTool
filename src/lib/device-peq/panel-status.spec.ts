import { describe, it, expect } from 'vitest';
import { panelStatus, type PanelStatusInput } from './panel-status.js';

const idle: PanelStatusInput = {
	message: null,
	messageIsError: false,
	autoWriting: false,
	autoPaused: false,
	autoClipRisk: false,
	unreachable: false,
	inSync: null
};
const status = (over: Partial<PanelStatusInput>) => panelStatus({ ...idle, ...over });

describe('panelStatus', () => {
	it('says nothing before any read or write', () => {
		expect(status({})).toBeNull();
	});

	it('puts a failure above everything else', () => {
		expect(
			status({
				message: 'Lost it',
				messageIsError: true,
				autoWriting: true,
				autoPaused: true,
				unreachable: true,
				inSync: true
			})
		).toEqual({ tone: 'error', text: 'Lost it' });
	});

	it('offers a reviewed write while auto-write is paused', () => {
		expect(status({ autoWriting: true, autoPaused: true, unreachable: true })).toMatchObject({
			tone: 'warning',
			action: 'review'
		});
	});

	it('ignores auto-write flags left over with auto-write off', () => {
		expect(status({ autoPaused: true, autoClipRisk: true, inSync: false })?.text).toMatch(
			/has changed/
		);
	});

	it('names an unreachable preset before the clip risk', () => {
		expect(status({ unreachable: true, autoWriting: true, autoClipRisk: true })?.text).toMatch(
			/only read and write the preset it's using/
		);
		expect(status({ autoWriting: true, autoClipRisk: true })?.tone).toBe('warning');
	});

	it('lets the last operation stand for "in sync", and drops it once the list moves', () => {
		expect(status({ message: 'Wrote 6', inSync: true })).toEqual({
			tone: 'success',
			text: 'Wrote 6'
		});
		expect(status({ inSync: true })?.text).toBe('The EQ shown matches the device.');
		expect(status({ message: 'Wrote 6', inSync: false })).toEqual({
			tone: 'muted',
			text: 'The EQ has changed since the last read or write.'
		});
	});

	it('shows a message with no sync state behind it as it is', () => {
		expect(status({ message: 'Saved' })).toEqual({ tone: 'muted', text: 'Saved' });
	});
});

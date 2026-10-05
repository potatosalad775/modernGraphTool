/**
 * The one status line under Device PEQ's Read and Write buttons.
 *
 * The panel used to stack a paragraph per state — sync, unreachable preset, auto-write paused, clip
 * risk, the last operation — and several said the same thing at once ("Wrote 6 bands" beside "The
 * device has this EQ"). This picks the single one that matters most, so the panel shows one line
 * and screen readers hear one announcement.
 */
import * as m from '$lib/paraglide/messages.js';

export type PanelStatusTone = 'muted' | 'success' | 'warning' | 'error';

export interface PanelStatus {
	tone: PanelStatusTone;
	text: string;
	/** A button the status offers: write after reviewing what the device can't hold. */
	action?: 'review';
}

export interface PanelStatusInput {
	/** The last operation's message, and whether it reported a failure. */
	message: string | null;
	messageIsError: boolean;
	/** Auto-write is on and this device takes it. */
	autoWriting: boolean;
	autoPaused: boolean;
	autoClipRisk: boolean;
	/** Read or Write can't reach the preset Device EQ shows from where the device is. */
	unreachable: boolean;
	inSync: boolean | null;
}

/** Most urgent first: a failure, then what blocks a write, then whether the device has the list. */
export function panelStatus(s: PanelStatusInput): PanelStatus | null {
	if (s.message && s.messageIsError) return { tone: 'error', text: s.message };
	if (s.autoWriting && s.autoPaused) {
		return { tone: 'warning', text: m.equalizer_device_peq_auto_paused(), action: 'review' };
	}
	if (s.unreachable) return { tone: 'muted', text: m.equalizer_device_peq_unreachable() };
	if (s.autoWriting && s.autoClipRisk) {
		return { tone: 'warning', text: m.equalizer_device_peq_push_clip_risk() };
	}
	// The last read or write's own message ("Wrote 6 bands") stands for "in sync" while it holds,
	// and goes stale the moment the list changes.
	if (s.inSync === true) {
		return { tone: 'success', text: s.message ?? m.equalizer_device_peq_synced() };
	}
	if (s.inSync === false) return { tone: 'muted', text: m.equalizer_device_peq_unsynced() };
	return s.message ? { tone: 'muted', text: s.message } : null;
}

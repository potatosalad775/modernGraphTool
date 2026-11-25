/**
 * How a device's own settings are named. The data names a control as its vendor's app does
 * ("QX-FEED", "OUTPUT POWER"); its `role` gives one translated name across devices, and the data's
 * name is the fallback for a role this app doesn't know. Values keep the device's own names
 * ("Linear phase fast roll-off"). The same names as uniPEQ's, so a device reads the same in both.
 *
 * Apart from `controls.ts` because `devicePeqStore` imports that one, and these thirty messages
 * have no place in the boot chunk.
 */
import type { Control } from '@potatosalad775/eqcaps-core';
import * as m from '#lib/paraglide/messages.js';
import type { Balance } from './controls.js';

const ROLE_LABELS: Partial<Record<string, () => string>> = {
	volume: m.device_control_volume,
	'output-gain': m.device_control_output_gain,
	'dac-filter': m.device_control_dac_filter,
	upsampling: m.device_control_upsampling,
	'usb-mode': m.device_control_usb_mode,
	'sound-mode': m.device_control_sound_mode,
	light: m.device_control_light,
	'tone-bass': m.device_control_bass,
	'tone-treble': m.device_control_treble,
	'amp-mode': m.device_control_amp_mode,
	'mic-gain': m.device_control_mic_gain,
	'balance-left': m.device_control_left_channel,
	'balance-right': m.device_control_right_channel,
	'noise-control': m.device_control_noise_control,
	'mic-noise-reduction': m.device_control_mic_noise_reduction,
	'prompt-tone': m.device_control_prompt_tone,
	'prompt-tone-volume': m.device_control_prompt_tone_volume,
	mute: m.device_control_mute,
	input: m.device_control_input,
	output: m.device_control_output,
	balance: m.device_control_balance,
	polarity: m.device_control_polarity,
	crossfeed: m.device_control_crossfeed,
	'display-brightness': m.device_control_display_brightness,
	headroom: m.device_control_headroom
};

export function controlLabel(control: Control): string {
	const label = control.role ? ROLE_LABELS[control.role] : undefined;
	return label ? label() : control.name;
}

/** A value as the device names it, or as a number (with its unit) for a range. */
export function controlValueLabel(control: Control, value: number): string {
	if (control.kind === 'toggle') {
		return value === 1 ? m.device_control_on() : m.device_control_off();
	}
	const named = control.values?.find((v) => v.value === value);
	if (named) return named.name;
	return control.unit === 'dB' ? `${value} dB` : String(value);
}

/** A balance as the channel it cuts and by how much ("Left -6 dB"), or centred. */
export function balanceLabel(balance: Balance, n: number): string {
	if (n === 0) return m.device_control_balance_center();
	const unit = balance.left.unit === 'dB' ? ' dB' : '';
	const gain = `-${Math.abs(n)}${unit}`;
	return n > 0 ? m.device_control_balance_left({ gain }) : m.device_control_balance_right({ gain });
}

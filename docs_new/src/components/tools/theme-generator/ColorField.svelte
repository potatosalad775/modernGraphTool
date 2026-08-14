<script lang="ts">
	import { hexToOklch, oklchToHex } from '../../../utils/oklch';

	interface Props {
		label: string;
		/** Hex string, e.g. `#2b8c5e`. Two-way bound to the parent's palette input. */
		value: string;
	}

	let { label, value = $bindable() }: Props = $props();

	const id = $props.id();

	/*
	 * Replaces react-color's `SketchPicker`. The swatch covers "I want roughly
	 * this colour"; the L/C/H fields cover the part an HSV picker could not
	 * express at all, which is the one that matters for a tool whose whole
	 * output is an OKLCH palette.
	 *
	 * L/C/H are derived from the hex rather than held alongside it, so there is
	 * a single source of truth and no way for the two to disagree. The round
	 * trip through 8-bit hex costs well under a step of either field, and each
	 * edit re-derives, so it cannot accumulate.
	 */
	let lch = $derived(hexToOklch(value));

	function setChannel(channel: 'l' | 'c' | 'h', raw: number) {
		if (Number.isNaN(raw)) return;
		const limits = { l: [0, 1], c: [0, 0.4], h: [0, 360] } as const;
		const [min, max] = limits[channel];
		value = oklchToHex({ ...lch, [channel]: Math.max(min, Math.min(max, raw)) });
	}

	/** `<input type="color">` rejects anything but `#rrggbb`, so guard the text field. */
	function setHex(raw: string) {
		const next = raw.trim();
		if (/^#[0-9a-fA-F]{6}$/.test(next)) value = next.toLowerCase();
	}
</script>

<div class="tgColorField">
	<label for="{id}-hex">{label}</label>

	<div class="tgColorRow">
		<input
			type="color"
			aria-label="{label} color picker"
			class="tgColorSwatch"
			{value}
			oninput={(e) => (value = e.currentTarget.value)}
		/>
		<input
			id="{id}-hex"
			type="text"
			class="tgHexInput"
			spellcheck="false"
			autocapitalize="off"
			autocorrect="off"
			{value}
			oninput={(e) => setHex(e.currentTarget.value)}
		/>
	</div>

	<div class="tgLchRow">
		<span class="tgLchField">
			<label for="{id}-l">L</label>
			<input
				id="{id}-l"
				type="number"
				min="0"
				max="1"
				step="0.01"
				value={lch.l.toFixed(3)}
				oninput={(e) => setChannel('l', e.currentTarget.valueAsNumber)}
			/>
		</span>
		<span class="tgLchField">
			<label for="{id}-c">C</label>
			<input
				id="{id}-c"
				type="number"
				min="0"
				max="0.4"
				step="0.005"
				value={lch.c.toFixed(3)}
				oninput={(e) => setChannel('c', e.currentTarget.valueAsNumber)}
			/>
		</span>
		<span class="tgLchField">
			<label for="{id}-h">H</label>
			<input
				id="{id}-h"
				type="number"
				min="0"
				max="360"
				step="1"
				value={lch.h.toFixed(1)}
				oninput={(e) => setChannel('h', e.currentTarget.valueAsNumber)}
			/>
		</span>
	</div>
</div>

<style>
	.tgColorField {
		margin-bottom: 15px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
	}

	.tgColorField > label {
		font-weight: bold;
		font-size: 0.9rem;
	}

	.tgColorRow {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 8px;
	}

	/*
	 * Browsers render the colour input's own chrome (padding, bevel) very
	 * differently, so it is stripped back to a flat swatch that matches the
	 * height of the text field next to it.
	 */
	.tgColorSwatch {
		flex-shrink: 0;
		width: 48px;
		min-height: 38px;
		padding: 2px;
		border: 1px solid var(--ifm-color-emphasis-300);
		border-radius: 4px;
		background-color: var(--ifm-color-emphasis-100);
		cursor: pointer;
	}

	.tgColorSwatch::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.tgColorSwatch::-webkit-color-swatch {
		border: none;
		border-radius: 2px;
	}

	.tgColorSwatch::-moz-color-swatch {
		border: none;
		border-radius: 2px;
	}

	.tgHexInput {
		flex: 1;
		min-width: 0;
		min-height: 38px;
		padding: 8px 12px;
		border: 1px solid var(--ifm-color-emphasis-300);
		border-radius: 4px;
		background-color: var(--ifm-color-emphasis-100);
		color: var(--ifm-font-color-base);
		font-family: var(--ifm-font-family-monospace);
	}

	.tgLchRow {
		display: flex;
		flex-direction: row;
		gap: 8px;
	}

	.tgLchField {
		flex: 1;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.tgLchField label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ifm-color-content-secondary);
		width: 0.75rem;
		flex-shrink: 0;
	}

	.tgLchField input {
		flex: 1;
		min-width: 0;
		padding: 4px 6px;
		border: 1px solid var(--ifm-color-emphasis-300);
		border-radius: 4px;
		background-color: var(--ifm-color-emphasis-100);
		color: var(--ifm-font-color-base);
		font-size: 0.8rem;
		font-family: var(--ifm-font-family-monospace);
	}
</style>

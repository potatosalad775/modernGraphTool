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
	/*
	 * Scoped, because these classes belong to this one component — unlike the
	 * `ce*` / `pb*` vocabulary, which is shared across ~50 files and therefore
	 * lives in the global `styles/tools.css`. The `--tool-*` tokens are inherited
	 * from `.tool-root` on the page, so scoping costs nothing here.
	 */
	.tgColorField {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		width: 100%;
	}

	.tgColorField > label {
		font-size: var(--sl-text-xs);
		font-weight: 500;
		color: var(--tool-text-strong);
	}

	.tgColorRow {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
	}

	/*
	 * Browsers render the colour input's own chrome (padding, bevel) very
	 * differently, so it is stripped back to a flat swatch that matches the
	 * height of the text field next to it.
	 */
	.tgColorSwatch {
		flex-shrink: 0;
		width: 3rem;
		min-height: var(--tool-control-h);
		padding: 2px;
		border: 1px solid var(--tool-border);
		border-radius: var(--tool-radius-sm);
		background: var(--tool-surface);
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

	.tgLchRow {
		display: flex;
		gap: 0.5rem;
	}

	.tgLchField {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}

	.tgLchField label {
		font-size: var(--sl-text-2xs);
		font-weight: 600;
		color: var(--tool-text-muted);
		width: 0.75rem;
		flex-shrink: 0;
	}

	.tgLchField input {
		flex: 1;
		min-width: 0;
		padding: 0.25rem 0.375rem;
		border: 1px solid var(--tool-border);
		border-radius: var(--tool-radius-sm);
		background: var(--tool-surface);
		color: var(--tool-text-strong);
		font-family: var(--tool-mono);
		font-size: var(--sl-text-2xs);
	}
</style>

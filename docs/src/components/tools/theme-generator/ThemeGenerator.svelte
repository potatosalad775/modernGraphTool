<script lang="ts">
	import {
		type ContrastPairing,
		type PairingContrast,
		type PaletteInputs,
		generateBaseScale,
		generateFullPalette,
		oklchToCssString,
		randomizeInputs,
		worstLightPairings,
		BASE_LIGHTNESS_LIGHT_RANGE,
		BASE_LIGHTNESS_DARK_RANGE,
		DEFAULT_INPUTS,
		WCAG_AA
	} from '../../../utils/oklch';
	import { renderThemeCss } from '../../../utils/theme-css';
	import { createTranslator, type ToolLang } from '../../../i18n/tools';
	import ColorField from './ColorField.svelte';
	import DummyGraphPage from './DummyGraphPage.svelte';
	import Icon from '../shared/Icon.svelte';
	import Switch from '../shared/Switch.svelte';

	interface Props {
		lang: ToolLang;
	}

	let { lang }: Props = $props();
	// `$derived`, not a plain const: the const would capture only the initial
	// `lang`. Each route passes a fixed locale today, so this never actually
	// recomputes — but the reactive form is the one that stays correct.
	let t = $derived(createTranslator(lang));

	// ── State ──────────────────────────────────────────────────────────────────

	let inputs = $state<PaletteInputs>({ ...DEFAULT_INPUTS });

	/*
	 * The React original debounced this behind a 50ms `setTimeout` because every
	 * `SketchPicker` drag fired a state update that re-rendered both previews.
	 * `generateFullPalette` is pure arithmetic over ~20 colours, and Svelte
	 * updates only the inline styles that actually changed, so the debounce —
	 * and the visible lag it introduced on every edit — is not needed.
	 */
	let theme = $derived(generateFullPalette(inputs));
	let pairings = $derived(worstLightPairings(inputs));

	let previewContrast = $state(false);
	let preview = $derived(previewContrast ? theme.contrast : theme);

	const semanticFields = [
		{ key: 'primary', label: 'Primary' },
		{ key: 'secondary', label: 'Secondary' },
		{ key: 'accent', label: 'Accent' }
	] as const;

	const statusFields = [
		{ key: 'info', label: 'Info' },
		{ key: 'success', label: 'Success' },
		{ key: 'warning', label: 'Warning' },
		{ key: 'error', label: 'Error' }
	] as const;

	const FAILING: Record<ContrastPairing, string> = {
		content: 'Text on this color: {ratio}:1, below 4.5:1',
		surface: 'As text on the light surface: {ratio}:1, below 4.5:1'
	};

	/** Floored, so a ratio just short of 4.5 never reads "4.5:1, below 4.5:1". */
	function withRatio(source: string, ratio: number): string {
		return t(source).replace('{ratio}', (Math.floor(ratio * 10) / 10).toFixed(1));
	}

	function clamp(min: number, value: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	/**
	 * Every base-tone control is a percentage in the UI and a 0–1 fraction in the
	 * palette, except the hue. `set` takes the already-converted value.
	 */
	function setNumber(raw: number, min: number, max: number, set: (value: number) => void) {
		if (Number.isNaN(raw)) return;
		set(clamp(min, raw, max));
	}

	const pct = (value: number) => Math.round(value * 100);

	// ── Slider track gradients ─────────────────────────────────────────────────
	/*
	 * Each track is painted with the colours that slider position would actually
	 * produce, by asking `generateBaseScale` for the ends of its own range. It
	 * costs a few gamut bisections per keystroke and removes the guesswork from
	 * controls whose effect is otherwise invisible until you release them.
	 */

	function gradient(...stops: string[]): string {
		return `linear-gradient(to right, ${stops.join(', ')})`;
	}

	function lightBase(saturation: number, lightness: number) {
		return generateBaseScale(inputs.baseHue, saturation, lightness, inputs.baseLightnessDark).light;
	}

	function darkBase(lightness: number) {
		return generateBaseScale(
			inputs.baseHue,
			inputs.baseSaturation,
			inputs.baseLightnessLight,
			lightness
		).dark;
	}

	const HUE_TRACK = gradient(
		'hsl(0, 70%, 60%)',
		'hsl(60, 70%, 60%)',
		'hsl(120, 70%, 60%)',
		'hsl(180, 70%, 60%)',
		'hsl(240, 70%, 60%)',
		'hsl(300, 70%, 60%)',
		'hsl(360, 70%, 60%)'
	);

	// Sampled at `base-300` rather than `base-100`: the tint is the same share of
	// the gamut at every step of the scale, but only the darkest surface has
	// enough room to show it at a glance.
	let saturationTrack = $derived(
		gradient(
			oklchToCssString(lightBase(0, inputs.baseLightnessLight).base300),
			oklchToCssString(lightBase(0.5, inputs.baseLightnessLight).base300),
			oklchToCssString(lightBase(1, inputs.baseLightnessLight).base300)
		)
	);

	let lightnessLightTrack = $derived(
		gradient(
			oklchToCssString(lightBase(inputs.baseSaturation, BASE_LIGHTNESS_LIGHT_RANGE[0]).base100),
			oklchToCssString(lightBase(inputs.baseSaturation, BASE_LIGHTNESS_LIGHT_RANGE[1]).base100)
		)
	);

	let lightnessDarkTrack = $derived(
		gradient(
			oklchToCssString(darkBase(BASE_LIGHTNESS_DARK_RANGE[0]).base100),
			oklchToCssString(darkBase(BASE_LIGHTNESS_DARK_RANGE[1]).base100)
		)
	);

	function handleExport() {
		const css = renderThemeCss(theme);
		const blob = new Blob([css], { type: 'text/css' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'theme.css';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

{#snippet baseSlider(
	id: string,
	label: string,
	min: number,
	max: number,
	value: number,
	track: string,
	set: (value: number) => void
)}
	<section class="tgSliderField">
		<label for={id}>{label}</label>
		<div class="tgSliderRow">
			<input
				{id}
				type="range"
				{min}
				{max}
				step="1"
				class="tgSlider"
				style="--tg-track: {track}"
				{value}
				oninput={(e) => setNumber(e.currentTarget.valueAsNumber, min, max, set)}
			/>
			<input
				type="number"
				aria-label={label}
				{min}
				{max}
				step="1"
				class="tgNumberInput"
				{value}
				oninput={(e) => setNumber(e.currentTarget.valueAsNumber, min, max, set)}
			/>
		</div>
	</section>
{/snippet}

{#snippet contrastLine({ ratio, pairing }: PairingContrast)}
	{#if ratio >= WCAG_AA}
		<p class="tgContrast">{withRatio('Contrast {ratio}:1', ratio)}</p>
	{:else}
		<p class="tgContrast tgContrastLow">
			<Icon name="alert" />
			{withRatio(FAILING[pairing], ratio)}
		</p>
	{/if}
{/snippet}

<div class="tgContainer">
	<div class="tgTools">
		<h4>{t('Base Tone')}</h4>
		<p class="tgDescription">
			{t(
				'Controls the base palette (backgrounds, text, borders). Hue and saturation tint every surface; the surface sliders set how light each mode starts. A near-white surface can only hold a faint tint, so lower Light Surface to push saturation further.'
			)}
		</p>
		{@render baseSlider(
			'tgBaseHue',
			t('Base Hue'),
			0,
			360,
			inputs.baseHue,
			HUE_TRACK,
			(v) => (inputs.baseHue = v)
		)}
		{@render baseSlider(
			'tgBaseSaturation',
			t('Base Saturation'),
			0,
			100,
			pct(inputs.baseSaturation),
			saturationTrack,
			(v) => (inputs.baseSaturation = v / 100)
		)}
		{@render baseSlider(
			'tgLightSurface',
			t('Light Surface'),
			pct(BASE_LIGHTNESS_LIGHT_RANGE[0]),
			pct(BASE_LIGHTNESS_LIGHT_RANGE[1]),
			pct(inputs.baseLightnessLight),
			lightnessLightTrack,
			(v) => (inputs.baseLightnessLight = v / 100)
		)}
		{@render baseSlider(
			'tgDarkSurface',
			t('Dark Surface'),
			pct(BASE_LIGHTNESS_DARK_RANGE[0]),
			pct(BASE_LIGHTNESS_DARK_RANGE[1]),
			pct(inputs.baseLightnessDark),
			lightnessDarkTrack,
			(v) => (inputs.baseLightnessDark = v / 100)
		)}

		<div class="tgSectionHeader">
			<h4>{t('Semantic Colors')}</h4>
			<button
				type="button"
				class="ceBtn tgSourceColorRandomizerButton"
				onclick={() => (inputs = randomizeInputs(inputs))}
			>
				{t('Random All')}
			</button>
		</div>
		<p class="tgDescription">
			{t(
				'Pick colors for each role. Content (text-on-color) and dark mode variants are auto-generated.'
			)}
		</p>

		{#each semanticFields as { key, label } (key)}
			<div class="tgRoleField">
				<ColorField {label} bind:value={inputs[key]} />
				{@render contrastLine(pairings[key])}
			</div>
		{/each}

		<h4>{t('Status Colors')}</h4>
		{#each statusFields as { key, label } (key)}
			<div class="tgRoleField">
				<ColorField {label} bind:value={inputs[key]} />
				{@render contrastLine(pairings[key])}
			</div>
		{/each}

		<button type="button" class="ceBtn ceBtnPrimary tgExportButton" onclick={handleExport}>
			<Icon name="download" />
			{t('Export theme.css')}
		</button>
	</div>
	<div class="tgPreview">
		<!-- A label around the switch, so the text toggles it as well. -->
		<label class="ceToggleRow">
			<Switch bind:checked={previewContrast} ariaLabel={t('Preview increased contrast')} />
			<span class="ceToggleLabel">{t('Preview increased contrast')}</span>
		</label>
		<DummyGraphPage colorMode="light" theme={preview.light} />
		<DummyGraphPage colorMode="dark" theme={preview.dark} />
	</div>
</div>

<style>
	/*
	 * Scoped: every class here is used by this component alone. The chrome —
	 * panels, buttons, inputs — comes from `styles/tools.css` via the shared
	 * class names, so what is left is only the layout and the hue slider.
	 */
	.tgContainer {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
	}

	/*
	 * `min()` and not a bare `19rem`: a flex item's `min-width` is a hard floor,
	 * so on a viewport narrower than the floor the panel — and most visibly the
	 * randomiser sitting at its right edge — spills out of the page rather than
	 * shrinking. The `100%` arm hands the floor back below that width.
	 */
	.tgTools {
		flex: 1;
		min-width: min(19rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 1rem;
		border: 1px solid var(--tool-hairline);
		border-radius: var(--tool-radius);
		background: var(--tool-surface);
		align-self: flex-start;
	}

	.tgTools h4 {
		margin: 0.5rem 0 0;
		padding-bottom: 0.375rem;
		border-bottom: 1px solid var(--tool-hairline);
		font-size: var(--sl-text-sm);
		font-weight: 600;
		color: var(--tool-text-strong);
	}

	.tgTools h4:first-child {
		margin-top: 0;
	}

	.tgDescription {
		margin: -0.5rem 0 0;
		font-size: var(--sl-text-xs);
		color: var(--tool-text-muted);
		line-height: 1.5;
	}

	/*
	 * The randomiser is a section action, not a Primary one — it rerolls the base
	 * hue and saturation as well as all seven swatches — so it sits on the
	 * heading rather than beside the first field. That is also the only place it
	 * fits: sharing Primary's row squeezed the three L/C/H boxes until their
	 * values truncated, and on a phone it left the button nowhere to go but off
	 * the edge of the panel. It wraps under the heading if a locale's label is
	 * long enough to need it.
	 */
	.tgSectionHeader {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 0.75rem;
		margin-top: 0.5rem;
		padding-bottom: 0.375rem;
		border-bottom: 1px solid var(--tool-hairline);
	}

	/* The rule above already draws the divider for the whole row. */
	.tgSectionHeader h4 {
		margin: 0;
		padding-bottom: 0;
		border-bottom: none;
	}

	.tgSourceColorRandomizerButton {
		flex: 0 0 auto;
	}

	.tgPreview {
		flex: 2;
		min-width: min(25rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* ── Base tone controls ──────────────────────────────────────────────────── */

	.tgSliderField {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		width: 100%;
	}

	.tgSliderField label {
		font-size: var(--sl-text-xs);
		font-weight: 500;
		color: var(--tool-text-strong);
	}

	.tgSliderRow {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
	}

	/*
	 * Each track is painted by its own control with the colours that position
	 * produces — the one place in the tools where a raw colour is the content
	 * rather than the chrome, so it is exempt from the "tokens only" rule. The
	 * thumb still is not: it borrows the surface and border tokens so it reads
	 * correctly against either theme, and a checkerboard behind the track keeps
	 * a near-white surface visible on the light page.
	 */
	.tgSlider {
		-webkit-appearance: none;
		appearance: none;
		flex: 1;
		min-width: 0;
		height: 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--tool-border);
		background: var(--tg-track);
	}

	.tgSlider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--tool-surface);
		border: 2px solid var(--tool-text-muted);
		cursor: pointer;
		box-shadow: var(--sl-shadow-sm);
	}

	.tgSlider::-moz-range-thumb {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--tool-surface);
		border: 2px solid var(--tool-text-muted);
		cursor: pointer;
		box-shadow: var(--sl-shadow-sm);
	}

	.tgExportButton {
		width: 100%;
		margin-top: 0.5rem;
	}

	/* ── Contrast readout ────────────────────────────────────────────────────── */

	.tgRoleField {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.tgContrast {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		font-size: var(--sl-text-2xs);
		color: var(--tool-text-muted);

		:global(svg) {
			width: 0.875rem;
			height: 0.875rem;
		}
	}

	/* The icon and the wording carry the failure; the colour only backs them up. */
	.tgContrastLow {
		color: var(--sl-color-orange-high);
	}
</style>

<script lang="ts">
	import { type ThemePalette, withAlpha } from '../../../utils/oklch';

	interface Props {
		colorMode: 'light' | 'dark';
		theme?: ThemePalette;
	}

	let { colorMode, theme }: Props = $props();

	// Default palettes matching defaults/theme.css reference values
	const defaultLight: ThemePalette = {
		base100: 'oklch(98% 0.003 247.858)',
		base200: 'oklch(96% 0.007 247.896)',
		base300: 'oklch(92% 0.013 255.508)',
		baseContent: 'oklch(20% 0.042 265.755)',
		primary: 'oklch(59% 0.145 163.225)',
		primaryContent: 'oklch(97% 0.021 166.113)',
		secondary: 'oklch(60% 0.126 221.723)',
		secondaryContent: 'oklch(98% 0.019 200.873)',
		accent: 'oklch(44% 0.017 285.786)',
		accentContent: 'oklch(98% 0 0)',
		neutral: 'oklch(44% 0.043 257.281)',
		neutralContent: 'oklch(98% 0.003 247.858)',
		info: 'oklch(68% 0.169 237.323)',
		infoContent: 'oklch(97% 0.013 236.62)',
		success: 'oklch(76% 0.233 130.85)',
		successContent: 'oklch(98% 0.031 120.757)',
		warning: 'oklch(79% 0.184 86.047)',
		warningContent: 'oklch(98% 0.026 102.212)',
		error: 'oklch(64% 0.246 16.439)',
		errorContent: 'oklch(96% 0.015 12.422)',
		graphBg: 'transparent',
		graphWatermarkOpacity: '0.08',
		graphGridMajor: 'rgba(0, 0, 0, 0.15)',
		graphGridMinor: 'rgba(0, 0, 0, 0.06)',
		graphAxisLabel: 'rgba(0, 0, 0, 0.6)',
		graphGridText: 'rgba(0, 0, 0, 0.5)',
		graphBaseline: 'rgba(0, 0, 0, 0.25)'
	};

	const defaultDark: ThemePalette = {
		base100: 'oklch(30.857% 0.023 264.149)',
		base200: 'oklch(28.036% 0.019 264.182)',
		base300: 'oklch(26.346% 0.018 262.177)',
		baseContent: 'oklch(82.901% 0.031 222.959)',
		primary: 'oklch(86.133% 0.141 139.549)',
		primaryContent: 'oklch(17.226% 0.028 139.549)',
		secondary: 'oklch(73.375% 0.165 35.353)',
		secondaryContent: 'oklch(14.675% 0.033 35.353)',
		accent: 'oklch(74.229% 0.133 311.379)',
		accentContent: 'oklch(14.845% 0.026 311.379)',
		neutral: 'oklch(24.731% 0.02 264.094)',
		neutralContent: 'oklch(82.901% 0.031 222.959)',
		info: 'oklch(86.078% 0.142 206.182)',
		infoContent: 'oklch(17.215% 0.028 206.182)',
		success: 'oklch(76% 0.177 163.223)',
		successContent: 'oklch(37% 0.077 168.94)',
		warning: 'oklch(82% 0.189 84.429)',
		warningContent: 'oklch(41% 0.112 45.904)',
		error: 'oklch(71% 0.194 13.428)',
		errorContent: 'oklch(27% 0.105 12.094)',
		graphBg: 'transparent',
		graphWatermarkOpacity: '0.08',
		graphGridMajor: 'rgba(255, 255, 255, 0.15)',
		graphGridMinor: 'rgba(255, 255, 255, 0.06)',
		graphAxisLabel: 'rgba(255, 255, 255, 0.6)',
		graphGridText: 'rgba(255, 255, 255, 0.5)',
		graphBaseline: 'rgba(255, 255, 255, 0.25)'
	};

	let t = $derived(theme ?? (colorMode === 'dark' ? defaultDark : defaultLight));

	const toasts = [
		{ role: 'info', text: 'Info toast sample' },
		{ role: 'success', text: 'Success toast sample' },
		{ role: 'warning', text: 'Warning toast sample' },
		{ role: 'error', text: 'Error toast sample' }
	] as const;
</script>

<section
	class="dgpContainer"
	style="background-color: {t.base100}; color: {t.baseContent};
	       border: 1px solid {withAlpha(t.baseContent, 0.15)};"
>
	<!-- ── Top Nav Bar ─────────────────────────────────────────────────── -->
	<div
		class="dgpHeader"
		style="background-color: {t.base200}; color: {t.baseContent};
		       border-bottom: 1px solid {withAlpha(t.baseContent, 0.15)};"
	>
		<h3>modernGraphTool ({colorMode})</h3>
		<span style="color: {t.primary}; font-size: 14px; font-weight: 600;">&#9788;</span>
	</div>

	<!-- ── Main content ────────────────────────────────────────────────── -->
	<div class="dgpContent">
		<!-- Graph area -->
		<div class="dgpGraph" style="background-color: {t.base100}; color: {t.baseContent};">
			<section class="dgpToasts">
				{#each toasts as { role, text } (role)}
					<div
						class="dgpToast"
						style="background: {withAlpha(t[role], 0.12)}; color: {t[role]};
						       border-left: 3px solid {t[role]};"
					>
						{text}
					</div>
				{/each}
			</section>
			<span style="opacity: 0.5;">Graph area</span>
		</div>

		<!-- Divider -->
		<div class="dgpDivider" style="background-color: {withAlpha(t.baseContent, 0.15)};"></div>

		<!-- Controls panel -->
		<div class="dgpTools" style="background-color: {t.base200}; color: {t.baseContent};">
			<section class="dgpToolsContent">
				<!-- ── Target selector ──────────────────────────────────────── -->
				<section class="dgpTargetSelector">
					<span
						style="color: {withAlpha(t.baseContent, 0.4)}; font-size: 9px; font-weight: 500;
						       text-transform: uppercase; letter-spacing: 0.05em;"
					>
						Target
					</span>
					<div
						style="background-color: {t.primary}; color: {t.primaryContent}; border-radius: 4px;
						       padding: 2px 10px; font-size: 11px; font-weight: 500;"
					>
						5128 DF
					</div>
					{#each ['4128 DF', '6128 DF'] as label (label)}
						<div
							style="border: 1px solid {withAlpha(t.baseContent, 0.2)}; color: {t.baseContent};
							       border-radius: 4px; padding: 2px 10px; font-size: 11px;"
						>
							{label}
						</div>
					{/each}
				</section>

				<!-- ── Phone selector ───────────────────────────────────────── -->
				<section
					class="dgpPhoneSelector"
					style="background-color: {t.base100};
					       border: 1px solid {withAlpha(t.baseContent, 0.15)};"
				>
					<div
						class="dgpPhoneSelectorObjectSelected"
						style="background-color: {withAlpha(t.accent, 0.12)}; color: {t.accent};
						       border-left: 2px solid {t.accent};"
					>
						Stardrop Moonfield
					</div>
					<div class="dgpPhoneSelectorObject" style="color: {t.baseContent};">
						Fictionalear Hexa 2
					</div>
				</section>

				<!-- ── Button row ───────────────────────────────────────────── -->
				<section class="dgpButtonContainer">
					<div style="background-color: {t.primary}; color: {t.primaryContent}; font-weight: 500;">
						Primary
					</div>
					<div
						style="background-color: {t.secondary}; color: {t.secondaryContent}; font-weight: 500;"
					>
						Secondary
					</div>
					<div style="border: 1px solid {withAlpha(t.baseContent, 0.2)}; color: {t.baseContent};">
						Outline
					</div>
					<div style="background-color: {t.base300}; color: {t.baseContent};">Muted</div>
					<div style="background-color: {t.error}; color: {t.errorContent}; font-weight: 500;">
						Destructive
					</div>
					<div style="color: {t.baseContent}; background-color: transparent;">Ghost</div>
				</section>
			</section>

			<!-- ── Menu Carousel ──────────────────────────────────────────── -->
			<section
				class="dgpMenuCarousel"
				style="background-color: {t.base200};
				       border-top: 1px solid {withAlpha(t.baseContent, 0.15)};"
			>
				<div class="dgpMenuItem" style="color: {withAlpha(t.baseContent, 0.25)};">DEVICE</div>
				<div class="dgpMenuItemActive">
					<span style="color: {t.accent};">GRAPH</span>
					<div class="dgpMenuIndicator" style="background-color: {t.accent};"></div>
				</div>
				<div class="dgpMenuItem" style="color: {withAlpha(t.baseContent, 0.6)};">EQ</div>
				<div class="dgpMenuItem" style="color: {withAlpha(t.baseContent, 0.25)};">MISC</div>
			</section>
		</div>
	</div>
</section>

<style>
	/*
	 * Carried over from the Docusaurus `styles.module.css`. Svelte's own scoping
	 * replaces CSS Modules here: this stylesheet was only ever used by this one
	 * component, so scoping is a straight swap — and Svelte additionally warns
	 * on any selector that stops matching, which CSS Modules did not.
	 *
	 * Everything colour-bearing stays inline, driven by the palette prop.
	 */
	.dgpContainer {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		cursor: default;
		font-size: 12px;
		font-weight: 500;
		border-radius: 8px;
		overflow: hidden;
		/*
		 * The mock is a miniature of the real app, so it stacks on its own width
		 * rather than the viewport's — it sits in a column roughly two thirds of
		 * the page, and a viewport media query would flip it at the wrong moment.
		 */
		container-type: inline-size;
	}

	.dgpHeader {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		height: 48px;
		padding: 0 16px;
		font-size: 12px;

		h3 {
			margin: 0;
			font-size: 14px;
			font-weight: 600;
		}
	}

	.dgpContent {
		flex: 1;
		display: flex;
		flex-direction: row;
	}

	.dgpGraph {
		flex: 4;
		display: flex;
		position: relative;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 12px;
		min-height: 200px;
	}

	.dgpToasts {
		position: absolute;
		top: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.dgpToast {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 500;
	}

	.dgpDivider {
		width: 5px;
		flex-shrink: 0;
	}

	.dgpTools {
		flex: 3;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-width: min(280px, 100%);
	}

	/*
	 * Below this the two columns can no longer both hold their content, so the
	 * mock does what the app itself does on a phone: one column, and the divider
	 * turns from a vertical rule into a horizontal one.
	 */
	@container (max-width: 30rem) {
		.dgpContent {
			flex-direction: column;
		}

		.dgpDivider {
			width: auto;
			height: 1px;
		}

		/* The toasts are absolutely positioned; centred label text runs into them
		   once the graph area is no longer wide enough to sit beside them. */
		.dgpGraph {
			justify-content: flex-end;
		}
	}

	.dgpToolsContent {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.dgpTargetSelector {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.dgpPhoneSelector {
		display: flex;
		flex-direction: column;
		border-radius: 8px;
		overflow: hidden;
	}

	.dgpPhoneSelectorObject {
		padding: 8px 12px;
		font-size: 12px;
	}

	.dgpPhoneSelectorObjectSelected {
		padding: 8px 12px;
		font-size: 12px;
		font-weight: 500;
	}

	.dgpButtonContainer {
		display: flex;
		flex-direction: row;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;

		div {
			padding: 4px 12px;
			border-radius: 6px;
			font-size: 11px;
		}
	}

	.dgpMenuCarousel {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		gap: 20px;
		padding: 10px 0;
		height: 44px;
	}

	.dgpMenuItem {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.dgpMenuItemActive {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.dgpMenuIndicator {
		width: 24px;
		height: 2px;
		border-radius: 1px;
	}
</style>

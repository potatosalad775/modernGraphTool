<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, FRColors } from '$lib/types/data-types.js';
	import {
		parseOklch,
		formatOklch,
		hexToOklch,
		oklchToHex
	} from '$lib/utils/curve-palette.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { Popover } from 'bits-ui';
	import Button from '../atoms/Button.svelte';
	import { Shuffle } from '@lucide/svelte';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	function parseDash(dash: string): [number, number] {
		const parts = dash.trim().split(/\s+/);
		return [parseFloat(parts[0]) || 1, parseFloat(parts[1]) || 0];
	}

	let hexColor = $derived(oklchToHex(...parseOklch(item.colors.AVG)));

	let isOpen = $state(false);

	// L: 0–1 (2dp), C: 0–0.4 (2dp), H: 0–360 (integer)
	let localL = $state(0.68);
	let localC = $state(0.16);
	let localH = $state(0);
	let localHex = $state('#000000');
	let localTick = $state(1);
	let localSpace = $state(0);

	function syncFromItem(): void {
		const [L, C, H] = parseOklch(item.colors.AVG);
		localL = round2(L);
		localC = round2(C);
		localH = Math.round(H);
		localHex = oklchToHex(L, C, H);
		const [tick, space] = parseDash(item.dash);
		localTick = tick;
		localSpace = space;
	}

	function round2(n: number): number {
		return Math.round(n * 100) / 100;
	}

	function handleOpenChange(open: boolean): void {
		isOpen = open;
		if (open) syncFromItem();
	}

	let colorTimer: ReturnType<typeof setTimeout> | null = null;
	let dashTimer: ReturnType<typeof setTimeout> | null = null;

	function isTargetType(): boolean {
		return item.type === 'target' || item.type === 'inserted-target';
	}

	function buildColors(L: number, C: number, H: number): FRColors {
		if (isTargetType()) {
			return { AVG: formatOklch(L, C, H) };
		}
		return {
			L: formatOklch(L, C, (H - 10 + 360) % 360),
			R: formatOklch(L, C, (H + 10) % 360),
			AVG: formatOklch(L, C, H)
		};
	}

	function scheduleColorUpdate(L: number, C: number, H: number): void {
		if (colorTimer !== null) clearTimeout(colorTimer);
		colorTimer = setTimeout(() => {
			dataProvider.updateColors(uuid, buildColors(L, C, H));
			colorTimer = null;
		}, 50);
	}

	function scheduleDashUpdate(ntick: number, nspace: number): void {
		if (dashTimer !== null) clearTimeout(dashTimer);
		dashTimer = setTimeout(() => {
			dataProvider.updateDashPattern(uuid, `${ntick} ${nspace}`);
			dashTimer = null;
		}, 50);
	}

	function onHexInput(e: Event): void {
		const value = (e.target as HTMLInputElement).value;
		localHex = value;
		if (/^#[0-9a-fA-F]{6}$/.test(value)) {
			const [L, C, H] = hexToOklch(value);
			localL = round2(L);
			localC = round2(C);
			localH = Math.round(H);
			scheduleColorUpdate(L, C, H);
		}
	}

	function onLchInput(): void {
		localHex = oklchToHex(localL, localC, localH);
		scheduleColorUpdate(localL, localC, localH);
	}

	function onDashInput(): void {
		scheduleDashUpdate(localTick, localSpace);
	}

	function onRandom(): void {
		const palette = getConfigValue('TRACE_STYLING.CURVE_COLOR_PALETTE') as string[] | undefined;
		let L: number;
		let C: number;
		let H: number;

		if (palette && palette.length > 0) {
			// Pick a random palette entry, avoiding the current color when possible.
			const candidates =
				palette.length > 1 ? palette.filter((c) => c !== item.colors.AVG) : palette;
			const pick = candidates[Math.floor(Math.random() * candidates.length)];
			[L, C, H] = parseOklch(pick);
		} else {
			// Generate a random OKLCH color at the default lightness/chroma.
			L = 0.68;
			C = 0.16;
			H = Math.floor(Math.random() * 360);
		}

		localL = round2(L);
		localC = round2(C);
		localH = Math.round(H);
		localHex = oklchToHex(L, C, H);
		scheduleColorUpdate(L, C, H);
	}
</script>

<Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class="h-5 w-5 shrink-0 cursor-pointer rounded-sm border-0 transition-opacity hover:opacity-80"
				style="background-color: {hexColor};"
				aria-label="Pick color"
			></button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			sideOffset={6}
			class="z-50 w-56 rounded-lg border border-base-content/15 bg-base-200 p-3 shadow-xl"
		>
			<!-- Hex color input -->
			<div class="mb-3">
				<input
					id="{uuid}-color-hex"
					type="color"
					value={localHex}
					oninput={onHexInput}
					class="h-8 w-full cursor-pointer rounded border border-base-content/20 p-0.5"
				/>
			</div>

			<!-- OKLCH inputs -->
			<div class="mb-3 flex items-center gap-2">
				<div class="flex flex-col items-center gap-0.5">
					<label for="{uuid}-lch-l" class="text-xs text-base-content/60"
						>{m.graph_color_picker_label_lightness()}</label
					>
					<input
						id="{uuid}-lch-l"
						type="number"
						min="0"
						max="1"
						step="0.01"
						bind:value={localL}
						oninput={onLchInput}
						class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label for="{uuid}-lch-c" class="text-xs text-base-content/60"
						>{m.graph_color_picker_label_chroma()}</label
					>
					<input
						id="{uuid}-lch-c"
						type="number"
						min="0"
						max="0.4"
						step="0.01"
						bind:value={localC}
						oninput={onLchInput}
						class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label for="{uuid}-lch-h" class="text-xs text-base-content/60"
						>{m.graph_color_picker_label_hue()}</label
					>
					<input
						id="{uuid}-lch-h"
						type="number"
						min="0"
						max="360"
						bind:value={localH}
						oninput={onLchInput}
						class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
					/>
				</div>
			</div>

			<!-- Dash inputs -->
			<div class="mb-3 flex items-center gap-2">
				<div class="flex flex-col items-center gap-0.5">
					<label for="{uuid}-dash-tick" class="text-xs text-base-content/60"
						>{m.graph_color_picker_label_tick()}</label
					>
					<input
						id="{uuid}-dash-tick"
						type="number"
						min="0"
						step="0.5"
						bind:value={localTick}
						oninput={onDashInput}
						class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label for="{uuid}-dash-space" class="text-xs text-base-content/60"
						>{m.graph_color_picker_label_space()}</label
					>
					<input
						id="{uuid}-dash-space"
						type="number"
						min="0"
						step="0.5"
						bind:value={localSpace}
						oninput={onDashInput}
						class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
					/>
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex items-center justify-between gap-2">
				<Button
					title={m.graph_color_picker_btn_random()}
					onclick={onRandom}
					variant="muted"
					size="sm"
				>
					{m.graph_color_picker_btn_random()}
					<Shuffle class="ml-1 h-3 w-3" aria-hidden="true" />
				</Button>

				<Popover.Close>
					{#snippet child({ props })}
						<Button {...props} title={m.graph_color_picker_btn_close()} variant="muted" size="sm">
							{m.graph_color_picker_btn_close()}
						</Button>
					{/snippet}
				</Popover.Close>
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

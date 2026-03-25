<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import type { FRDataObject, FRColors } from '$lib/types/data-types.js';
	import { Popover } from 'bits-ui';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// ── Utility functions ──────────────────────────────────────────────────────

	function hslToHex(h: number, s: number, l: number): string {
		s /= 100;
		l /= 100;
		const a = s * Math.min(l, 1 - l);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
			return Math.round(255 * color)
				.toString(16)
				.padStart(2, '0');
		};
		return `#${f(0)}${f(8)}${f(4)}`;
	}

	function hexToHsl(hex: string): [number, number, number] {
		const r = parseInt(hex.slice(1, 3), 16) / 255;
		const g = parseInt(hex.slice(3, 5), 16) / 255;
		const b = parseInt(hex.slice(5, 7), 16) / 255;
		const max = Math.max(r, g, b),
			min = Math.min(r, g, b);
		let h = 0,
			s = 0;
		const l = (max + min) / 2;
		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
					break;
				case g:
					h = ((b - r) / d + 2) / 6;
					break;
				case b:
					h = ((r - g) / d + 4) / 6;
					break;
			}
		}
		return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
	}

	function parseHsl(colorStr: string): [number, number, number] {
		const match = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
		return match
			? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
			: [0, 70, 50];
	}

	function parseDash(dash: string): [number, number] {
		const parts = dash.trim().split(/\s+/);
		return [parseFloat(parts[0]) || 1, parseFloat(parts[1]) || 0];
	}

	// ── Derived source-of-truth from item (used for the trigger swatch) ────────

	let hexColor = $derived(hslToHex(...parseHsl(item.colors.AVG)));

	// ── Popover open state — reset local edits when popover opens ─────────────

	let isOpen = $state(false);

	// ── Local editable state (initialised fresh each time popover opens) ───────

	let localH = $state(0);
	let localS = $state(0);
	let localL = $state(0);
	let localHex = $state('#000000');
	let localTick = $state(1);
	let localSpace = $state(0);

	function syncFromItem(): void {
		const [h, s, l] = parseHsl(item.colors.AVG);
		localH = h;
		localS = s;
		localL = l;
		localHex = hslToHex(h, s, l);
		const [tick, space] = parseDash(item.dash);
		localTick = tick;
		localSpace = space;
	}

	function handleOpenChange(open: boolean): void {
		isOpen = open;
		if (open) syncFromItem();
	}

	// ── Throttled update logic ─────────────────────────────────────────────────

	let colorTimer: ReturnType<typeof setTimeout> | null = null;
	let dashTimer: ReturnType<typeof setTimeout> | null = null;

	function isTargetType(): boolean {
		return item.type === 'target' || item.type === 'inserted-target';
	}

	function buildColors(nh: number, ns: number, nl: number): FRColors {
		if (isTargetType()) {
			return { AVG: `hsl(${nh}, ${ns}%, ${nl}%)` };
		}
		return {
			L: `hsl(${(nh - 10 + 360) % 360}, ${ns}%, ${nl}%)`,
			R: `hsl(${(nh + 10) % 360}, ${ns}%, ${nl}%)`,
			AVG: `hsl(${nh}, ${ns}%, ${nl}%)`
		};
	}

	function scheduleColorUpdate(nh: number, ns: number, nl: number): void {
		if (colorTimer !== null) clearTimeout(colorTimer);
		colorTimer = setTimeout(() => {
			dataProvider.updateColors(uuid, buildColors(nh, ns, nl));
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

	// ── Input handlers ─────────────────────────────────────────────────────────

	function onHexInput(e: Event): void {
		const value = (e.target as HTMLInputElement).value;
		localHex = value;
		if (/^#[0-9a-fA-F]{6}$/.test(value)) {
			const [nh, ns, nl] = hexToHsl(value);
			localH = nh;
			localS = ns;
			localL = nl;
			scheduleColorUpdate(nh, ns, nl);
		}
	}

	function onHslInput(): void {
		localHex = hslToHex(localH, localS, localL);
		scheduleColorUpdate(localH, localS, localL);
	}

	function onDashInput(): void {
		scheduleDashUpdate(localTick, localSpace);
	}

	function onRandom(): void {
		let nh: number, ns: number, nl: number;
		if (isTargetType()) {
			nh = Math.floor(Math.random() * 360);
			ns = 0;
			nl = 45;
		} else {
			nh = Math.floor(Math.random() * 360);
			ns = Math.floor(Math.random() * 51) + 50; // 50–100
			nl = Math.floor(Math.random() * 21) + 30; // 30–50
		}
		localH = nh;
		localS = ns;
		localL = nl;
		localHex = hslToHex(nh, ns, nl);
		scheduleColorUpdate(nh, ns, nl);
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
			class="z-50 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-xl"
		>
			<!-- Hex color input -->
			<div class="mb-3">
				<input
					id="{uuid}-color-hex"
					type="color"
					value={localHex}
					oninput={onHexInput}
					class="h-8 w-full cursor-pointer rounded border border-input p-0.5"
				/>
			</div>

			<!-- HSL inputs -->
			<div class="mb-3 flex items-center gap-2">
				<div class="flex flex-col items-center gap-0.5">
					<label
						for="{uuid}-hsl-h"
						class="text-xs text-muted"
					>{m.graph_color_wheel_label_hue()}</label>
					<input
						id="{uuid}-hsl-h"
						type="number"
						min="0"
						max="360"
						bind:value={localH}
						oninput={onHslInput}
						class="w-14 rounded border border-input px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label
						for="{uuid}-hsl-s"
						class="text-xs text-muted"
					>{m.graph_color_wheel_label_saturation()}</label>
					<input
						id="{uuid}-hsl-s"
						type="number"
						min="0"
						max="100"
						bind:value={localS}
						oninput={onHslInput}
						class="w-14 rounded border border-input px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label
						for="{uuid}-hsl-l"
						class="text-xs text-muted"
					>{m.graph_color_wheel_label_lightness()}</label>
					<input
						id="{uuid}-hsl-l"
						type="number"
						min="0"
						max="100"
						bind:value={localL}
						oninput={onHslInput}
						class="w-14 rounded border border-input px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
			</div>

			<!-- Dash inputs -->
			<div class="mb-3 flex items-center gap-2">
				<div class="flex flex-col items-center gap-0.5">
					<label
						for="{uuid}-dash-tick"
						class="text-xs text-muted"
					>{m.graph_color_wheel_label_tick()}</label>
					<input
						id="{uuid}-dash-tick"
						type="number"
						min="0"
						step="0.5"
						bind:value={localTick}
						oninput={onDashInput}
						class="w-14 rounded border border-input px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
				<div class="flex flex-col items-center gap-0.5">
					<label
						for="{uuid}-dash-space"
						class="text-xs text-muted"
					>{m.graph_color_wheel_label_space()}</label>
					<input
						id="{uuid}-dash-space"
						type="number"
						min="0"
						step="0.5"
						bind:value={localSpace}
						oninput={onDashInput}
						class="w-14 rounded border border-input px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
					/>
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex items-center justify-between gap-2">
				<button
					onclick={onRandom}
					class="rounded bg-surface-hover px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-handle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				>
					{m.graph_color_wheel_btn_random()}
				</button>

				<Popover.Close>
					{#snippet child({ props })}
						<button
							{...props}
							class="rounded bg-surface-hover px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-handle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
						>
							{m.graph_color_wheel_btn_close()}
						</button>
					{/snippet}
				</Popover.Close>
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

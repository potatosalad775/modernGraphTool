<script lang="ts">
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import FRParser from '$lib/utils/fr-parser.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import { FileUp } from '@lucide/svelte';
	import type { ChannelData, ParsedFRData } from '$lib/types/data-types.js';

	let phoneInputEl = $state<HTMLInputElement | undefined>(undefined);
	let targetInputEl = $state<HTMLInputElement | undefined>(undefined);

	/** Trailing L/R channel marker: a space, underscore, or dash delimiter + L or R. */
	const CHANNEL_MARKER = /^(.+?)[\s_-]([LR])$/i;

	/** Strip the file extension (e.g. "Foo L.txt" -> "Foo L"). */
	function stripExtension(name: string): string {
		return name.replace(/\.[^/.]+$/, '');
	}

	/** Split a filename into its device base name and an optional L/R channel marker. */
	function parseChannelName(name: string): { base: string; channel: 'L' | 'R' | null } {
		const stem = stripExtension(name);
		const match = stem.match(CHANNEL_MARKER);
		if (match) return { base: match[1].trim(), channel: match[2].toUpperCase() as 'L' | 'R' };
		return { base: stem, channel: null };
	}

	/** Parse a file's text into channel data, rejecting files with no usable points. */
	async function parseFile(file: File): Promise<ChannelData> {
		const parsed = await FRParser.parseFRData(await file.text());
		if (!parsed.data.length) throw new Error('No valid data points');
		return parsed;
	}

	/** Pluralized success toast: keep the device name when only one was loaded. */
	function reportLoaded(names: string[], noun: string) {
		if (names.length === 1) toast.success(`Loaded ${names[0]}`);
		else if (names.length > 1) toast.success(`Loaded ${names.length} ${noun}s`);
	}

	async function handlePhoneUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length) return;

		// Group channel-marked files by base name (e.g. "Foo L.txt" + "Foo R.txt" -> "Foo").
		// Files without an L/R marker stay standalone and render as a single mono curve.
		const pairs: Record<string, { L?: File; R?: File }> = {};
		const standalone: { base: string; file: File }[] = [];
		for (const file of files) {
			const { base, channel } = parseChannelName(file.name);
			if (channel) {
				(pairs[base] ??= {})[channel] = file;
			} else {
				standalone.push({ base, file });
			}
		}

		const loaded: string[] = [];

		// Paired (L+R) and single-channel (L or R only) devices.
		for (const [base, { L, R }] of Object.entries(pairs)) {
			try {
				const channels: ParsedFRData = {};
				if (L) channels.L = await parseFile(L);
				if (R) channels.R = await parseFile(R);
				if (channels.L && channels.R) {
					channels.AVG = FRParser._computeAvgChannel(channels.L, channels.R);
				}
				// Let insertRawFRData derive dispChannel (both channels for the first phone,
				// AVG thereafter — matching operator-hosted phones).
				await dataProvider.insertRawFRData('phone', base, channels, { dispSuffix: 'Uploaded' });
				loaded.push(base);
			} catch (err) {
				console.error(`GraphUploader: failed to upload ${base}`, err);
				toast.error(`Failed to load ${base}`, {
					description: err instanceof Error ? err.message : 'Invalid format'
				});
			}
		}

		// Unmarked files: one mono AVG curve each.
		for (const { base, file } of standalone) {
			try {
				const parsed = await parseFile(file);
				await dataProvider.insertRawFRData(
					'phone',
					base,
					{ AVG: parsed },
					{
						dispSuffix: 'Uploaded',
						dispChannel: ['AVG']
					}
				);
				loaded.push(base);
			} catch (err) {
				console.error(`GraphUploader: failed to upload ${base}`, err);
				toast.error(`Failed to load ${base}`, {
					description: err instanceof Error ? err.message : 'Invalid format'
				});
			}
		}

		reportLoaded(loaded, 'measurement');
	}

	async function handleTargetUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length) return;

		const loaded: string[] = [];
		for (const file of files) {
			const base = stripExtension(file.name);
			try {
				const parsed = await parseFile(file);
				await dataProvider.insertRawFRData(
					'target',
					base,
					{ AVG: parsed },
					{
						dispSuffix: 'Uploaded',
						dispChannel: ['AVG']
					}
				);
				loaded.push(base);
			} catch (err) {
				console.error(`GraphUploader: failed to upload ${base}`, err);
				toast.error(`Failed to load ${base}`, {
					description: err instanceof Error ? err.message : 'Invalid format'
				});
			}
		}

		reportLoaded(loaded, 'target');
	}
</script>

<div class="flex gap-2">
	<Button
		title={m.graph_uploader_upload_fr()}
		onclick={() => phoneInputEl?.click()}
		variant="outline"
		size="sm"
		class="flex-1"
	>
		<FileUp class="mr-1.5 size-3.5" />
		{m.graph_uploader_upload_fr()}
	</Button>
	<Button
		title={m.graph_uploader_upload_target()}
		onclick={() => targetInputEl?.click()}
		variant="outline"
		size="sm"
		class="flex-1"
	>
		<FileUp class="mr-1.5 size-3.5" />
		{m.graph_uploader_upload_target()}
	</Button>
	<input
		bind:this={phoneInputEl}
		type="file"
		accept=".txt"
		multiple
		class="hidden"
		onchange={handlePhoneUpload}
	/>
	<input
		bind:this={targetInputEl}
		type="file"
		accept=".txt"
		multiple
		class="hidden"
		onchange={handleTargetUpload}
	/>
</div>

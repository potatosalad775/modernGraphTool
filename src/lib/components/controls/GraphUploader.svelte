<script lang="ts">
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import FRParser from '#lib/utils/fr-parser.js';
	import { toast } from '#lib/services/toast.js';
	import * as m from '#lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import { FileUp } from '@lucide/svelte';
	import type { ChannelData, ParsedFRData } from '#lib/types/data-types.js';

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
		const match = CHANNEL_MARKER.exec(stem);
		if (match) return { base: match[1].trim(), channel: match[2].toUpperCase() as 'L' | 'R' };
		return { base: stem, channel: null };
	}

	/**
	 * A file over this size is rejected before it is read. A real FR export is a few tens of KB, so
	 * 5 MB is generous; the cap is there so a wrong pick (a video, a disk image) cannot be loaded
	 * into memory and tokenized on the main thread.
	 */
	const MAX_FILE_BYTES = 5 * 1024 * 1024;
	const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);

	/**
	 * Files per selection. An L/R pair is two files, so this is about twenty devices at once, well
	 * past what anyone compares on one graph, and each file is still parsed in turn.
	 */
	const MAX_FILES = 40;

	/** A file that parsed to no usable points; shown translated rather than by its message. */
	class NoDataError extends Error {}

	/** A file over {@link MAX_FILE_BYTES}; carries its name for the toast. */
	class FileTooLargeError extends Error {
		fileName: string;
		constructor(fileName: string) {
			super(`${fileName} is too large`);
			this.fileName = fileName;
		}
	}

	/** Parse a file's text into channel data, rejecting files with no usable points. */
	async function parseFile(file: File): Promise<ChannelData> {
		if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.name);
		const parsed = await FRParser.parseFRData(await file.text());
		if (!parsed.data.length) throw new NoDataError('No valid data points');
		return parsed;
	}

	/** One toast per failed device, or per oversized file. */
	function reportFailure(base: string, err: unknown) {
		console.error(`GraphUploader: failed to upload ${base}`, err);
		if (err instanceof FileTooLargeError) {
			toast.error(m.graph_uploader_too_large({ name: err.fileName, size: MAX_FILE_MB }));
			return;
		}
		toast.error(m.graph_uploader_failed({ name: base }), {
			description:
				err instanceof NoDataError
					? m.graph_uploader_no_data()
					: err instanceof Error
						? err.message
						: m.graph_uploader_invalid_format()
		});
	}

	/** Success toast: keep the device name when only one was loaded. */
	function reportLoaded(names: string[], kind: 'measurement' | 'target') {
		if (names.length === 1) toast.success(m.graph_uploader_loaded_one({ name: names[0] }));
		else if (names.length > 1) {
			const count = names.length;
			toast.success(
				kind === 'target'
					? m.graph_uploader_loaded_targets({ count })
					: m.graph_uploader_loaded_measurements({ count })
			);
		}
	}

	/** Whether a selection is small enough to process; says so when it is not. */
	function withinFileLimit(files: File[]): boolean {
		if (files.length <= MAX_FILES) return true;
		toast.error(m.graph_uploader_too_many({ count: files.length, limit: MAX_FILES }));
		return false;
	}

	async function handlePhoneUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length || !withinFileLimit(files)) return;

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
					channels.AVG = FRParser.computeAvgChannel(channels.L, channels.R);
				}
				// Let insertRawFRData derive dispChannel (both channels for the first phone,
				// AVG thereafter — matching operator-hosted phones).
				dataProvider.insertRawFRData('phone', base, channels, { dispSuffix: 'Uploaded' });
				loaded.push(base);
			} catch (err) {
				reportFailure(base, err);
			}
		}

		// Unmarked files: one mono AVG curve each.
		for (const { base, file } of standalone) {
			try {
				const parsed = await parseFile(file);
				dataProvider.insertRawFRData(
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
				reportFailure(base, err);
			}
		}

		reportLoaded(loaded, 'measurement');
	}

	async function handleTargetUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (!files.length || !withinFileLimit(files)) return;

		const loaded: string[] = [];
		for (const file of files) {
			const base = stripExtension(file.name);
			try {
				const parsed = await parseFile(file);
				dataProvider.insertRawFRData(
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
				reportFailure(base, err);
			}
		}

		reportLoaded(loaded, 'target');
	}
</script>

<div class="flex gap-2">
	<Button
		label={m.graph_uploader_upload_fr()}
		onclick={() => phoneInputEl?.click()}
		variant="outline"
		size="sm"
		class="flex-1"
	>
		{#snippet icon()}<FileUp class="mr-1.5 size-3.5" />{/snippet}
	</Button>
	<Button
		label={m.graph_uploader_upload_target()}
		onclick={() => targetInputEl?.click()}
		variant="outline"
		size="sm"
		class="flex-1"
	>
		{#snippet icon()}<FileUp class="mr-1.5 size-3.5" />{/snippet}
	</Button>
	<input
		bind:this={phoneInputEl}
		type="file"
		accept=".txt,.csv"
		multiple
		class="hidden"
		onchange={handlePhoneUpload}
	/>
	<input
		bind:this={targetInputEl}
		type="file"
		accept=".txt,.csv"
		multiple
		class="hidden"
		onchange={handleTargetUpload}
	/>
</div>

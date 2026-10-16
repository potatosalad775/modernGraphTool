import type { ChannelData, FRDataObject } from '#lib/types/data-types.js';

const CHANNEL_ORDER = ['L', 'R', 'AVG'] as const;

export interface DownloadPayload {
	filename: string;
	text: string;
}

/** One CrinGraph-style "Frequency\tdB" text payload, matching what FRParser.parseFRData reads back. */
function encodeChannel(data: ChannelData['data']): string {
	const lines = data.map(([freq, db]) => `${freq.toFixed(2)}\t${db.toFixed(2)}`);
	return `Frequency\tdB\n${lines.join('\n')}\n`;
}

/**
 * Replaces characters a filename can't hold. Device names do carry them —
 * `HD650/HD6XX` is one — and inside a zip a `/` silently becomes a folder.
 */
function safeFileName(name: string): string {
	// eslint-disable-next-line no-control-regex
	return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
}

/** "Name Suffix", the stem every file of `item` shares. */
export function downloadBaseName(item: FRDataObject): string {
	return safeFileName([item.identifier, item.dispSuffix].filter(Boolean).join(' ').trim());
}

/**
 * Builds one downloadable .txt payload per channel currently displayed on the
 * graph (`item.dispChannel`) — not every channel `item.channels` happens to
 * hold, since e.g. a phone with both L and R loaded may only have AVG shown.
 * Reads straight from `item.channels`, whatever DataProvider last wrote there,
 * so smoothing, normalization, target adjustments and EQ are already baked in.
 * For a sample set that is the average across runs. Filenames follow the
 * "Name Suffix L.txt" convention the phone_book.json dialect itself uses.
 */
export function encodeFRDataForDownload(item: FRDataObject): DownloadPayload[] {
	const base = downloadBaseName(item);
	return CHANNEL_ORDER.filter((ch) => item.dispChannel.includes(ch) && item.channels[ch]).map(
		(ch) => ({
			filename: `${base} ${ch}.txt`,
			text: encodeChannel(item.channels[ch]!.data)
		})
	);
}

/**
 * One payload per run of a sample set, on the same displayed channels as the
 * average — the channel picker decides channels, not which runs are drawn.
 * Runs are processed alongside the average (one pooled normalization offset),
 * so they line up with it. A run is named by its curator `label`, else by
 * `fallbackLabel(index)`: "Name Suffix - Pad A L.txt".
 */
export function encodeSampleRunsForDownload(
	item: FRDataObject,
	fallbackLabel: (index: number) => string = (i) => `Sample ${i + 1}`
): DownloadPayload[] {
	const base = downloadBaseName(item);
	return (item.samples ?? []).flatMap((run, i) => {
		const label = safeFileName(run.label ?? fallbackLabel(i));
		return CHANNEL_ORDER.filter((ch) => item.dispChannel.includes(ch) && run[ch]).map((ch) => ({
			filename: `${base} - ${label} ${ch}.txt`,
			text: encodeChannel(run[ch]!.data)
		}));
	});
}

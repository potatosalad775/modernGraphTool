import type { ChannelData, FRDataObject } from '$lib/types/data-types.js';

const CHANNEL_ORDER = ['L', 'R', 'AVG'] as const;

/** One CrinGraph-style "Frequency\tdB" text payload, matching what FRParser.parseFRData reads back. */
function encodeChannel(data: ChannelData['data']): string {
	const lines = data.map(([freq, db]) => `${freq.toFixed(2)}\t${db.toFixed(2)}`);
	return `Frequency\tdB\n${lines.join('\n')}\n`;
}

/**
 * Builds one downloadable .txt payload per channel currently displayed on the
 * graph (`item.dispChannel`) — not every channel `item.channels` happens to
 * hold, since e.g. a phone with both L and R loaded may only have AVG shown.
 * Reads straight from `item.channels`, whatever DataProvider last wrote there,
 * so smoothing, normalization, target adjustments and EQ are already baked in.
 * Filenames follow the "Name Suffix L.txt" convention the phone_book.json
 * dialect itself uses.
 */
export function encodeFRDataForDownload(item: FRDataObject): { filename: string; text: string }[] {
	const base = [item.identifier, item.dispSuffix].filter(Boolean).join(' ').trim();
	return CHANNEL_ORDER.filter((ch) => item.dispChannel.includes(ch) && item.channels[ch]).map(
		(ch) => ({
			filename: `${base} ${ch}.txt`,
			text: encodeChannel(item.channels[ch]!.data)
		})
	);
}

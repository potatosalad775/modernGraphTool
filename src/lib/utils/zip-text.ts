/**
 * Packs text files into one .zip. Several files from one click go out as a
 * single download: browsers ask before a page fires a burst of them, and a
 * sample set's runs are easily ten files or more.
 *
 * fflate is imported on demand so it never lands in the boot bundle.
 * Duplicate names get " (2)", " (3)", … before the extension — two runs may
 * share a curator label, and a zip silently keeps only one of the pair.
 */
export async function zipTextFiles(files: { filename: string; text: string }[]): Promise<Blob> {
	const { zipSync, strToU8 } = await import('fflate');
	const entries: Record<string, Uint8Array> = {};
	for (const { filename, text } of files) {
		entries[uniqueName(filename, entries)] = strToU8(text);
	}
	return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

function uniqueName(filename: string, taken: Record<string, unknown>): string {
	if (!(filename in taken)) return filename;
	const dot = filename.lastIndexOf('.');
	const [stem, ext] = dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, ''];
	let n = 2;
	while (`${stem} (${n})${ext}` in taken) n++;
	return `${stem} (${n})${ext}`;
}

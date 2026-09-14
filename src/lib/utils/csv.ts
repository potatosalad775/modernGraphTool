/**
 * RFC 4180 CSV parsing.
 *
 * Handles quoted fields, escaped quotes, embedded newlines and CRLF or LF line
 * endings. A ranking sheet's `Pros` / `Cons` cells routinely contain one item
 * per line inside a single quoted field, so a `split(',')` shortcut mangles
 * real operator data on the first row it meets.
 *
 * Ported from squigRanking's `src/csv.ts` — the two parse the same published
 * sheets and have to read them identically.
 */

/** A parsed CSV record: trimmed header name -> trimmed cell value. */
export type CsvRow = Record<string, string>;

/** Split CSV text into a grid of raw cells. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	let cellStarted = false;

	const endCell = (): void => {
		row.push(cell);
		cell = '';
		cellStarted = false;
	};
	const endRow = (): void => {
		endCell();
		rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cell += ch;
			}
			continue;
		}
		if (ch === '"' && !cellStarted) {
			inQuotes = true;
			cellStarted = true;
			continue;
		}
		if (ch === ',') {
			endCell();
			continue;
		}
		if (ch === '\r') {
			if (text[i + 1] === '\n') i++;
			endRow();
			continue;
		}
		if (ch === '\n') {
			endRow();
			continue;
		}
		cell += ch;
		cellStarted = true;
	}
	// Trailing cell, unless the input ended exactly on a row terminator.
	if (cell !== '' || row.length) endRow();
	return rows;
}

/** Parse CSV text into objects keyed by trimmed header name, skipping blank rows. */
export function csvToRows(text: string): CsvRow[] {
	const grid = parseCsv(text);
	const header = grid[0];
	if (!header) return [];
	const keys = header.map((h) => h.trim());
	return grid
		.slice(1)
		.filter((cells) => cells.some((cell) => cell.trim().length > 0))
		.map((cells) => {
			const row: CsvRow = {};
			keys.forEach((key, i) => {
				if (!key) return;
				row[key] = (cells[i] ?? '').trim();
			});
			return row;
		});
}

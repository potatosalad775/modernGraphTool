/**
 * What a built chunk is made of, from its source map.
 *
 *   npx vite build --sourcemap
 *   node scripts/bench-startup/bundle-report.mjs [<chunk.js>] [--top 30]
 *   node scripts/bench-startup/bundle-report.mjs --resolve <chunk.js>:<line>:<column> ...
 *
 * Without a path it reports the largest chunk in dist/. `--resolve` maps positions from
 * trace.mjs back to source instead. Svelte templates carry no mappings, so about a third
 * of the app chunk shows up as unmapped: that part is component markup, not a dependency.
 * Rebuild without `--sourcemap` afterwards, or dist/ ships the maps.
 */
import { decode } from '@jridgewell/sourcemap-codec';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { REPO, flag, option } from './common.mjs';

const CHUNKS = join(REPO, 'dist/_app/immutable/chunks');

function readMap(chunk) {
	const map = JSON.parse(readFileSync(`${chunk}.map`, 'utf8'));
	return { map, lines: decode(map.mappings) };
}

const tidy = (source) =>
	String(source)
		.replace(/\\/g, '/')
		.replace(/^(\.\.\/)+/, '');

if (flag('resolve')) {
	const maps = new Map();
	for (const ref of process.argv.slice(process.argv.indexOf('--resolve') + 1)) {
		const [file, line, column] = ref.split(':');
		if (!maps.has(file)) maps.set(file, readMap(join(CHUNKS, file)));
		const { map, lines } = maps.get(file);
		// Trace positions are 1-based; the last segment at or before the column is the hit.
		const segment = (lines[Number(line) - 1] ?? []).findLast(
			(s) => s[0] <= Number(column) - 1 && s.length >= 4
		);
		const where = segment ? `${tidy(map.sources[segment[1]])}:${segment[2] + 1}` : 'unmapped';
		console.log(`${ref} -> ${where}`);
	}
} else {
	const args = process.argv
		.slice(2)
		.filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--top');
	const chunk =
		args[0] ??
		readdirSync(CHUNKS)
			.filter((f) => f.endsWith('.js'))
			.map((f) => join(CHUNKS, f))
			.sort((a, b) => statSync(b).size - statSync(a).size)[0];
	const code = readFileSync(chunk, 'utf8').split('\n');
	const { map, lines } = readMap(chunk);
	const total = code.reduce((n, line) => n + line.length, 0);

	const bySource = new Map();
	let unmapped = 0;
	lines.forEach((segments, lineNo) => {
		const length = (code[lineNo] ?? '').length;
		if (!segments.length) {
			unmapped += length;
			return;
		}
		unmapped += segments[0][0];
		segments.forEach((segment, i) => {
			const size = (i + 1 < segments.length ? segments[i + 1][0] : length) - segment[0];
			if (segment.length < 4) unmapped += size;
			else {
				const source = tidy(map.sources[segment[1]]);
				bySource.set(source, (bySource.get(source) ?? 0) + size);
			}
		});
	});

	/** A package for dependencies, a directory for our own code. */
	const group = (source) => {
		const at = source.lastIndexOf('node_modules/');
		if (at !== -1) {
			const parts = source.slice(at + 13).split('/');
			return `npm: ${parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]}`;
		}
		const lib = source.match(/src\/lib\/([^/]+)(?:\/([^/]+))?/);
		if (!lib) return source;
		return lib[1] === 'components' ? `src/lib/components/${lib[2]}` : `src/lib/${lib[1]}`;
	};
	const byGroup = new Map();
	for (const [source, size] of bySource) {
		byGroup.set(group(source), (byGroup.get(group(source)) ?? 0) + size);
	}

	const top = Number(option('top', '30'));
	const row = (size, name) =>
		`${String(size).padStart(8)}  ${((size / total) * 100).toFixed(1).padStart(5)}%  ${name}`;
	console.log(`${basename(chunk)}: ${total} characters`);
	console.log(row(unmapped, '(unmapped: Svelte templates and glue)'));
	const groups = [...byGroup].sort((a, b) => b[1] - a[1]);
	for (const [name, size] of groups.slice(0, top)) console.log(row(size, name));
	console.log('\nLargest single files:');
	const files = [...bySource].sort((a, b) => b[1] - a[1]);
	for (const [name, size] of files.slice(0, 20)) console.log(row(size, name));
}

/**
 * Writes the minified cdn/loader.js that the cdn branch publishes.
 *
 * Usage: node scripts/minify-loader.js <output file>
 *
 * Every CDN visit fetches the loader before anything else, and minified it is under half the
 * size on the wire. cdn/loader.js stays the readable source, and local testing
 * (cdn-index.html on localhost) keeps loading it as written. pins.json hashes the published
 * file, so pinning is unaffected. Not jsDelivr's own `loader.min.js`: that is minified on
 * request, and its bytes are not promised to stay the same.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { minifySync } from 'vite';

const out = process.argv[2];
if (!out) {
	console.error('Usage: node scripts/minify-loader.js <output file>');
	process.exit(1);
}

const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'cdn', 'loader.js');
const input = readFileSync(source, 'utf-8');
const { code, errors } = minifySync('loader.js', input);
if (errors?.length || !code) {
	console.error('Could not minify cdn/loader.js:', errors);
	process.exit(1);
}

const banner =
	'/* modernGraphTool CDN loader. Source: ' +
	'https://github.com/potatosalad775/modernGraphTool/blob/main/cdn/loader.js */\n';
writeFileSync(out, banner + code);
console.log(`Minified loader: ${input.length} -> ${banner.length + code.length} bytes (${out})`);

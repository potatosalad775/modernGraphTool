/**
 * Assembles the sites the startup benchmark compares, all with identical data.
 *
 *   node scripts/bench-startup/setup.mjs forks
 *       Clones squiglink `lab` (branch `pink-eq`) and HarutoHiroki's PublicGraphTool
 *       (`squiglink-(main)`) if they are not there yet, and builds sites `lab` and `pgt`.
 *   node scripts/bench-startup/setup.mjs mgt <name> [<dist dir>]
 *       Copies a modernGraphTool build (default: ./dist) to site <name>. Run it once per
 *       build to compare, e.g. `mgt before` on main and `mgt after` on a branch.
 *
 * Run `forks` first: it also writes the phone book every site shares.
 */
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO, SITES, WORK } from './common.mjs';

const INITIAL_PHONE = 'BKF';
const INITIAL_TARGET = 'Banbeucmas';
const FORKS = {
	lab: ['https://github.com/squiglink/lab', 'pink-eq'],
	pgt: ['https://github.com/HarutoHiroki/PublicGraphTool', 'squiglink-(main)']
};

const phonesDir = join(REPO, 'defaults/data/phones');
const targetDir = join(REPO, 'defaults/data/target');
const sharedBook = join(SITES, '_data/phone_book.json');
const bigBook = join(SITES, '_data/phone_book_big.json');

function patch(file, edits) {
	let text = readFileSync(file, 'utf8');
	for (const [from, to] of edits) {
		const next = text.replace(from, to);
		if (next === text) throw new Error(`${file}: nothing matched ${from}`);
		text = next;
	}
	writeFileSync(file, text);
}

/**
 * The book every site reads: lab's CrinGraph-dialect sample, without the entries whose
 * files modernGraphTool's sample data lacks. A second book repeats those files under
 * 1500 made-up names, for the cost of a database of realistic size.
 */
function writeBooks(labDir) {
	const book = JSON.parse(readFileSync(join(labDir, 'data/phone_book.json'), 'utf8'));
	const has = (file) => existsSync(join(phonesDir, `${file} L.txt`));
	for (const brand of book) {
		brand.phones = brand.phones.filter((phone) =>
			(typeof phone === 'string' ? [phone] : [].concat(phone.file ?? phone.name)).every(has)
		);
	}
	const kept = book.filter((brand) => brand.phones.length);
	mkdirSync(join(SITES, '_data'), { recursive: true });
	writeFileSync(sharedBook, JSON.stringify(kept));

	const files = kept.flatMap((brand) => brand.phones.filter((p) => typeof p === 'string'));
	const big = [...kept];
	for (let b = 0; b < 60; b++) {
		const phones = [];
		for (let i = 0; i < 25; i++) {
			phones.push({
				name: `Model ${b}-${i} Pro`,
				file: files[(b * 25 + i) % files.length],
				reviewScore: String(1 + (i % 5)),
				price: `$${50 + i * 7}`,
				reviewLink: `https://example.com/review/${b}/${i}`,
				shopLink: `https://example.com/shop/${b}/${i}`
			});
		}
		big.push({ name: `Brand${b}`, phones });
	}
	writeFileSync(bigBook, JSON.stringify(big));
}

function forks() {
	const src = join(WORK, 'forks');
	mkdirSync(src, { recursive: true });
	for (const [name, [url, branch]] of Object.entries(FORKS)) {
		if (existsSync(join(src, name))) continue;
		console.log(`cloning ${url} (${branch})`);
		execFileSync('git', ['clone', '-q', '--depth', '1', '-b', branch, url, join(src, name)], {
			stdio: 'inherit'
		});
	}
	writeBooks(join(src, 'lab'));

	for (const name of Object.keys(FORKS)) {
		const dest = join(SITES, name);
		rmSync(dest, { recursive: true, force: true });
		cpSync(join(src, name), dest, {
			recursive: true,
			filter: (path) => !/[\\/](\.git|data|data_hp)$/.test(path)
		});
		// CrinGraph keeps devices and targets in one flat folder.
		const data = join(dest, 'data');
		mkdirSync(data, { recursive: true });
		cpSync(phonesDir, data, { recursive: true });
		cpSync(targetDir, data, { recursive: true });
		cpSync(sharedBook, join(data, 'phone_book.json'));
	}
	// PublicGraphTool looks in data/targets/ first; without it every target costs a 404.
	cpSync(targetDir, join(SITES, 'pgt/data/targets'), { recursive: true });
	// lab takes d3 and fuse from public CDNs, which the benchmark blocks. PublicGraphTool
	// vendors the same files, so lab gets local copies: this favours lab, if anything.
	for (const file of ['d3.v5.min.js', 'd3-selection-multi.v1.min.js', 'fuse.min.js']) {
		cpSync(join(src, 'pgt/assets/js', file), join(SITES, 'lab', file));
	}
	patch(join(SITES, 'lab/index.html'), [
		['https://d3js.org/d3.v5.min.js', 'd3.v5.min.js'],
		['https://d3js.org/d3-selection-multi.v1.min.js', 'd3-selection-multi.v1.min.js'],
		['https://cdnjs.cloudflare.com/ajax/libs/fuse.js/3.4.4/fuse.min.js', 'fuse.min.js']
	]);
	const initial = `init_phones = ["${INITIAL_PHONE}", "${INITIAL_TARGET} Target"]`;
	patch(join(SITES, 'lab/config.js'), [
		[/init_phones = \[[^\]]*\]/, initial],
		['DIR = "/data/"', 'DIR = "data/"']
	]);
	patch(join(SITES, 'pgt/assets/js/config.js'), [[/init_phones = \[[^\]]*\]/, initial]]);
	console.log(`sites lab and pgt are in ${SITES}`);
}

function mgt(name, dist) {
	if (!existsSync(sharedBook)) throw new Error('Run `setup.mjs forks` first.');
	if (!existsSync(join(dist, 'index.html'))) throw new Error(`No build in ${dist}`);
	const dest = join(SITES, name);
	rmSync(dest, { recursive: true, force: true });
	cpSync(dist, dest, { recursive: true });
	const data = join(dest, 'data');
	rmSync(data, { recursive: true, force: true });
	mkdirSync(data, { recursive: true });
	cpSync(phonesDir, join(data, 'phones'), { recursive: true });
	cpSync(targetDir, join(data, 'target'), { recursive: true });
	for (const file of readdirSync(join(REPO, 'defaults/data'))) {
		if (file.endsWith('.txt')) cpSync(join(REPO, 'defaults/data', file), join(data, file));
	}
	cpSync(sharedBook, join(data, 'phone_book.json'));
	patch(join(dest, 'config.js'), [
		[/INITIAL_PHONES: \[[^\]]*\]/, `INITIAL_PHONES: ['${INITIAL_PHONE}']`],
		[/INITIAL_TARGETS: \[[^\]]*\]/, `INITIAL_TARGETS: ['${INITIAL_TARGET}']`]
	]);
	console.log(`site ${name} is in ${dest}`);
}

const [mode, name, dist] = process.argv.slice(2);
if (mode === 'forks') forks();
else if (mode === 'mgt' && name) mgt(name, resolve(dist ?? join(REPO, 'dist')));
else {
	console.error('Usage: setup.mjs forks | setup.mjs mgt <name> [<dist dir>]');
	process.exit(1);
}

/**
 * CDN build orchestrator.
 *
 * 1. Reads version from package.json
 * 2. Runs `vite build` with MGT_CDN_BASE pointing to the jsDelivr CDN URL
 *    (SvelteKit always writes to dist/, so we move the output afterward)
 * 3. Generates boot.json from the built index.html
 * 4. Copies the cdn-index.html template
 *
 * Usage: node scripts/build-cdn.js [--base <cdn-base-url>]
 *
 * If --base is omitted, defaults to:
 *   https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/v{version}
 */

import { execSync } from 'child_process';
import { readFileSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

// Parse --base flag
let cdnBase;
const baseIdx = process.argv.indexOf('--base');
if (baseIdx !== -1 && process.argv[baseIdx + 1]) {
	cdnBase = process.argv[baseIdx + 1];
} else {
	cdnBase = `https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/v${version}`;
}

const distDir = join(root, 'dist');
const cdnOutDir = join(root, 'dist-cdn');
const distBackup = join(root, 'dist-backup');

console.log(`\n--- CDN Build ---`);
console.log(`Version:  ${version}`);
console.log(`CDN Base: ${cdnBase}`);
console.log(`Output:   ${cdnOutDir}\n`);

// Step 1: Back up existing dist/ if it exists
const hadDist = existsSync(distDir);
if (hadDist) {
	console.log('Backing up existing dist/...');
	if (existsSync(distBackup)) rmSync(distBackup, { recursive: true });
	renameSync(distDir, distBackup);
}

try {
	// Step 2: Run vite build with CDN base URL (outputs to dist/ per SvelteKit config)
	console.log('Building with CDN asset paths...');
	execSync(`npx vite build`, {
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, MGT_CDN_BASE: cdnBase }
	});

	// Step 3: Move dist/ to dist-cdn/
	if (existsSync(cdnOutDir)) rmSync(cdnOutDir, { recursive: true });
	renameSync(distDir, cdnOutDir);

	// Step 4: Generate boot.json
	console.log('\nGenerating boot.json...');
	execSync(`node scripts/generate-boot-manifest.js dist-cdn ${version}`, {
		cwd: root,
		stdio: 'inherit'
	});

	// Step 5: Copy cdn-index.html if it exists
	const cdnIndexSrc = join(root, 'cdn', 'cdn-index.html');
	if (existsSync(cdnIndexSrc)) {
		copyFileSync(cdnIndexSrc, join(cdnOutDir, 'cdn-index.html'));
		console.log('Copied cdn-index.html to dist-cdn/');
	}

	console.log(`\n--- CDN Build Complete ---`);
	console.log(`Output in: dist-cdn/`);
	console.log(`\nFor deployment, push dist-cdn/_app/ and dist-cdn/boot.json`);
	console.log(`to the cdn branch under v${version}/`);
} finally {
	// Step 6: Restore original dist/
	if (hadDist && existsSync(distBackup)) {
		console.log('\nRestoring original dist/...');
		if (existsSync(distDir)) rmSync(distDir, { recursive: true });
		renameSync(distBackup, distDir);
	}
}

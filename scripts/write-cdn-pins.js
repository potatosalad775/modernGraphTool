/**
 * Records what an operator needs to pin one CDN release, in pins.json on the cdn branch.
 *
 * Usage (from the cdn branch worktree): node write-cdn-pins.js <version> <commit> <repo>
 *
 * <commit> is the commit that holds this release's loader.js and boot.json. pins.json is
 * committed after it, since a commit cannot name itself. Each entry carries that commit and the
 * sha384 of both files, which is everything the "Pinning a release" section of the CDN
 * deployment docs asks the operator to copy. Under GitHub Actions the ready-made snippet is also
 * appended to the job summary.
 */

import { createHash } from 'crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';

const [version, commit, repo] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !/^[0-9a-f]{40}$/.test(commit ?? '') || !repo) {
	console.error('Usage: node write-cdn-pins.js <version> <commit sha> <owner/repo>');
	process.exit(1);
}

const sri = (file) => `sha384-${createHash('sha384').update(readFileSync(file)).digest('base64')}`;

let pins = {};
if (existsSync('pins.json')) {
	try {
		const parsed = JSON.parse(readFileSync('pins.json', 'utf-8'));
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) pins = parsed;
	} catch (e) {
		console.warn('pins.json was unparseable, starting fresh:', e.message);
	}
}

const pin = {
	commit,
	loader_integrity: sri('loader.js'),
	boot_integrity: sri(`v${version}/boot.json`)
};
pins[version] = pin;
writeFileSync('pins.json', JSON.stringify(pins, null, 2) + '\n');

const base = `https://cdn.jsdelivr.net/gh/${repo}@${commit}`;
const fence = '```';
const summary = `### Pinning v${version}

index.html:

${fence}html
<script
  src="${base}/loader.js"
  integrity="${pin.loader_integrity}"
  crossorigin="anonymous"
></script>
${fence}

config.js:

${fence}javascript
CDN_MODE: {
  BASE: "${base}",
  VERSION: "${version}",
  BOOT_INTEGRITY: "${pin.boot_integrity}",
},
${fence}
`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

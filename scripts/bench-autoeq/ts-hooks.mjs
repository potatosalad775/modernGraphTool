// Lets plain Node import the app's own TypeScript: `$lib/` resolves to src/lib/, and the
// `.js` specifiers the sources use resolve to the `.ts` file beside them. Node strips the
// types itself (v22.18+), so the harness runs the shipped modules rather than copies.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = new URL('../../src/lib/', import.meta.url);

export async function resolve(specifier, context, next) {
	let spec = specifier;
	if (spec.startsWith('$lib/')) spec = new URL(spec.slice(5), LIB).href;
	if (spec.endsWith('.js') && (spec.startsWith('.') || spec.startsWith('file:'))) {
		const ts = new URL(spec.replace(/\.js$/, '.ts'), context.parentURL);
		if (existsSync(fileURLToPath(ts))) return next(pathToFileURL(fileURLToPath(ts)).href, context);
	}
	return next(spec, context);
}

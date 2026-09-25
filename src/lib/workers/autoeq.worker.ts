/**
 * Message shim. Everything that decides what a fit means lives in
 * `autoeq-engine.ts`, which is testable without a worker; this file only moves
 * messages across the boundary.
 */

import { runAutoEq } from './autoeq-engine.js';
import type { AutoEqRequest } from './autoeq-request.js';

self.onmessage = async (e: MessageEvent) => {
	const { type, id, source, target, request } = e.data as {
		type: string;
		id: number;
		source: [number, number][];
		target: [number, number][];
		request: AutoEqRequest;
	};
	if (type !== 'run-autoeq') return;

	try {
		const t0 = performance.now();
		const outcome = await runAutoEq(source, target, request);
		const elapsedMs = performance.now() - t0;
		self.postMessage({ type: 'autoeq-result', id, elapsedMs, ...outcome });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		self.postMessage({ type: 'autoeq-error', id, error: message });
	}
};

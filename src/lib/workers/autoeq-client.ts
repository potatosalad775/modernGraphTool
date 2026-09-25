import type { AutoEqOutcome, AutoEqRequest } from './autoeq-request.js';
import autoeqWorkerUrl from './autoeq.worker.ts?worker&url';

let worker: Worker | null = null;
let nextId = 0;

function createModuleWorker(url: URL | string): Worker {
	const href = typeof url === 'string' ? url : url.href;
	const sameOrigin =
		typeof window === 'undefined' ||
		new URL(href, window.location.href).origin === window.location.origin;

	if (sameOrigin) {
		return new Worker(href, { type: 'module' });
	}

	const shim = `import ${JSON.stringify(href)};`;
	const blob = new Blob([shim], { type: 'text/javascript' });
	const blobUrl = URL.createObjectURL(blob);
	try {
		return new Worker(blobUrl, { type: 'module' });
	} finally {
		URL.revokeObjectURL(blobUrl);
	}
}

function getWorker(): Worker {
	if (!worker) {
		worker = createModuleWorker(autoeqWorkerUrl);
	}
	return worker;
}

/**
 * Fit `source` to `target` off the main thread.
 *
 * `request` is in turboEQ's terms — peaking bands with the shelves outside the
 * count, per-band bounds the fit lands inside, and a graphic EQ as a pinned
 * bank rather than a free fit snapped onto the grid. See `autoeq-engine.ts`.
 *
 * The result says which optimizer produced it. `engine: 'typescript'` means
 * turboEQ failed and the fallback answered, which is a working EQ fitted by a
 * worse algorithm rather than an error.
 */
export function runAutoEQInWorker(
	source: [number, number][],
	target: [number, number][],
	request: AutoEqRequest
): Promise<AutoEqOutcome> {
	const w = getWorker();
	const id = ++nextId;

	return new Promise<AutoEqOutcome>((resolve, reject) => {
		function handler(e: MessageEvent) {
			const data = e.data;
			if (data.id !== id) return;
			w.removeEventListener('message', handler);
			w.removeEventListener('error', errorHandler);
			if (data.type === 'autoeq-result') {
				if (typeof data.elapsedMs === 'number') {
					console.debug(
						'[autoEQ] %s %sms%s',
						data.engine,
						data.elapsedMs.toFixed(1),
						typeof data.rmse === 'number' ? ` RMSE ${data.rmse.toFixed(3)}` : ''
					);
				}
				if (data.fallbackReason) {
					console.warn('[autoEQ] turboEQ failed, used the TypeScript engine:', data.fallbackReason);
				}
				resolve({
					filters: data.filters,
					engine: data.engine,
					rmse: data.rmse,
					preamp: data.preamp,
					fallbackReason: data.fallbackReason
				});
			} else if (data.type === 'autoeq-error') {
				reject(new Error(data.error));
			}
		}

		function errorHandler(e: ErrorEvent) {
			w.removeEventListener('message', handler);
			w.removeEventListener('error', errorHandler);
			reject(new Error(e.message || 'Worker error'));
		}

		w.addEventListener('message', handler);
		w.addEventListener('error', errorHandler);
		w.postMessage({ type: 'run-autoeq', id, source, target, request });
	});
}

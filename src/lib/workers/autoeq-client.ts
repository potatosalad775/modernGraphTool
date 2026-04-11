import type { EQFilter } from '$lib/utils/equalizer.js';

let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL('./autoeq.worker.ts', import.meta.url), { type: 'module' });
	}
	return worker;
}

export function runAutoEQInWorker(
	source: [number, number][],
	target: [number, number][],
	options: {
		maxFilters?: number;
		freqRange?: [number, number];
		qRange?: [number, number];
		gainRange?: [number, number];
		useShelfFilter?: boolean;
	}
): Promise<EQFilter[]> {
	const w = getWorker();
	const id = ++nextId;

	return new Promise<EQFilter[]>((resolve, reject) => {
		function handler(e: MessageEvent) {
			const data = e.data;
			if (data.id !== id) return;
			w.removeEventListener('message', handler);
			w.removeEventListener('error', errorHandler);
			if (data.type === 'autoeq-result') {
				resolve(data.filters);
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
		w.postMessage({ type: 'run-autoeq', id, source, target, options });
	});
}

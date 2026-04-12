import type { EQFilter } from '$lib/utils/equalizer.js';
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

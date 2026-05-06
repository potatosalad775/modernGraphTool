import { Equalizer } from '../utils/equalizer.js';

self.onmessage = (e: MessageEvent) => {
	const { type, id, source, target, options } = e.data;
	if (type !== 'run-autoeq') return;

	try {
		const eq = new Equalizer();
		const t0 = performance.now();
		const filters = eq.autoEQ(source, target, options);
		const elapsedMs = performance.now() - t0;
		self.postMessage({ type: 'autoeq-result', id, filters, elapsedMs });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		self.postMessage({ type: 'autoeq-error', id, error: message });
	}
};

import { Equalizer } from '../utils/equalizer.js';

self.onmessage = (e: MessageEvent) => {
	const { type, id, source, target, options } = e.data;
	if (type !== 'run-autoeq') return;

	try {
		const eq = new Equalizer();
		const filters = eq.autoEQ(source, target, options);
		self.postMessage({ type: 'autoeq-result', id, filters });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		self.postMessage({ type: 'autoeq-error', id, error: message });
	}
};

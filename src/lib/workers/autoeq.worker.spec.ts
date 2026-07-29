/**
 * The AutoEQ worker is a message shim: it unwraps a `run-autoeq` request, hands
 * it to `Equalizer.autoEQ` and posts one of two replies back. The optimization
 * itself is covered by `utils/equalizer.spec.ts` — what is asserted here is the
 * protocol, because it is the half `autoeq-client.spec.ts` has to fake.
 *
 * `self` does not exist in the node project, so it is stubbed before the module
 * is imported: the shim installs its handler at module scope, and `resetModules`
 * gives each case a fresh install against its own stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface WorkerScope {
	onmessage: ((e: MessageEvent) => void) | null;
	postMessage: ReturnType<typeof vi.fn>;
}

/** A gently sloped source against a flat target — enough error to earn filters. */
function sloped(): [number, number][] {
	return Array.from({ length: 64 }, (_, i) => {
		const freq = 20 * Math.pow(10, (3 * i) / 63);
		return [freq, freq > 1000 ? 6 : 0] as [number, number];
	});
}

function flat(): [number, number][] {
	return sloped().map(([f]) => [f, 0] as [number, number]);
}

let scope: WorkerScope;

/** Installs the shim against a fresh stubbed worker scope and returns it. */
async function loadWorker(): Promise<WorkerScope> {
	scope = { onmessage: null, postMessage: vi.fn() };
	vi.stubGlobal('self', scope);
	await import('./autoeq.worker.js');
	return scope;
}

function post(data: unknown): void {
	scope.onmessage?.({ data } as MessageEvent);
}

function lastReply(): Record<string, unknown> {
	const calls = scope.postMessage.mock.calls;
	return calls[calls.length - 1][0];
}

describe('autoeq.worker', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('installs a message handler on the worker scope', async () => {
		await loadWorker();

		expect(scope.onmessage).toBeTypeOf('function');
	});

	it('ignores messages of any other type', async () => {
		await loadWorker();

		post({ type: 'something-else', id: 1 });

		expect(scope.postMessage).not.toHaveBeenCalled();
	});

	// ── Success reply ────────────────────────────────────────────────────────

	describe('on a run-autoeq request', () => {
		beforeEach(async () => {
			await loadWorker();
			post({
				type: 'run-autoeq',
				id: 7,
				source: sloped(),
				target: flat(),
				options: { maxFilters: 3 }
			});
		});

		it('replies with a result carrying the request id', () => {
			expect(lastReply()).toMatchObject({ type: 'autoeq-result', id: 7 });
		});

		it('returns filters that honour the maxFilters option', () => {
			const filters = lastReply().filters as unknown[];

			expect(filters.length).toBeGreaterThan(0);
			expect(filters.length).toBeLessThanOrEqual(3);
		});

		it('reports how long the optimization took', () => {
			// The client logs this; a missing or NaN value would surface as a
			// broken console line rather than a failure, so pin the type here.
			expect(lastReply().elapsedMs).toBeTypeOf('number');
			expect(lastReply().elapsedMs as number).toBeGreaterThanOrEqual(0);
		});
	});

	it('treats a missing source as flat rather than failing', async () => {
		// `_interpolatePoints` returns zeros for an empty or absent curve, so a null
		// source is a valid request that optimizes against silence. The callers that
		// care reject it earlier — `EqAutoEq` checks `sourcePoints.length`.
		await loadWorker();

		post({ type: 'run-autoeq', id: 8, source: null, target: flat(), options: {} });

		expect(lastReply()).toMatchObject({ type: 'autoeq-result', id: 8 });
	});

	// ── Error reply ──────────────────────────────────────────────────────────

	describe('when the optimization throws', () => {
		it('replies with an error instead of letting the worker die', async () => {
			// A non-iterable source is the seam the real Equalizer throws on:
			// `_interpolatePoints` spreads `points` once it is past the empty guard.
			await loadWorker();

			post({ type: 'run-autoeq', id: 9, source: 42, target: flat(), options: {} });

			expect(lastReply()).toMatchObject({ type: 'autoeq-error', id: 9 });
			expect(lastReply().error).toBeTypeOf('string');
		});

		it('stringifies a throw that is not an Error', async () => {
			// The real Equalizer only ever throws Errors, so the `String(err)` arm is
			// unreachable without standing in for it.
			vi.doMock('../utils/equalizer.js', () => ({
				Equalizer: class {
					autoEQ(): never {
						throw 'boom';
					}
				}
			}));
			await loadWorker();

			post({ type: 'run-autoeq', id: 10, source: flat(), target: flat(), options: {} });

			expect(lastReply()).toMatchObject({ type: 'autoeq-error', id: 10, error: 'boom' });
			vi.doUnmock('../utils/equalizer.js');
		});
	});
});

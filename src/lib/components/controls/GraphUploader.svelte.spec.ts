/**
 * `GraphUploader` is the entry point for operator- and user-supplied FR files.
 * Most of it is filename policy rather than parsing: a trailing ` L` / `_R`
 * marker pairs two files into one stereo device, anything else becomes a mono
 * curve, and a file that parses to nothing has to fail loudly for that device
 * alone without taking the rest of the batch down.
 *
 * `dataProvider.insertRawFRData` is spied on — what reaches it is the contract;
 * building the FRDataObject is `data-provider.svelte.spec.ts`. The parser is
 * real, so the "no valid data points" rejection is exercised end to end.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import GraphUploader from './GraphUploader.svelte';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import { toast } from 'svelte-sonner';
import * as m from '$lib/paraglide/messages.js';

/** Two decades of points — enough that the parser keeps them. */
const VALID = Array.from({ length: 32 }, (_, i) => {
	const f = 20 * Math.pow(10, (3 * i) / 31);
	return `${f.toFixed(2)} ${(i % 7) - 3}`;
}).join('\n');

function file(name: string, body = VALID): File {
	return new File([body], name, { type: 'text/plain' });
}

// Module scope so `upload()` below can read them; assigned in beforeEach.
let insert: ReturnType<typeof vi.spyOn>;
let success: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

/**
 * Drops files onto one of the two hidden inputs and fires its change handler,
 * then waits for the upload to finish.
 *
 * "Finish" cannot be pinned to `input.value === ''` — the handler clears that
 * on its first line, before it has read a single file — so waiting on it lets
 * an in-flight upload spill its `insertRawFRData` calls into the next test.
 * Poll the observable effects instead and stop once they stop arriving.
 */
async function upload(which: 'phone' | 'target', files: File[]): Promise<void> {
	const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
	const input = which === 'phone' ? inputs[0] : inputs[1];
	const dt = new DataTransfer();
	for (const f of files) dt.items.add(f);
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));

	const seen = () => insert.mock.calls.length + error.mock.calls.length + success.mock.calls.length;
	let stable = 0;
	let last = seen();
	// Three quiet ticks in a row; an empty pick settles immediately at zero.
	for (let i = 0; i < 200 && stable < 3; i++) {
		await new Promise((r) => setTimeout(r, 5));
		if (seen() === last) stable++;
		else {
			stable = 0;
			last = seen();
		}
	}
}

describe('GraphUploader', () => {
	beforeEach(async () => {
		insert = vi.spyOn(dataProvider, 'insertRawFRData').mockResolvedValue(undefined as never);
		success = vi.spyOn(toast, 'success').mockImplementation(() => '' as never);
		error = vi.spyOn(toast, 'error').mockImplementation(() => '' as never);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// `render` is async; without the await the file inputs may not exist yet.
		await render(GraphUploader);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Buttons ──────────────────────────────────────────────────────────────

	describe('the buttons', () => {
		it('offers separate measurement and target pickers', async () => {
			await expect
				.element(page.getByRole('button', { name: m.graph_uploader_upload_fr() }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: m.graph_uploader_upload_target() }))
				.toBeInTheDocument();
		});

		it('opens the matching hidden file input', async () => {
			const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
			const clicked = vi.spyOn(inputs[0], 'click').mockImplementation(() => {});

			await page.getByRole('button', { name: m.graph_uploader_upload_fr() }).click();

			expect(clicked).toHaveBeenCalledOnce();
		});
	});

	// ── Measurement uploads ──────────────────────────────────────────────────

	describe('measurement uploads', () => {
		it('loads an unmarked file as a single mono curve', async () => {
			await upload('phone', [file('HD600.txt')]);

			expect(insert).toHaveBeenCalledOnce();
			const [type, name, channels, opts] = insert.mock.calls[0];
			expect(type).toBe('phone');
			expect(name).toBe('HD600');
			expect(Object.keys(channels as object)).toEqual(['AVG']);
			expect(opts).toMatchObject({ dispChannel: ['AVG'], dispSuffix: 'Uploaded' });
		});

		it('pairs L and R files into one stereo device', async () => {
			await upload('phone', [file('HD600 L.txt'), file('HD600 R.txt')]);

			expect(insert).toHaveBeenCalledOnce();
			const [, name, channels] = insert.mock.calls[0];
			expect(name).toBe('HD600');
			expect(Object.keys(channels as object).sort()).toEqual(['AVG', 'L', 'R']);
		});

		it('accepts underscore and dash channel markers too', async () => {
			await upload('phone', [file('HD600_L.txt'), file('HD600-R.txt')]);

			// Different delimiters, same base name — still one device.
			expect(insert).toHaveBeenCalledOnce();
			expect(insert.mock.calls[0][1]).toBe('HD600');
		});

		it('accepts a lowercase marker', async () => {
			await upload('phone', [file('HD600 l.txt'), file('HD600 r.txt')]);

			expect(insert).toHaveBeenCalledOnce();
			const [, , channels] = insert.mock.calls[0];
			expect(Object.keys(channels as object).sort()).toEqual(['AVG', 'L', 'R']);
		});

		it('loads a lone L file without inventing an average', async () => {
			await upload('phone', [file('HD600 L.txt')]);

			const [, , channels] = insert.mock.calls[0];
			expect(Object.keys(channels as object)).toEqual(['L']);
		});

		it('keeps unrelated devices separate', async () => {
			await upload('phone', [file('HD600 L.txt'), file('HD600 R.txt'), file('HD800.txt')]);

			expect(insert).toHaveBeenCalledTimes(2);
			expect(insert.mock.calls.map((c: unknown[]) => c[1]).sort()).toEqual(['HD600', 'HD800']);
		});

		it('does nothing when the picker is dismissed', async () => {
			await upload('phone', []);

			expect(insert).not.toHaveBeenCalled();
			expect(success).not.toHaveBeenCalled();
		});

		it('clears the input so the same file can be picked twice', async () => {
			await upload('phone', [file('HD600.txt')]);

			const input = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[0];
			expect(input.value).toBe('');
		});
	});

	// ── Target uploads ───────────────────────────────────────────────────────

	describe('target uploads', () => {
		it('loads each file as its own mono target', async () => {
			await upload('target', [file('Harman.txt'), file('Diffuse Field.txt')]);

			expect(insert).toHaveBeenCalledTimes(2);
			expect(insert.mock.calls.every((c: unknown[]) => c[0] === 'target')).toBe(true);
		});

		it('keeps a channel marker in the target name rather than pairing', async () => {
			// Targets are single curves; ` L` is part of the name, not a channel.
			await upload('target', [file('Target L.txt')]);

			expect(insert.mock.calls[0][1]).toBe('Target L');
		});
	});

	// ── Failure handling ─────────────────────────────────────────────────────

	describe('when a file cannot be read', () => {
		it('rejects a file with no usable data points', async () => {
			await upload('phone', [file('Broken.txt', 'not a frequency response')]);

			expect(insert).not.toHaveBeenCalled();
			expect(error).toHaveBeenCalledOnce();
		});

		it('names the file that failed', async () => {
			await upload('phone', [file('Broken.txt', '')]);

			expect(error.mock.calls[0][0]).toBe('Failed to load Broken');
		});

		it('still loads the good files in a mixed batch', async () => {
			// One bad export should not cost the user the rest of the drop.
			await upload('phone', [file('Broken.txt', 'nonsense'), file('HD600.txt')]);

			expect(insert).toHaveBeenCalledOnce();
			expect(insert.mock.calls[0][1]).toBe('HD600');
			expect(error).toHaveBeenCalledOnce();
		});

		it('reports a failure inside a channel pair against the device name', async () => {
			await upload('phone', [file('HD600 L.txt'), file('HD600 R.txt', 'nonsense')]);

			expect(insert).not.toHaveBeenCalled();
			expect(error.mock.calls[0][0]).toBe('Failed to load HD600');
		});
	});

	// ── Success reporting ────────────────────────────────────────────────────

	describe('the success toast', () => {
		it('names the device when one loaded', async () => {
			await upload('phone', [file('HD600.txt')]);

			expect(success).toHaveBeenCalledWith('Loaded HD600');
		});

		it('counts them when several loaded', async () => {
			await upload('phone', [file('HD600.txt'), file('HD800.txt')]);

			expect(success).toHaveBeenCalledWith('Loaded 2 measurements');
		});

		it('uses the target noun for targets', async () => {
			await upload('target', [file('Harman.txt'), file('DF.txt')]);

			expect(success).toHaveBeenCalledWith('Loaded 2 targets');
		});

		it('stays quiet when everything failed', async () => {
			await upload('phone', [file('Broken.txt', 'nonsense')]);

			expect(success).not.toHaveBeenCalled();
		});
	});
});

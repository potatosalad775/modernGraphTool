import { describe, it, expect, beforeEach, vi } from 'vitest';

const sonner = vi.hoisted(() => ({
	success: vi.fn(),
	info: vi.fn(),
	message: vi.fn(),
	loading: vi.fn(),
	custom: vi.fn(),
	promise: vi.fn(),
	dismiss: vi.fn(),
	getActiveToasts: vi.fn(),
	error: vi.fn(),
	warning: vi.fn()
}));

vi.mock('svelte-sonner', () => ({ toast: sonner }));

import { toast } from './toast.js';

describe('toast', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(['error', 'warning'] as const)('keeps a %s until dismissed', (type) => {
		toast[type]('Something went wrong');

		expect(sonner[type]).toHaveBeenCalledWith('Something went wrong', {
			duration: Infinity,
			id: `${type}:Something went wrong`
		});
	});

	it.each(['error', 'warning'] as const)('lets a %s pass its own duration', (type) => {
		toast[type]('Heads up', { duration: 1500 });

		expect(sonner[type]).toHaveBeenCalledWith('Heads up', {
			duration: 1500,
			id: `${type}:Heads up`
		});
	});

	it('lets a caller pass its own id, and keeps its other options', () => {
		const action = { label: 'Undo', onClick: () => {} };
		toast.error('Failed', { id: 'mine', description: 'why', action });

		expect(sonner.error).toHaveBeenCalledWith('Failed', {
			duration: Infinity,
			id: 'mine',
			description: 'why',
			action
		});
	});

	it('keys a repeat by type and text so the second call updates the first', () => {
		toast.error('Same text');
		toast.error('Same text');
		toast.warning('Same text');

		const ids = sonner.error.mock.calls.map((c) => c[1].id);
		expect(ids).toEqual(['error:Same text', 'error:Same text']);
		expect(sonner.warning.mock.calls[0][1].id).toBe('warning:Same text');
	});

	it('does not invent an id for a component message', () => {
		const component = () => {};
		toast.error(component as never);

		expect(sonner.error.mock.calls[0][1].id).toBeUndefined();
	});

	it('passes the other types through with the library defaults', () => {
		toast.success('Saved');
		toast.info('FYI', { duration: 9000 });
		toast.message('Hi');

		expect(sonner.success).toHaveBeenCalledWith('Saved');
		expect(sonner.info).toHaveBeenCalledWith('FYI', { duration: 9000 });
		expect(sonner.message).toHaveBeenCalledWith('Hi');
	});

	it('exposes dismiss and getActiveToasts', () => {
		toast.dismiss('x');
		toast.getActiveToasts();

		expect(sonner.dismiss).toHaveBeenCalledWith('x');
		expect(sonner.getActiveToasts).toHaveBeenCalled();
	});
});

import { describe, it, expect, beforeEach } from 'vitest';
import CommandHistory from './command-history.svelte.js';
import type { Command } from './commands.js';
import type { FRStoreWriteAPI } from './command-history.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/** Simple in-memory store for testing */
function createMockStore(): FRStoreWriteAPI & { data: Map<string, FRDataObject> } {
	const data = new Map<string, FRDataObject>();
	return {
		data,
		get(uuid: string) {
			return data.get(uuid) ?? null;
		},
		set(uuid: string, obj: FRDataObject) {
			data.set(uuid, obj);
		},
		delete(uuid: string) {
			data.delete(uuid);
		}
	};
}

/** Create a simple test command that sets/deletes a value */
function createTestCommand(uuid: string, value: string): Command {
	let previousValue: FRDataObject | null = null;
	const obj = {
		uuid,
		type: 'phone' as const,
		identifier: value,
		channels: {},
		dispChannel: ['AVG' as const],
		colors: { AVG: '#000' },
		dash: ''
	} satisfies FRDataObject;

	return {
		uuid,
		execute(store: FRStoreWriteAPI) {
			previousValue = store.get(uuid);
			store.set(uuid, obj);
		},
		undo(store: FRStoreWriteAPI) {
			if (previousValue) {
				store.set(uuid, previousValue);
			} else {
				store.delete(uuid);
			}
		}
	};
}

describe('CommandHistory', () => {
	let history: CommandHistory;
	let store: ReturnType<typeof createMockStore>;

	beforeEach(() => {
		history = new CommandHistory();
		store = createMockStore();
	});

	describe('execute', () => {
		it('executes the command and adds to history', () => {
			const cmd = createTestCommand('a', 'Phone A');
			history.execute(cmd, store);
			expect(store.data.has('a')).toBe(true);
			expect(store.data.get('a')!.identifier).toBe('Phone A');
		});

		it('returns the executed command', () => {
			const cmd = createTestCommand('a', 'Phone A');
			const result = history.execute(cmd, store);
			expect(result).toBe(cmd);
		});

		it('enables undo after execution', () => {
			expect(history.canUndo).toBe(false);
			history.execute(createTestCommand('a', 'Phone A'), store);
			expect(history.canUndo).toBe(true);
		});
	});

	describe('undo', () => {
		it('reverses the last command', () => {
			history.execute(createTestCommand('a', 'Phone A'), store);
			expect(store.data.has('a')).toBe(true);

			history.undo(store);
			expect(store.data.has('a')).toBe(false);
		});

		it('returns null when nothing to undo', () => {
			const result = history.undo(store);
			expect(result).toBeNull();
		});

		it('returns the undone command', () => {
			const cmd = createTestCommand('a', 'Phone A');
			history.execute(cmd, store);
			const undone = history.undo(store);
			expect(undone).toBe(cmd);
		});

		it('enables redo after undo', () => {
			history.execute(createTestCommand('a', 'Phone A'), store);
			expect(history.canRedo).toBe(false);

			history.undo(store);
			expect(history.canRedo).toBe(true);
		});
	});

	describe('redo', () => {
		it('re-applies the undone command', () => {
			history.execute(createTestCommand('a', 'Phone A'), store);
			history.undo(store);
			expect(store.data.has('a')).toBe(false);

			history.redo(store);
			expect(store.data.has('a')).toBe(true);
		});

		it('returns null when nothing to redo', () => {
			expect(history.redo(store)).toBeNull();
		});

		it('returns the redone command', () => {
			const cmd = createTestCommand('a', 'Phone A');
			history.execute(cmd, store);
			history.undo(store);
			const redone = history.redo(store);
			expect(redone).toBe(cmd);
		});
	});

	describe('undo/redo chain', () => {
		it('supports multiple undo/redo steps', () => {
			history.execute(createTestCommand('a', 'A'), store);
			history.execute(createTestCommand('b', 'B'), store);
			history.execute(createTestCommand('c', 'C'), store);

			expect(store.data.size).toBe(3);

			history.undo(store); // undo C
			expect(store.data.has('c')).toBe(false);
			expect(store.data.size).toBe(2);

			history.undo(store); // undo B
			expect(store.data.has('b')).toBe(false);
			expect(store.data.size).toBe(1);

			history.redo(store); // redo B
			expect(store.data.has('b')).toBe(true);
			expect(store.data.size).toBe(2);
		});

		it('discards redo branch on new execute after undo', () => {
			history.execute(createTestCommand('a', 'A'), store);
			history.execute(createTestCommand('b', 'B'), store);

			history.undo(store); // undo B
			expect(history.canRedo).toBe(true);

			// New command should discard the redo branch
			history.execute(createTestCommand('c', 'C'), store);
			expect(history.canRedo).toBe(false);
		});
	});

	describe('clear', () => {
		it('resets history completely', () => {
			history.execute(createTestCommand('a', 'A'), store);
			history.execute(createTestCommand('b', 'B'), store);

			history.clear();
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(false);
		});

		it('does not affect store data', () => {
			history.execute(createTestCommand('a', 'A'), store);
			history.clear();
			// Store still has the data, only history is cleared
			expect(store.data.has('a')).toBe(true);
		});
	});

	describe('canUndo / canRedo', () => {
		it('both false initially', () => {
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(false);
		});

		it('canUndo true after execute', () => {
			history.execute(createTestCommand('a', 'A'), store);
			expect(history.canUndo).toBe(true);
			expect(history.canRedo).toBe(false);
		});

		it('canRedo true after undo', () => {
			history.execute(createTestCommand('a', 'A'), store);
			history.undo(store);
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(true);
		});
	});
});

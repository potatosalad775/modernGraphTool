import type { Command } from './commands.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/** Minimal write API that commands need from the FR store. */
export interface FRStoreWriteAPI {
	get(uuid: string): FRDataObject | null;
	set(uuid: string, obj: FRDataObject): void;
	delete(uuid: string): void;
}

/**
 * CommandHistory — undo/redo stack for FRStore mutations.
 *
 * DataProvider is the only caller:
 *   history.execute(command, store)  — run and push onto the stack
 *   history.undo(store)              — reverse last command, returns it
 *   history.redo(store)              — re-apply next command, returns it
 */
class CommandHistory {
	#history: Command[] = $state([]);

	/** Index of the last executed command (-1 = empty) */
	#pointer = $state(-1);

	/** Execute a command and push it onto the history stack. Discards redo branch. */
	execute(command: Command, store: FRStoreWriteAPI): Command {
		// Truncate the redo branch
		this.#history = this.#history.slice(0, this.#pointer + 1);
		command.execute(store);
		this.#history.push(command);
		this.#pointer++;
		return command;
	}

	/** Undo the most recent command. */
	undo(store: FRStoreWriteAPI): Command | null {
		if (this.#pointer < 0) return null;
		const command = this.#history[this.#pointer--];
		command.undo(store);
		return command;
	}

	/** Redo the next command in the stack. */
	redo(store: FRStoreWriteAPI): Command | null {
		if (this.#pointer >= this.#history.length - 1) return null;
		const command = this.#history[++this.#pointer];
		command.execute(store);
		return command;
	}

	get canUndo(): boolean {
		return this.#pointer >= 0;
	}

	get canRedo(): boolean {
		return this.#pointer < this.#history.length - 1;
	}

	/**
	 * Clear all history (called after bulk operations like re-normalization
	 * that invalidate stored snapshots).
	 */
	clear(): void {
		this.#history = [];
		this.#pointer = -1;
	}
}

export default CommandHistory;
export const commandHistory = new CommandHistory();

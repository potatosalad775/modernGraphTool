import type { Command } from './commands.js';
import type { FRDataObject } from '#lib/types/data-types.js';

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
/**
 * How long after the top entry was recorded (or last merged into) a new command may still fold into
 * it, for a command with `mergeWith`. Longer than the Y-offset button's 150 ms repeat tick, so a
 * hold stays one entry, and the same as the EQ coalescer's burst window.
 */
export const MERGE_WINDOW_MS = 400;

class CommandHistory {
	#history: Command[] = $state([]);

	/** Index of the last executed command (-1 = empty) */
	#pointer = $state(-1);

	/**
	 * When the top entry was pushed or last merged into. Undo, redo and clear reset it, so a new
	 * edit never folds into an entry the user has stepped over.
	 */
	#touchedAt = Number.NEGATIVE_INFINITY;

	/**
	 * Bumped by every execute, undo and redo. A change to the EQ that moves it is a finished step,
	 * not a gesture still under way: the uniPEQ link settles on it (`link-service.svelte.ts`).
	 */
	revision = $state(0);

	/** Execute a command and push it onto the history stack. Discards redo branch. */
	execute(command: Command, store: FRStoreWriteAPI): Command {
		// Truncate the redo branch
		this.#history = this.#history.slice(0, this.#pointer + 1);
		const now = performance.now();
		const top = this.#history[this.#pointer];
		const merge =
			top !== undefined &&
			now - this.#touchedAt <= MERGE_WINDOW_MS &&
			command.mergeWith?.(top) === true;
		command.execute(store);
		if (merge) this.#history[this.#pointer] = command;
		else {
			this.#history.push(command);
			this.#pointer++;
		}
		this.#touchedAt = now;
		this.revision++;
		return command;
	}

	/** Undo the most recent command. */
	undo(store: FRStoreWriteAPI): Command | null {
		if (this.#pointer < 0) return null;
		const command = this.#history[this.#pointer--];
		command.undo(store);
		this.#touchedAt = Number.NEGATIVE_INFINITY;
		this.revision++;
		return command;
	}

	/** Redo the next command in the stack. */
	redo(store: FRStoreWriteAPI): Command | null {
		if (this.#pointer >= this.#history.length - 1) return null;
		const command = this.#history[++this.#pointer];
		command.execute(store);
		this.#touchedAt = Number.NEGATIVE_INFINITY;
		this.revision++;
		return command;
	}

	/** Whether `command` is the one `undo` would reverse next, with no redo branch past it. */
	isLatest(command: Command): boolean {
		return this.#pointer === this.#history.length - 1 && this.#history[this.#pointer] === command;
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
		this.#touchedAt = Number.NEGATIVE_INFINITY;
	}
}

export default CommandHistory;
export const commandHistory = new CommandHistory();

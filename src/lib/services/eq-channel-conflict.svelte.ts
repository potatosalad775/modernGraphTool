/**
 * Per-ear bands under a restriction. Every eqcaps v1 profile drives both ears with one band list,
 * so "restricted to X" and a left- or right-only band can't be on screen together: the band list
 * would claim a restriction the EQ doesn't keep. Whenever the two would meet, the user is asked to
 * remove the per-ear bands or keep them and lift the restriction. Never a warning beside the bands.
 *
 * Two ways in. A preset pick asks before it takes effect (`applyPreset`), so Cancel changes
 * nothing. Everything else — a device connecting, an undo past a preset pick, a `?share=` link
 * opening on a saved restriction — is caught after the fact by the watcher `install()` sets up,
 * whose Keep lifts the restriction instead.
 *
 * A service rather than a component: a device can connect with the Equalizer panel closed, and
 * panels unmount on every switch.
 */
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import {
	eqConstraintsStore,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { eqCommands } from './eq-commands.js';

export interface ChannelConflictQuestion {
	/** `preset`: a pick not yet applied. `device` / `restriction`: one already active. */
	kind: 'preset' | 'device' | 'restriction';
	/** The restriction's label. */
	label: string;
	/** Bands pinned to one ear. */
	count: number;
	onRemove: () => void;
	onKeep: () => void;
}

function perChannelCount(): number {
	return eqStore.filters.reduce((n, f) => (f.channel != null ? n + 1 : n), 0);
}

class EqChannelConflict {
	/** The question on screen, or null. */
	question = $state.raw<ChannelConflictQuestion | null>(null);
	#installed = false;

	/**
	 * Pick preset `id` from the constraint picker. With per-ear bands it can't hold, ask first:
	 * Remove applies it and drops them as one undo entry, Cancel leaves everything as it was.
	 */
	applyPreset(id: string): void {
		const count = perChannelCount();
		if (count === 0 || eqConstraintsStore.presetSupportsPerChannel(id)) {
			eqConstraintsStore.setActive(id);
			eqCommands.reclampToActiveConstraint();
			return;
		}
		const label = eqConstraintsStore.presets.find((p) => p.id === id)?.label ?? id;
		this.question = {
			kind: 'preset',
			label,
			count,
			onRemove: () => eqCommands.applyConstraintDroppingPerChannel(id),
			onKeep: () => {}
		};
	}

	/**
	 * Watch for per-ear bands under an active restriction, from any path. Installed once from
	 * `AppShell.onMount`, never disposed. Keep lifts the restriction: the unlimited default is the
	 * only preset that holds per-ear bands, and for a device that means "don't restrict to it" —
	 * its preset stays in the picker.
	 */
	install(): void {
		if (this.#installed) return;
		this.#installed = true;
		$effect.root(() => {
			$effect(() => {
				if (this.question || eqConstraintsStore.supportsPerChannel) return;
				const count = perChannelCount();
				if (count === 0) return;
				const active = eqConstraintsStore.active;
				this.question = {
					kind: active.source === 'device' ? 'device' : 'restriction',
					label: active.label,
					count,
					onRemove: () => eqCommands.removePerChannelBands(),
					onKeep: () => eqConstraintsStore.setActive(DEFAULT_CONSTRAINT_ID)
				};
			});
		});
	}

	/** The answer. Escape or a click outside is Keep, the choice that removes nothing. */
	answer(remove: boolean): void {
		const question = this.question;
		if (!question) return;
		this.question = null;
		if (remove) question.onRemove();
		else question.onKeep();
	}

	/** Specs only: back to a fresh page. */
	reset(): void {
		this.question = null;
	}
}

export const eqChannelConflict = new EqChannelConflict();

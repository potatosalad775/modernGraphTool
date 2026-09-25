import { untrack } from 'svelte';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
import { eqCommands, type ReplaceEqFiltersCommand } from '$lib/services/eq-commands.js';
import { runAutoEQInWorker } from '$lib/workers/autoeq-client.js';
import { MAX_BANDS, planBands, type AutoEqRequest } from '$lib/workers/autoeq-request.js';
import { getConfigValue } from '$lib/utils/config.js';
import { countBandsPerOutput, filtersInScope, type EqChannelScope } from '$lib/utils/eq-channel.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/** Bands generated when the filter list is empty. Operator-overridable via
 *  `EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT`, which ships commented out. */
const DEFAULT_BAND_COUNT = 8;

/** How long auto-apply waits for input to settle — a typed "12000" is five edits. */
const AUTO_APPLY_DEBOUNCE_MS = 250;

/** Why auto-apply switched itself off. The TypeScript fallback has its own notice. */
export type AutoApplyStop = 'edited' | 'input' | 'preset';

type Points = [number, number][];

interface RunInputs {
	source: Points;
	target: Points;
	request: AutoEqRequest;
	/** `request` serialized, so two runs compare by value. */
	key: string;
}

/**
 * What one Run (or Recalculate) pinned down. Auto-apply re-runs against this,
 * never against the live panel state: the band count and the scope are the
 * ones the user ran with, so a tilt nudge doesn't grow the stack by the band
 * they just added, and switching the list to L doesn't start fitting that ear.
 */
interface Session {
	source: string;
	target: string;
	scope: EqChannelScope;
	bandCount: number;
	presetId: string;
	/** The inputs behind the result on screen; null until the first one lands. */
	inputs: RunInputs | null;
	/** The array that result wrote — any other means someone else edited the list. */
	written: EQFilter[] | null;
	/** The undo entry auto-applied results fold into. */
	command: ReplaceEqFiltersCommand | null;
}

/**
 * Graphic mode fits too, now that the optimizer takes a bank with fc and Q
 * pinned: every band lands on its own slider instead of being fitted freely
 * and dragged onto the nearest one. Only the frequency and Q inputs go away
 * with it — the grid is the preset's, not the user's.
 */
export function activeGraphicBands() {
	const preset = eqConstraintsStore.active;
	return preset?.mode === 'graphic' ? (preset.graphicBands ?? []) : [];
}

/**
 * How many bands to ask the optimizer for. A non-empty stack still wins, so
 * "add five bands, then Run" keeps working as the way to pick a count by
 * hand; the default only covers the empty case, which used to resolve to a
 * single band and made AutoEQ look broken on first use.
 */
function resolveBandCount(scope: EqChannelScope): number {
	// Counted within the bucket being replaced — the shared bands aren't
	// candidates for a run scoped to one ear, so they must not set its size.
	let count = filtersInScope(eqStore.filters, scope).length;
	if (count === 0) {
		const raw = getConfigValue('EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT');
		count = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : NaN;
		if (!(count >= 1)) count = DEFAULT_BAND_COUNT;
	}
	// `replaceFiltersInScope` trims to the preset cap anyway, and truncating an
	// 8-band solution to 5 fits worse than optimizing for 5 in the first place.
	// The budget is what the busiest output has left once the buckets this run
	// won't touch are accounted for.
	const preset = eqConstraintsStore.active;
	if (preset && preset.maxBands > 0) {
		const untouched = eqStore.filters.filter((f) =>
			scope === 'BOTH' ? f.channel != null : f.channel !== scope
		);
		count = Math.min(count, Math.max(1, preset.maxBands - countBandsPerOutput(untouched)));
	}
	// A preset saying "unlimited" still has to name a number here: every band
	// is three more variables for the solver, and past this the fit stops
	// being something a listener can tell apart.
	return Math.min(count, MAX_BANDS);
}

/**
 * What to ask the optimizer for, in its terms rather than the old engine's.
 *
 * The user's frequency window bounds where a band may *sit*; it is not the
 * band the error is scored over, which stays the whole axis. Those were one
 * number under the previous optimizer, which is why a narrow window used to
 * make the treble worse rather than merely unequalized. Everything here is
 * the intersection of what the user asked for and what the preset allows;
 * turboEQ intersects again with AutoEq's own defaults.
 */
function buildRequest(bandCount: number): AutoEqRequest {
	const opts = settingsStore.autoEqOptions;
	const preset = eqConstraintsStore.active;
	const fit = opts.exactMatch ? 'exact' : 'autoeq';
	const graphicBands = activeGraphicBands();
	if (graphicBands.length > 0) {
		return {
			kind: 'graphic',
			bands: graphicBands.map((band) => ({ freq: band.freq, q: band.q ?? preset?.qDefault })),
			gain: { min: preset?.gainMin, max: preset?.gainMax },
			fit
		};
	}

	const limits = {
		minFc: Math.max(opts.freqMin, preset?.freqMin ?? 20),
		maxFc: Math.min(opts.freqMax, preset?.freqMax ?? 20000),
		minQ: Math.max(opts.qMin, preset?.qMin ?? opts.qMin),
		maxQ: Math.min(opts.qMax, preset?.qMax ?? opts.qMax),
		minGain: Math.max(opts.gainMin, preset?.gainMin ?? opts.gainMin),
		maxGain: Math.min(opts.gainMax, preset?.gainMax ?? opts.gainMax)
	};
	// A preset that forbids shelves gets none, whatever the switch says.
	const shelvesAllowed =
		opts.useShelfFilter && (preset?.allowLsq ?? true) && (preset?.allowHsq ?? true);
	const { peaking, shelves } = planBands(bandCount, shelvesAllowed);
	return { kind: 'parametric', peaking, shelves, limits, fit };
}

/**
 * Optimize against the channel the user is editing. In `BOTH` scope that
 * stays the average, which is what preserves the unit's natural L/R
 * imbalance; scoping to one ear is how you correct it instead.
 * A target measured as a single curve has no L/R, hence the AVG fallback.
 */
function channelPoints(data: FRDataObject | null | undefined, scope: EqChannelScope): Points {
	const channels = data?.channels;
	if (!channels) return [];
	if (scope !== 'BOTH' && channels[scope]) return channels[scope]!.data as Points;
	return (channels.AVG?.data ?? channels.L?.data ?? channels.R?.data ?? []) as Points;
}

function collectInputs(session: Session): RunInputs | null {
	const source = channelPoints(frStore.get(session.source), session.scope);
	const target = channelPoints(frStore.get(session.target), session.scope);
	if (!source.length || !target.length) return null;
	const request = buildRequest(session.bandCount);
	return { source, target, request, key: JSON.stringify(request) };
}

/**
 * By value once identity differs. `TargetCustomizer` re-applies the stored
 * adjustment every time the Graph panel mounts, which hands the target fresh
 * arrays holding the same numbers — by identity alone, opening that panel
 * re-ran AutoEQ.
 */
function sameCurve(a: Points, b: Points): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
	}
	return true;
}

function sameInputs(a: RunInputs, b: RunInputs): boolean {
	return a.key === b.key && sameCurve(a.source, b.source) && sameCurve(a.target, b.target);
}

/**
 * AutoEQ runs, and the auto-apply loop that re-runs them.
 *
 * A service rather than component state because auto-apply has to outlive
 * the Equalizer panel: tilting the target from the Graph panel is the main
 * thing it exists for, and panels unmount on every switch. Its effects are
 * installed lazily, the first time auto-apply is switched on, and never
 * disposed.
 *
 * Auto-apply fails closed. Anything that makes the pinned run ambiguous — a
 * different device or target, a different preset, a hand edit to the list,
 * the slow fallback optimizer — switches it off and says why, rather than
 * guessing and overwriting someone's work.
 */
class AutoEqService {
	/** A manual run is in flight. Auto-applied runs don't set it — the button would flicker. */
	isRunning = $state(false);
	/** The last run came from the TypeScript fallback, i.e. the wasm failed. */
	fellBack = $state(false);
	autoApply = $state(false);
	stopReason = $state<AutoApplyStop | null>(null);

	#session = $state.raw<Session | null>(null);
	/** Bumped when a result lands, so the trigger re-checks for input that moved meanwhile. */
	#landed = $state(0);
	#token = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#installed = false;

	/** A result for the current device and target is on screen, so Run means Recalculate. */
	get hasResult(): boolean {
		void this.#landed;
		const session = this.#session;
		return (
			session?.inputs != null &&
			session.source === eqStore.sourcePhoneUUID &&
			session.target === eqStore.autoEqTargetUUID
		);
	}

	/**
	 * Run against the current panel state and pin it as the new session. Returns
	 * false when there is nothing to run against, after telling the user why.
	 */
	run(): boolean {
		const sourceUUID = eqStore.sourcePhoneUUID;
		const targetUUID = eqStore.autoEqTargetUUID;

		if (!sourceUUID || !targetUUID) {
			alert('Please select both a source device and target in the phone select above.');
			return false;
		}
		if (!frStore.get(sourceUUID) || !frStore.get(targetUUID)) {
			alert('Source or target data not found.');
			return false;
		}

		const scope = eqStore.channelScope;
		const session: Session = {
			source: sourceUUID,
			target: targetUUID,
			scope,
			bandCount: resolveBandCount(scope),
			presetId: eqConstraintsStore.activeId,
			inputs: null,
			written: null,
			command: null
		};
		const inputs = collectInputs(session);
		if (!inputs) {
			alert('Could not retrieve frequency response data.');
			return false;
		}

		this.#cancelPending();
		this.#session = session;
		this.stopReason = null;
		this.isRunning = true;
		void this.#execute(inputs, session, false).finally(() => {
			if (this.#session === session) this.isRunning = false;
		});
		return true;
	}

	/** Switching on is a Recalculate that keeps going; switching off just stops. */
	setAutoApply(on: boolean): void {
		if (!on) {
			this.#stop(null);
			return;
		}
		if (this.fellBack) return;
		this.#install();
		if (this.run()) this.autoApply = true;
	}

	/** Forget the session and every flag. For specs, which share this singleton. */
	reset(): void {
		this.#stop(null);
		this.#session = null;
		this.isRunning = false;
		this.fellBack = false;
	}

	async #execute(inputs: RunInputs, session: Session, auto: boolean): Promise<void> {
		const token = ++this.#token;
		let outcome;
		try {
			outcome = await runAutoEQInWorker(inputs.source, inputs.target, inputs.request);
		} catch (err) {
			console.error('AutoEQ failed:', err);
			return;
		}
		// A newer run, a new session or a stop all supersede this answer.
		if (token !== this.#token || this.#session !== session) return;
		if (auto && !this.autoApply) return;

		this.fellBack = outcome.engine === 'typescript';
		// Scoped, so running AutoEQ on one ear doesn't wipe the shared bands
		// or the other ear's solution.
		const command = eqCommands.replaceFiltersInScope(
			outcome.filters,
			session.scope,
			auto ? session.command : null
		);
		session.command = command ?? null;
		session.written = eqStore.filters;
		session.inputs = inputs;
		// Nobody runs AutoEQ wanting the graph to stay put. An auto-applied run
		// is not asked for, though, so it leaves an A/B bypass alone.
		if (!auto) eqCommands.ensureEnabled();
		// Too slow to chase every nudge, and it has already said so.
		if (this.fellBack && this.autoApply) this.#stop(null);
		this.#landed++;
	}

	#stop(reason: AutoApplyStop | null): void {
		this.autoApply = false;
		this.stopReason = reason;
		this.#cancelPending();
	}

	#cancelPending(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		// Drops an auto-applied answer still in flight.
		this.#token++;
	}

	#schedule(session: Session): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			if (!this.autoApply || this.#session !== session) return;
			const inputs = collectInputs(session);
			if (inputs) void this.#execute(inputs, session, true);
		}, AUTO_APPLY_DEBOUNCE_MS);
	}

	#install(): void {
		if (this.#installed) return;
		this.#installed = true;

		$effect.root(() => {
			// Guard: switch off the moment the pinned run stops describing the panel.
			$effect(() => {
				if (!this.autoApply) return;
				const session = this.#session;
				// Read up front: `written` is null until the first result lands, and a
				// short-circuit there would leave the list untracked for good.
				const filters = eqStore.filters;
				let reason: AutoApplyStop | null = null;
				if (
					!session ||
					eqStore.sourcePhoneUUID !== session.source ||
					eqStore.autoEqTargetUUID !== session.target ||
					!frStore.get(session.source) ||
					!frStore.get(session.target)
				) {
					reason = 'input';
				} else if (eqConstraintsStore.activeId !== session.presetId) {
					reason = 'preset';
				} else if (session.written && filters !== session.written) {
					// Adding, removing, dragging, undoing, importing — any of them.
					reason = 'edited';
				}
				if (reason) untrack(() => this.#stop(reason));
			});

			// Trigger: re-run when the curves or options behind the result change.
			// Deliberately blind to `eqStore.filters`, which every run writes.
			$effect(() => {
				void this.#landed;
				if (!this.autoApply) return;
				const session = this.#session;
				if (!session?.inputs) return;
				const inputs = collectInputs(session);
				if (!inputs || sameInputs(inputs, session.inputs)) return;
				untrack(() => this.#schedule(session));
			});
		});
	}
}

export const autoEqService = new AutoEqService();

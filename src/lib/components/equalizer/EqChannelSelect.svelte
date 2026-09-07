<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { filtersInScope, type EqChannelScope } from '$lib/utils/eq-channel.js';

	/**
	 * Channel scope for the band list — shared bands, left ear, or right ear.
	 *
	 * Sits at the head of the band list rather than in the panel header, because
	 * it scopes the list and nothing else: it decides which bands are shown and
	 * which bucket the `+` button fills. Beside the device selector it read as
	 * part of "what am I equalizing", and it also wrapped that row onto two
	 * lines on a phone. Nothing moves between buckets when it changes; it is a
	 * view, not an edit.
	 *
	 * The visible "Channel" label stays. A bare `L+R | L | R` collides with the
	 * Graph panel's channel *display* selector, which offers the same three
	 * words for an unrelated job.
	 */

	const options: [EqChannelScope, () => string][] = [
		['BOTH', m.eq_channel_both],
		['L', m.eq_channel_left],
		['R', m.eq_channel_right]
	];

	/**
	 * A graphic preset fixes one row per band on a single output, so there is no
	 * per-ear structure to edit — same reason add / remove / sort are disabled.
	 */
	const isGraphic = $derived(eqConstraintsStore.active?.mode === 'graphic');

	function select(scope: EqChannelScope) {
		eqStore.channelScope = scope;
		if (scope === 'BOTH') return;
		// Editing one ear is pointless if the graph is drawing the average. Only
		// expand from AVG — a user who deliberately picked a single channel keeps it.
		const uuid = eqStore.sourcePhoneUUID;
		if (!uuid) return;
		const source = frStore.get(uuid);
		if (!source) return;
		if (source.dispChannel.length === 1 && source.dispChannel[0] === 'AVG' && source.channels.L) {
			dataProvider.updateDisplayChannel(uuid, ['L', 'R']);
		}
	}
</script>

<!--
	Full width, so it never wraps and each segment stays a comfortable tap target
	on a phone. Sharing the preamp row would have left the three segments fighting
	the readout and the add/remove/sort buttons for the same ~150px.
-->
<div class="flex items-center gap-2">
	<span class="shrink-0 text-xs text-base-content/60">{m.eq_channel_scope_label()}</span>
	<div class="flex flex-1 rounded-md border border-base-content/20" role="group">
		{#each options as [value, label] (value)}
			{@const count = filtersInScope(eqStore.filters, value).length}
			<button
				type="button"
				aria-pressed={eqStore.channelScope === value}
				disabled={isGraphic}
				onclick={() => select(value)}
				class="flex-1 border-base-content/20 px-2 py-1 text-xs font-medium transition-colors first:rounded-l-md first:border-r last:rounded-r-md last:border-l disabled:cursor-not-allowed disabled:opacity-50 {eqStore.channelScope ===
				value
					? 'bg-accent text-white'
					: 'bg-base-100 text-base-content/70 hover:bg-base-content/5'}"
			>
				{label()}{count > 0 ? ` (${count})` : ''}
			</button>
		{/each}
	</div>
</div>

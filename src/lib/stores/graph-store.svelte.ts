import { SvelteMap } from 'svelte/reactivity';
import type { ParsedFRData } from '$lib/types/data-types.js';

export type BaselineMode = 'off' | 'withoutAdjustment' | 'withAdjustment';

class GraphStore {
	yScale = $state(50);
	baselineUUID = $state<string | null>(null);
	baselineMode = $state<BaselineMode>('off');
	normType = $state<'Hz' | 'Avg'>('Hz');
	normHzValue = $state(500);
	smoothValue = $state('1/48');
	/** Original (pre-adjustment) target channel data, keyed by target UUID */
	readonly targetOriginalData = new SvelteMap<string, ParsedFRData>();
	/** Bumped by reSmoothAll to signal TargetCustomizer to re-sync base data */
	targetOriginalVersion = $state(0);
}

export const graphStore = new GraphStore();

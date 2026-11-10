export type BaselineMode = 'off' | 'withoutAdjustment' | 'withAdjustment';

class GraphStore {
	yScale = $state(50);
	baselineUUID = $state<string | null>(null);
	baselineMode = $state<BaselineMode>('off');
	normType = $state<'Hz' | 'Avg'>('Hz');
	normHzValue = $state(500);
	smoothValue = $state('1/48');
}

export const graphStore = new GraphStore();

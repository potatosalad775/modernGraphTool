class GraphStore {
  yScale = $state(60);
  baselineUUID = $state<string | null>(null);
  normType = $state<'Hz' | 'Avg'>('Hz');
  normHzValue = $state(500);
}

export const graphStore = new GraphStore();

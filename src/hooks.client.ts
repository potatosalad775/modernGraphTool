import type { ClientInit } from '@sveltejs/kit';
import { startInitialLoad } from '$lib/services/initial-load';

// Runs before the route's component code is loaded, so the phone book and the
// initial FR files download in parallel with it. See initial-load.ts.
export const init: ClientInit = () => {
	startInitialLoad();
};

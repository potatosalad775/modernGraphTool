import type { ClientInit } from '@sveltejs/kit';
import { startInitialLoad } from '$lib/services/initial-load';
import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';

// Runs before the route's component code is loaded, so the phone book and the
// initial FR files download in parallel with it. See initial-load.ts.
export const init: ClientInit = () => {
	startInitialLoad();
	// On a first squig.link visit the sponsor creative is the LCP element; start
	// its chain now rather than from SponsorBanner's onMount. Returning visitors
	// load it too: only the payload's sponsorId says whether they dismissed it.
	if (squiglinkStore.isSponsorEnabled) void squiglinkStore.fetchSponsorContent();
};

import {
	createClient,
	memoryStore,
	V1_URL,
	webStorageStore,
	type CacheStore,
	type EqcapsClient
} from '@potatosalad775/eqcaps-client';
import { getConfigValue } from '$lib/utils/config.js';

/**
 * The eqcaps database client — EQ constraint profiles for hardware and software EQs, matched to a
 * connected device by its USB / Bluetooth identity.
 *
 * Only ever reached through a dynamic `import()` (the constraint picker, Device PEQ), so nothing
 * here is in the boot bundle. The client never throws: an unreachable database resolves to no
 * profiles and no matches, and the tool keeps working with its built-in presets.
 *
 * `EQUALIZER.EQCAPS_URL` points it at a mirror or a self-hosted copy of the `/v1/` channel.
 */
let client: EqcapsClient | null = null;

export function eqcapsClient(): EqcapsClient {
	if (client) return client;
	const configured = getConfigValue('EQUALIZER.EQCAPS_URL');
	const baseUrl =
		typeof configured === 'string' && configured.trim()
			? configured.trim().replace(/\/?$/, '/')
			: V1_URL;
	client = createClient({
		baseUrl,
		store: persistentStore(),
		onError: (error, context) => console.warn(`eqcaps (${context}):`, error)
	});
	return client;
}

/** The index and profiles survive reloads in localStorage when it is there to use. */
function persistentStore(): CacheStore {
	try {
		if (typeof localStorage !== 'undefined') return webStorageStore(localStorage);
	} catch {
		/* Storage blocked (private mode, sandboxed iframe). */
	}
	return memoryStore();
}

/** For specs: drop the singleton so the next call reads config again. */
export function resetEqcapsClient(): void {
	client = null;
}

/**
 * What AppShell needs to decide whether to load the uniPEQ link at boot, without loading it:
 * `link-service.svelte.ts` pulls in Hardware EQ's service and stores, which no boot path needs.
 */
import { getConfigValue } from '$lib/utils/config.js';

/** uniPEQ's own Worker. App Links (the QR code opening uniPEQ) are verified for it alone. */
export const DEFAULT_LINK_SERVER = 'https://link.unipeq.com';

/**
 * Where `peq-link`'s client keeps a session across a reload (its host.ts). Read only to decide
 * whether to load the client; the client parses and checks it itself.
 */
const SAVED_SESSION_KEY = 'peq-link:host';

/** `UNIPEQ_LINK` from the config. Unset means on, with uniPEQ's own server. */
export function linkConfig(): { enabled: boolean; server: string } {
	const server = getConfigValue('UNIPEQ_LINK.SERVER');
	return {
		enabled: getConfigValue('UNIPEQ_LINK.ENABLE') !== false,
		server: typeof server === 'string' && server ? server : DEFAULT_LINK_SERVER
	};
}

/** This tab had a session before a reload, which resumes without asking uniPEQ again. */
export function hasSavedLinkSession(): boolean {
	try {
		return sessionStorage.getItem(SAVED_SESSION_KEY) !== null;
	} catch {
		return false;
	}
}

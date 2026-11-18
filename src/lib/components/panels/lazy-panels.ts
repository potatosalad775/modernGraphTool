/**
 * Panels that are not part of the boot chunk.
 *
 * The Equalizer panel is about a fifth of the app's JavaScript (its components, AutoEQ,
 * the audio player, a third of all translated strings) and no visitor sees it before
 * switching to it. `AppShell` renders it through this loader, and asks for it once the
 * first curves are in and the browser is idle, so the first switch finds it loaded.
 *
 * This is not the lazy initial panel measured and rejected in the root AGENTS.md: the
 * panel the page opens on stays in the boot chunk, and a deployment that opens on the
 * Equalizer starts this request from `initial-load.ts`, alongside the phone book.
 */
import { noop } from '#lib/utils/noop.js';

export const loadEqualizerPanel = () => import('./EqualizerPanel.svelte');

/**
 * Start the download without waiting for it. A failure is left to the panel's own load, whose
 * `{:catch}` in `AppShell` offers a page reload.
 */
export function preloadEqualizerPanel(): void {
	loadEqualizerPanel().catch(noop);
}

/**
 * The modal shell, shared by the `Dialog` atom and the modals that stay raw bits-ui
 * (`SponsorBanner`, the mobile drawer's overlay), so the scrim, the layers and the card
 * are written once.
 */

/** The veil behind a modal. `--color-scrim` carries its own alpha. */
export const dialogOverlayClass = 'fixed inset-0 z-40 bg-scrim';

/**
 * The centred card. Capped to the viewport and scrolling inside: `html` is
 * `overflow: hidden`, so a taller card would be clipped with no way to reach the rest.
 */
export const dialogCardClass =
	'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-xl bg-base-200 p-6 shadow-2xl';

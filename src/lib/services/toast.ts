import { toast as sonner } from 'svelte-sonner';

/**
 * An error or a warning tells the user something went wrong or was left out, and a few seconds is
 * not enough to read it, let alone act on it (WCAG 2.2.1): both stay until the close button
 * dismisses them. svelte-sonner has no per-type duration, so the default is applied here, once,
 * rather than at every call site; a call that passes its own `duration` still wins.
 *
 * With no `id` of its own a toast is keyed by its type and text, so repeating the same failure (a
 * button pressed again, an effect firing twice) updates the toast already on screen instead of
 * stacking another beside it.
 *
 * Import `toast` from here, never from `svelte-sonner` (only `AppShell` takes the `Toaster`
 * component from the library). A module-level wrapper rather than a patch on the library's shared
 * object, so a toast fired before any component loads gets the same defaults.
 */
const error: typeof sonner.error = (message, data) =>
	sonner.error(message, {
		duration: Infinity,
		id: typeof message === 'string' ? `error:${message}` : undefined,
		...data
	});

const warning: typeof sonner.warning = (message, data) =>
	sonner.warning(message, {
		duration: Infinity,
		id: typeof message === 'string' ? `warning:${message}` : undefined,
		...data
	});

export const toast = {
	success: sonner.success,
	info: sonner.info,
	message: sonner.message,
	loading: sonner.loading,
	custom: sonner.custom,
	promise: sonner.promise,
	dismiss: sonner.dismiss,
	getActiveToasts: sonner.getActiveToasts,
	error,
	warning
};

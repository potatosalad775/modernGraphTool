// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	const __APP_VERSION__: string;

	interface Window {
		/**
		 * Operator config, set by `defaults/config.js` via a plain <script> tag in app.html.
		 * Shape is operator-authored and only validated on read — see $lib/utils/config.
		 */
		GRAPHTOOL_CONFIG?: Record<string, unknown>;
		/** IE/Edge-only marker; its absence is how we distinguish real iOS from Windows Phone. */
		MSStream?: unknown;
	}
}

export {};

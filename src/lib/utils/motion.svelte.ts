import { tick } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import {
	fly,
	slide,
	type FlyParams,
	type SlideParams,
	type TransitionConfig
} from 'svelte/transition';

/**
 * Reduced motion for the motion CSS cannot reach. The `prefers-reduced-motion` rule in
 * `routes/layout.css` stops CSS transitions and animations, but not a Svelte transition
 * (it runs through the Web Animations API) and not a d3 tween (it ticks from a timer).
 *
 * Built on `prefersReducedMotion` from `svelte/motion`, which reads `matchMedia` live,
 * so a setting changed while the page is open applies from the next transition, and
 * which is a plain `false` where there is no `window` (the node test project). It needs
 * no component context.
 *
 * Only *spatial* motion is swapped out. An opacity fade is not vestibular motion, so a
 * plain `fade` stays as it is, and so does a colour transition.
 */
export function reducedMotion(): boolean {
	return prefersReducedMotion.current;
}

/** A duration for a tween that must not run under reduced motion: `ms`, or 0. */
export function motionDuration(ms: number): number {
	return reducedMotion() ? 0 : ms;
}

/**
 * Runs a change that recolours the whole page (the theme flip) as one cross-fade of two
 * snapshots, through the View Transitions API. `change` and the effects it triggers run
 * inside the transition's callback, a frame later; where the API is missing or under reduced
 * motion it runs at once with no fade. Canvas and other live drawing hold still for the fade.
 */
export function crossFade(change: () => void): void {
	if (reducedMotion() || typeof document.startViewTransition !== 'function') {
		change();
		return;
	}
	document.startViewTransition(async () => {
		change();
		await tick();
	});
}

/**
 * Length of the cross-fade that stands in for a spatial transition. A snap would leave
 * the swap of a whole panel or drawer jarring in its own way, and `transitionend`-style
 * waits keep working; a short opacity change is the gentler default.
 */
const REDUCED_FADE_MS = 120;

function reducedFade(params: { delay?: number; duration?: number }): TransitionConfig {
	return {
		delay: params.delay ?? 0,
		duration: Math.min(params.duration ?? 400, REDUCED_FADE_MS),
		css: (t) => `opacity: ${t}`
	};
}

/** `fly`, or a short fade under reduced motion. Use as `in:flyOrFade` / `out:` / `transition:`. */
export function flyOrFade(node: Element, params: FlyParams = {}): TransitionConfig {
	return reducedMotion() ? reducedFade(params) : fly(node, params);
}

/** `slide`, or a short fade under reduced motion. */
export function slideOrFade(node: Element, params: SlideParams = {}): TransitionConfig {
	return reducedMotion() ? reducedFade(params) : slide(node, params);
}

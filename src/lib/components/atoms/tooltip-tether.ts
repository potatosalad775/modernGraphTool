import { Tooltip } from 'bits-ui';

export type TooltipPayload = { text: string; hint?: string };

/**
 * Connects every `Tooltip` trigger to the one root `TooltipHost` mounts. A trigger costs
 * a listener set instead of a root and a floating layer of its own, which matters with a
 * hundred-odd buttons on screen. With no host mounted — a component spec — triggers no-op.
 */
export const tooltipTether = Tooltip.createTether<TooltipPayload>();

/**
 * Trigger props that would fight the element's own: its id, type and tab order, a
 * `disabled` that would silence the tooltip on exactly the buttons whose title explains
 * why they are disabled, and a `data-state` that would shadow a popover trigger's `open`.
 * `aria-describedby` goes too — the tooltip repeats the accessible name, so pointing at
 * it reads the name twice.
 */
const DROPPED = new Set([
	'id',
	'type',
	'tabindex',
	'disabled',
	'aria-describedby',
	'data-state',
	'data-disabled',
	'data-delay-duration'
]);

/**
 * Lays a trigger's props under the element's own: the element's values win, event
 * handlers run both (the element's first), and the trigger's ref attachment rides along
 * under its symbol key next to any the element already carries.
 */
export function mergeTooltipProps<T extends object>(
	own: T,
	trigger: Record<string | symbol, unknown>
): T {
	const merged = { ...own } as Record<string | symbol, unknown>;
	for (const key of Object.keys(trigger)) {
		if (DROPPED.has(key)) continue;
		const ours = merged[key];
		const theirs = trigger[key];
		if (key.startsWith('on') && typeof ours === 'function' && typeof theirs === 'function') {
			merged[key] = (e: Event) => {
				ours(e);
				theirs(e);
			};
		} else {
			merged[key] = ours ?? theirs;
		}
	}
	for (const key of Object.getOwnPropertySymbols(trigger)) merged[key] = trigger[key];
	return merged as T;
}

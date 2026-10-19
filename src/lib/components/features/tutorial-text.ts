import type { Component } from 'svelte';

/** An icon drawn inline in tutorial text, for a control with no visible label to name. */
export interface InlineIcon {
	icon: Component;
	/** What a screen reader hears in the icon's place. */
	label: () => string;
}

export type TextPart = string | InlineIcon;

/** A line of tutorial text: plain, or with icons in it (`withIcons`). */
export type StepText = () => string | TextPart[];

/** Unicode's Private Use Area: no translation holds these, so they can mark the slots. */
const SLOT_BASE = 0xe000;
const SLOT_PATTERN = /([-])/;

/**
 * Fills each `{name}` placeholder of `message` with the icon of that name. The message
 * is rendered with a marker character per placeholder, then split on the markers, so a
 * translation can put the icons anywhere in its sentence.
 */
export function withIcons<K extends string>(
	message: (inputs: Record<K, string>) => string,
	icons: Record<K, InlineIcon>
): TextPart[] {
	const keys = Object.keys(icons) as K[];
	const inputs = Object.fromEntries(
		keys.map((key, i) => [key, String.fromCharCode(SLOT_BASE + i)])
	) as Record<K, string>;

	const parts: TextPart[] = [];
	for (const piece of message(inputs).split(SLOT_PATTERN)) {
		const key = piece.length === 1 ? keys[piece.charCodeAt(0) - SLOT_BASE] : undefined;
		if (key !== undefined) parts.push(icons[key]);
		else if (piece) parts.push(piece);
	}
	return parts;
}

import { describe, it, expect } from 'vitest';
import type { Component } from 'svelte';
import { withIcons, type InlineIcon } from './tutorial-text.js';

const gear: InlineIcon = { icon: {} as Component, label: () => 'Constraint' };
const plus: InlineIcon = { icon: {} as Component, label: () => 'Add band' };

describe('withIcons', () => {
	it('puts the icon where its placeholder sits', () => {
		const message = ({ icon }: { icon: string }) => `Open ${icon} and pick it.`;
		expect(withIcons(message, { icon: gear })).toEqual(['Open ', gear, ' and pick it.']);
	});

	it('follows the order a translation puts the icons in', () => {
		const message = ({ a, b }: { a: string; b: string }) => `${b} then ${a}`;
		expect(withIcons(message, { a: gear, b: plus })).toEqual([plus, ' then ', gear]);
	});

	it('leaves no empty strings at the edges', () => {
		const message = ({ icon }: { icon: string }) => icon;
		expect(withIcons(message, { icon: gear })).toEqual([gear]);
	});

	it('keeps a private-use character the message itself holds', () => {
		const message = ({ icon }: { icon: string }) => ` ${icon}`;
		expect(withIcons(message, { icon: gear })).toEqual(['', ' ', gear]);
	});
});

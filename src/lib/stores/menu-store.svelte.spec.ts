import { describe, it, expect, beforeEach } from 'vitest';
import { menuStore, MENU_PANELS } from './menu-store.svelte.js';

describe('MenuStore', () => {
	beforeEach(() => {
		menuStore.currentPanel = 'graph';
		menuStore.slideDirection = 1;
	});

	describe('setPanel', () => {
		it('sets currentPanel to the given panel', () => {
			menuStore.setPanel('equalizer');
			expect(menuStore.currentPanel).toBe('equalizer');
		});

		it('sets slideDirection to 1 when moving forward', () => {
			menuStore.currentPanel = 'device';
			menuStore.setPanel('graph');
			expect(menuStore.slideDirection).toBe(1);
		});

		it('sets slideDirection to -1 when moving backward', () => {
			menuStore.currentPanel = 'equalizer';
			menuStore.setPanel('device');
			expect(menuStore.slideDirection).toBe(-1);
		});

		it('sets slideDirection to 1 when staying on same panel', () => {
			menuStore.currentPanel = 'graph';
			menuStore.setPanel('graph');
			expect(menuStore.slideDirection).toBe(1);
		});

		it('handles jump from first to last panel', () => {
			menuStore.currentPanel = 'device';
			menuStore.setPanel('misc');
			expect(menuStore.slideDirection).toBe(1);
			expect(menuStore.currentPanel).toBe('misc');
		});

		it('handles jump from last to first panel', () => {
			menuStore.currentPanel = 'misc';
			menuStore.setPanel('device');
			expect(menuStore.slideDirection).toBe(-1);
			expect(menuStore.currentPanel).toBe('device');
		});
	});

	describe('MENU_PANELS', () => {
		it('contains all four panels in order', () => {
			expect(MENU_PANELS).toEqual(['device', 'graph', 'equalizer', 'misc']);
		});
	});
});

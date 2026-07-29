import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { settingsStore } from './settings-store.svelte.js';

const KEY_THEME = 'gt-settings-theme';
const KEY_LEGACY_THEME = 'gt-theme';
const KEY_PERSIST_MODE = 'gt-settings-autoeq-persist-mode';
const KEY_LINK_NORM = 'gt-settings-link-eq-normalization';
const KEY_AUTOEQ = 'gt-settings-autoeq-options';

const DEFAULT_AUTOEQ = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true
};

/** Put the singleton back to its constructed state between tests. */
function resetStore() {
	localStorage.clear();
	sessionStorage.clear();
	settingsStore.theme = 'light';
	settingsStore.autoEqPersistMode = 'session';
	settingsStore.linkEqNormalization = false;
	settingsStore.autoEqOptions = { ...DEFAULT_AUTOEQ };
	document.documentElement.classList.remove('dark');
}

function setConfig(value: unknown) {
	(window as unknown as { GRAPHTOOL_CONFIG: unknown }).GRAPHTOOL_CONFIG = value;
}

describe('SettingsStore', () => {
	let originalConfig: unknown;

	beforeEach(() => {
		originalConfig = window.GRAPHTOOL_CONFIG;
		resetStore();
	});

	afterEach(() => {
		setConfig(originalConfig);
		vi.restoreAllMocks();
	});

	describe('setTheme', () => {
		it('updates state, the html class and localStorage together', () => {
			settingsStore.setTheme('dark');

			expect(settingsStore.theme).toBe('dark');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
			expect(localStorage.getItem(KEY_THEME)).toBe('dark');
		});

		it('removes the html class when switching back to light', () => {
			settingsStore.setTheme('dark');
			settingsStore.setTheme('light');

			expect(document.documentElement.classList.contains('dark')).toBe(false);
			expect(localStorage.getItem(KEY_THEME)).toBe('light');
		});
	});

	describe('toggleTheme', () => {
		it('flips light to dark and back', () => {
			settingsStore.toggleTheme();
			expect(settingsStore.theme).toBe('dark');
			settingsStore.toggleTheme();
			expect(settingsStore.theme).toBe('light');
		});

		it('persists each flip', () => {
			settingsStore.toggleTheme();
			expect(localStorage.getItem(KEY_THEME)).toBe('dark');
		});
	});

	describe('setLinkEqNormalization', () => {
		it('persists true and false as strings', () => {
			settingsStore.setLinkEqNormalization(true);
			expect(settingsStore.linkEqNormalization).toBe(true);
			expect(localStorage.getItem(KEY_LINK_NORM)).toBe('true');

			settingsStore.setLinkEqNormalization(false);
			expect(settingsStore.linkEqNormalization).toBe(false);
			expect(localStorage.getItem(KEY_LINK_NORM)).toBe('false');
		});
	});

	describe('setAutoEqPersistMode', () => {
		it('does nothing when the mode is unchanged', () => {
			sessionStorage.setItem(KEY_AUTOEQ, 'untouched');
			settingsStore.setAutoEqPersistMode('session');

			expect(sessionStorage.getItem(KEY_AUTOEQ)).toBe('untouched');
			expect(localStorage.getItem(KEY_PERSIST_MODE)).toBeNull();
		});

		it('moves the AutoEQ options from session to local storage', () => {
			settingsStore.autoEqOptions = { ...DEFAULT_AUTOEQ, qMax: 4 };
			settingsStore.persistAutoEqOptions();
			expect(sessionStorage.getItem(KEY_AUTOEQ)).not.toBeNull();

			settingsStore.setAutoEqPersistMode('local');

			expect(settingsStore.autoEqPersistMode).toBe('local');
			expect(sessionStorage.getItem(KEY_AUTOEQ)).toBeNull();
			expect(JSON.parse(localStorage.getItem(KEY_AUTOEQ)!).qMax).toBe(4);
			expect(localStorage.getItem(KEY_PERSIST_MODE)).toBe('local');
		});

		it('moves them back from local to session storage', () => {
			settingsStore.setAutoEqPersistMode('local');
			settingsStore.setAutoEqPersistMode('session');

			expect(localStorage.getItem(KEY_AUTOEQ)).toBeNull();
			expect(sessionStorage.getItem(KEY_AUTOEQ)).not.toBeNull();
			expect(localStorage.getItem(KEY_PERSIST_MODE)).toBe('session');
		});
	});

	describe('persistAutoEqOptions', () => {
		it('writes to sessionStorage in session mode and localStorage in local mode', () => {
			settingsStore.autoEqOptions = { ...DEFAULT_AUTOEQ, gainMax: 9 };
			settingsStore.persistAutoEqOptions();
			expect(JSON.parse(sessionStorage.getItem(KEY_AUTOEQ)!).gainMax).toBe(9);
			expect(localStorage.getItem(KEY_AUTOEQ)).toBeNull();

			settingsStore.autoEqPersistMode = 'local';
			settingsStore.persistAutoEqOptions();
			expect(JSON.parse(localStorage.getItem(KEY_AUTOEQ)!).gainMax).toBe(9);
		});
	});

	describe('hydrate', () => {
		it('restores a saved theme', () => {
			localStorage.setItem(KEY_THEME, 'dark');
			settingsStore.hydrate();

			expect(settingsStore.theme).toBe('dark');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('migrates the legacy gt-theme key and removes it', () => {
			localStorage.setItem(KEY_LEGACY_THEME, 'dark');
			settingsStore.hydrate();

			expect(settingsStore.theme).toBe('dark');
			expect(localStorage.getItem(KEY_THEME)).toBe('dark');
			expect(localStorage.getItem(KEY_LEGACY_THEME)).toBeNull();
		});

		it('ignores a garbage theme value and falls through to config', () => {
			localStorage.setItem(KEY_THEME, 'chartreuse');
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'dark' } });
			settingsStore.hydrate();

			expect(settingsStore.theme).toBe('dark');
		});

		it('follows the OS preference when the config says system', () => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'system' } });
			vi.spyOn(window, 'matchMedia').mockReturnValue({
				matches: true
			} as unknown as MediaQueryList);

			settingsStore.hydrate();
			expect(settingsStore.theme).toBe('dark');
		});

		it('leaves the theme light when the config asks for light', () => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'light' } });
			settingsStore.hydrate();

			expect(settingsStore.theme).toBe('light');
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('restores the persist mode', () => {
			localStorage.setItem(KEY_PERSIST_MODE, 'local');
			settingsStore.hydrate();
			expect(settingsStore.autoEqPersistMode).toBe('local');
		});

		it('ignores an unrecognised persist mode', () => {
			localStorage.setItem(KEY_PERSIST_MODE, 'forever');
			settingsStore.hydrate();
			expect(settingsStore.autoEqPersistMode).toBe('session');
		});

		it('only enables link-normalization for the exact string "true"', () => {
			localStorage.setItem(KEY_LINK_NORM, 'TRUE');
			settingsStore.hydrate();
			expect(settingsStore.linkEqNormalization).toBe(false);

			localStorage.setItem(KEY_LINK_NORM, 'true');
			settingsStore.hydrate();
			expect(settingsStore.linkEqNormalization).toBe(true);
		});

		it('merges partial AutoEQ options over the defaults', () => {
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify({ qMax: 3.5 }));
			settingsStore.hydrate();

			expect(settingsStore.autoEqOptions.qMax).toBe(3.5);
			expect(settingsStore.autoEqOptions.freqMin).toBe(DEFAULT_AUTOEQ.freqMin);
			expect(settingsStore.autoEqOptions.useShelfFilter).toBe(true);
		});

		it('keeps the defaults when the stored AutoEQ options are malformed', () => {
			sessionStorage.setItem(KEY_AUTOEQ, '{not json');
			settingsStore.hydrate();
			expect(settingsStore.autoEqOptions).toEqual(DEFAULT_AUTOEQ);
		});

		it('reads AutoEQ options from localStorage once the persist mode is local', () => {
			localStorage.setItem(KEY_PERSIST_MODE, 'local');
			localStorage.setItem(KEY_AUTOEQ, JSON.stringify({ gainMin: -6 }));
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify({ gainMin: -99 }));

			settingsStore.hydrate();
			expect(settingsStore.autoEqOptions.gainMin).toBe(-6);
		});
	});
});

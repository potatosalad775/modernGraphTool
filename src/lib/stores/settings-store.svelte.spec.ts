import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { settingsStore } from './settings-store.svelte.js';

const KEY_THEME = 'gt-settings-theme';
const KEY_LEGACY_THEME = 'gt-theme';
const KEY_PERSIST_MODE = 'gt-settings-autoeq-persist-mode';
const KEY_LINK_NORM = 'gt-settings-link-eq-normalization';
const KEY_AUTOEQ = 'gt-settings-autoeq-options';
const KEY_FREQ_TUTORIAL = 'gt-settings-frequency-tutorial';
const KEY_SINGLE_KEY = 'gt-settings-single-key-shortcuts';

const DEFAULT_AUTOEQ = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true,
	exactMatch: true
};

/** Put the singleton back to its constructed state between tests. */
function resetStore() {
	localStorage.clear();
	sessionStorage.clear();
	settingsStore.theme = 'light';
	settingsStore.followsSystem = false;
	settingsStore.osTheme = 'light';
	settingsStore.autoEqPersistMode = 'session';
	settingsStore.linkEqNormalization = false;
	settingsStore.autoEqOptions = { ...DEFAULT_AUTOEQ };
	settingsStore.frequencyTutorialVisible = false;
	settingsStore.singleKeyShortcuts = true;
	document.documentElement.classList.remove('dark');
}

function setConfig(value: unknown) {
	(window as unknown as { GRAPHTOOL_CONFIG: unknown }).GRAPHTOOL_CONFIG = value;
}

/** Pretend the OS asks for dark or light; returns the listeners the store registered. */
function mockSystem(dark: boolean) {
	const listeners: ((e: { matches: boolean }) => void)[] = [];
	vi.spyOn(window, 'matchMedia').mockReturnValue({
		matches: dark,
		addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
		removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
			const at = listeners.indexOf(fn);
			if (at >= 0) listeners.splice(at, 1);
		}
	} as unknown as MediaQueryList);
	return {
		listeners,
		flip(to: boolean) {
			for (const fn of listeners) fn({ matches: to });
		}
	};
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
			mockSystem(true);
			settingsStore.setTheme('dark');
			settingsStore.setTheme('light');

			expect(document.documentElement.classList.contains('dark')).toBe(false);
			expect(localStorage.getItem(KEY_THEME)).toBe('light');
		});

		it('always stores the choice when the operator default is not system', () => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'light' } });
			mockSystem(false);
			settingsStore.setTheme('light');

			expect(localStorage.getItem(KEY_THEME)).toBe('light');
			expect(settingsStore.followsSystem).toBe(false);
		});
	});

	describe('toggleTheme', () => {
		it('flips light to dark and back', () => {
			settingsStore.toggleTheme();
			expect(settingsStore.theme).toBe('dark');
			settingsStore.toggleTheme();
			expect(settingsStore.theme).toBe('light');
		});

		it('persists a flip that differs from the OS', () => {
			mockSystem(false);
			settingsStore.toggleTheme();
			expect(localStorage.getItem(KEY_THEME)).toBe('dark');
			expect(settingsStore.followsSystem).toBe(false);
		});

		it('clears the stored choice when it lands on the OS theme, and follows the OS again', () => {
			const os = mockSystem(false);
			settingsStore.hydrate();
			settingsStore.toggleTheme(); // dark, against the OS
			expect(settingsStore.toggleResumesSystem).toBe(true);
			settingsStore.toggleTheme(); // light, the OS's own

			expect(localStorage.getItem(KEY_THEME)).toBeNull();
			expect(settingsStore.followsSystem).toBe(true);
			os.flip(true);
			expect(settingsStore.theme).toBe('dark');
		});
	});

	describe('system theme', () => {
		beforeEach(() => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'system' } });
		});

		it('follows the OS while no choice is stored', () => {
			const os = mockSystem(false);
			settingsStore.hydrate();
			expect(settingsStore.followsSystem).toBe(true);
			expect(settingsStore.theme).toBe('light');

			os.flip(true);
			expect(settingsStore.theme).toBe('dark');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
			os.flip(false);
			expect(settingsStore.theme).toBe('light');
		});

		it('ignores the OS once the user has chosen', () => {
			localStorage.setItem(KEY_THEME, 'light');
			const os = mockSystem(false);
			settingsStore.hydrate();
			expect(settingsStore.followsSystem).toBe(false);

			os.flip(true);
			expect(settingsStore.theme).toBe('light');
			expect(settingsStore.osTheme).toBe('dark');
		});

		it('registers one set of listeners however often it hydrates', () => {
			const os = mockSystem(false);
			settingsStore.hydrate();
			settingsStore.hydrate();
			expect(os.listeners).toHaveLength(1);
		});

		it('adopts another tab’s choice, and its reset, from the storage event', () => {
			mockSystem(false);
			settingsStore.hydrate();

			localStorage.setItem(KEY_THEME, 'dark');
			window.dispatchEvent(new StorageEvent('storage', { key: KEY_THEME, newValue: 'dark' }));
			expect(settingsStore.theme).toBe('dark');
			expect(settingsStore.followsSystem).toBe(false);

			localStorage.removeItem(KEY_THEME);
			window.dispatchEvent(new StorageEvent('storage', { key: KEY_THEME, newValue: null }));
			expect(settingsStore.theme).toBe('light');
			expect(settingsStore.followsSystem).toBe(true);
		});

		it('does not follow the OS when the operator default is a fixed theme', () => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'light' } });
			const os = mockSystem(true);
			settingsStore.hydrate();
			os.flip(true);

			expect(settingsStore.followsSystem).toBe(false);
			expect(settingsStore.theme).toBe('light');
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

	describe('setFrequencyTutorialVisible', () => {
		it('persists true and false as strings', () => {
			settingsStore.setFrequencyTutorialVisible(true);
			expect(settingsStore.frequencyTutorialVisible).toBe(true);
			expect(localStorage.getItem(KEY_FREQ_TUTORIAL)).toBe('true');

			settingsStore.setFrequencyTutorialVisible(false);
			expect(localStorage.getItem(KEY_FREQ_TUTORIAL)).toBe('false');
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

		it('hides the frequency tutorial when neither the user nor the config asks for it', () => {
			setConfig({});
			settingsStore.hydrate();
			expect(settingsStore.frequencyTutorialVisible).toBe(false);
		});

		it('shows the frequency tutorial when the config asks for it on first load', () => {
			setConfig({ INTERFACE: { SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD: true } });
			settingsStore.hydrate();
			expect(settingsStore.frequencyTutorialVisible).toBe(true);
		});

		it("lets the user's saved frequency tutorial choice override the config", () => {
			setConfig({ INTERFACE: { SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD: true } });
			localStorage.setItem(KEY_FREQ_TUTORIAL, 'false');
			settingsStore.hydrate();
			expect(settingsStore.frequencyTutorialVisible).toBe(false);

			setConfig({});
			localStorage.setItem(KEY_FREQ_TUTORIAL, 'true');
			settingsStore.hydrate();
			expect(settingsStore.frequencyTutorialVisible).toBe(true);
		});

		it('merges partial AutoEQ options over the defaults', () => {
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify({ qMax: 3.5 }));
			settingsStore.hydrate();

			expect(settingsStore.autoEqOptions.qMax).toBe(3.5);
			expect(settingsStore.autoEqOptions.freqMin).toBe(DEFAULT_AUTOEQ.freqMin);
			expect(settingsStore.autoEqOptions.useShelfFilter).toBe(true);
		});

		it('gives options saved before exact match existed the exact-match default', () => {
			const { exactMatch: _, ...saved } = DEFAULT_AUTOEQ;
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify(saved));
			settingsStore.hydrate();

			expect(settingsStore.autoEqOptions.exactMatch).toBe(true);
		});

		it('keeps the defaults when the stored AutoEQ options are malformed', () => {
			sessionStorage.setItem(KEY_AUTOEQ, '{not json');
			settingsStore.hydrate();
			expect(settingsStore.autoEqOptions).toEqual(DEFAULT_AUTOEQ);
		});

		it('falls back to the default for a stored value of the wrong type', () => {
			// A NaN written by the old number fields persisted as null.
			sessionStorage.setItem(
				KEY_AUTOEQ,
				JSON.stringify({ gainMin: null, gainMax: '9', qMin: 0.8, useShelfFilter: 'yes' })
			);
			settingsStore.hydrate();

			expect(settingsStore.autoEqOptions.gainMin).toBe(DEFAULT_AUTOEQ.gainMin);
			expect(settingsStore.autoEqOptions.gainMax).toBe(DEFAULT_AUTOEQ.gainMax);
			expect(settingsStore.autoEqOptions.useShelfFilter).toBe(true);
			expect(settingsStore.autoEqOptions.qMin).toBe(0.8);
		});

		it('keeps the defaults when the stored AutoEQ options are not an object', () => {
			for (const stored of ['null', '[1,2]', '7']) {
				sessionStorage.setItem(KEY_AUTOEQ, stored);
				settingsStore.hydrate();
				expect(settingsStore.autoEqOptions).toEqual(DEFAULT_AUTOEQ);
			}
		});

		it('resets a stored min/max pair whose min is above its max', () => {
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify({ freqMin: 9000, freqMax: 100 }));
			settingsStore.hydrate();

			expect(settingsStore.autoEqOptions.freqMin).toBe(DEFAULT_AUTOEQ.freqMin);
			expect(settingsStore.autoEqOptions.freqMax).toBe(DEFAULT_AUTOEQ.freqMax);
		});

		it('reads AutoEQ options from localStorage once the persist mode is local', () => {
			localStorage.setItem(KEY_PERSIST_MODE, 'local');
			localStorage.setItem(KEY_AUTOEQ, JSON.stringify({ gainMin: -6 }));
			sessionStorage.setItem(KEY_AUTOEQ, JSON.stringify({ gainMin: -99 }));

			settingsStore.hydrate();
			expect(settingsStore.autoEqOptions.gainMin).toBe(-6);
		});
	});

	describe('singleKeyShortcuts', () => {
		it('is on by default and after a hydrate with nothing stored', () => {
			settingsStore.hydrate();
			expect(settingsStore.singleKeyShortcuts).toBe(true);
		});

		it('persists the choice and restores an explicit off', () => {
			settingsStore.setSingleKeyShortcuts(false);
			expect(localStorage.getItem(KEY_SINGLE_KEY)).toBe('false');

			settingsStore.singleKeyShortcuts = true;
			settingsStore.hydrate();
			expect(settingsStore.singleKeyShortcuts).toBe(false);
		});

		it('ignores a stored value that is not exactly "false"', () => {
			for (const stored of ['true', '0', 'off', '']) {
				settingsStore.singleKeyShortcuts = true;
				localStorage.setItem(KEY_SINGLE_KEY, stored);
				settingsStore.hydrate();
				expect(settingsStore.singleKeyShortcuts).toBe(true);
			}
		});
	});
});

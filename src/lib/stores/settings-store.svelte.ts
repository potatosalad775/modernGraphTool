import { getConfigValue } from '#lib/utils/config.js';

const LS_KEYS = {
	theme: 'gt-settings-theme',
	persistMode: 'gt-settings-autoeq-persist-mode',
	linkNorm: 'gt-settings-link-eq-normalization',
	autoEqOpts: 'gt-settings-autoeq-options',
	devicePeqAutoWrite: 'gt-settings-device-peq-auto-write',
	volumeWarning: 'gt-settings-volume-warning',
	frequencyTutorial: 'gt-settings-frequency-tutorial',
	singleKeyShortcuts: 'gt-settings-single-key-shortcuts'
} as const;

const LEGACY_THEME_KEY = 'gt-theme';

export type AutoEqOptions = {
	freqMin: number;
	freqMax: number;
	qMin: number;
	qMax: number;
	gainMin: number;
	gainMax: number;
	useShelfFilter: boolean;
	/** Fit the curve's shape to 20 kHz rather than AutoEq's smoothed treble. */
	exactMatch: boolean;
};

export type AutoEqPersistMode = 'session' | 'local';

const DEFAULT_AUTOEQ: AutoEqOptions = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true,
	exactMatch: true
};

const NUMERIC_AUTOEQ_KEYS = ['freqMin', 'freqMax', 'qMin', 'qMax', 'gainMin', 'gainMax'] as const;
const BOOLEAN_AUTOEQ_KEYS = ['useShelfFilter', 'exactMatch'] as const;
const AUTOEQ_PAIRS = [
	['freqMin', 'freqMax'],
	['qMin', 'qMax'],
	['gainMin', 'gainMax']
] as const;

/**
 * Folds a stored AutoEQ options blob over the defaults. A key whose stored value has the wrong
 * type — `null` from a persisted `NaN`, a string, a non-finite number — falls back to its own
 * default rather than overriding it, and a pair stored with min above max resets both ends.
 */
function sanitizeAutoEqOptions(stored: unknown): AutoEqOptions {
	const out: AutoEqOptions = { ...DEFAULT_AUTOEQ };
	if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return out;
	const src = stored as Record<string, unknown>;
	for (const key of NUMERIC_AUTOEQ_KEYS) {
		const v = src[key];
		if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
	}
	for (const key of BOOLEAN_AUTOEQ_KEYS) {
		const v = src[key];
		if (typeof v === 'boolean') out[key] = v;
	}
	for (const [lo, hi] of AUTOEQ_PAIRS) {
		if (out[lo] > out[hi]) {
			out[lo] = DEFAULT_AUTOEQ[lo];
			out[hi] = DEFAULT_AUTOEQ[hi];
		}
	}
	return out;
}

type Theme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the OS asks for right now. Light when the browser can't say. */
function systemTheme(): Theme {
	return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/** The operator's `PREFERRED_DARK_MODE_THEME`; absent reads as `'system'`, as it always has. */
function configuredTheme(): unknown {
	return getConfigValue('INTERFACE.PREFERRED_DARK_MODE_THEME') ?? 'system';
}

/**
 * The inline script in the three HTML shells has usually set `.dark` before this module runs, so
 * start from it: the layout effect then has nothing to flip and no first-paint fade to play.
 */
function themeFromDocument(): Theme {
	return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
		? 'dark'
		: 'light';
}

class SettingsStore {
	/**
	 * Precedence, shared with the inline script in `src/app.html`, `cdn/cdn-index.html` and
	 * `site-template/index.html` (keep them in step): the user's stored choice, else the operator's
	 * `PREFERRED_DARK_MODE_THEME` (`'system'` = the OS), else light.
	 */
	theme = $state<Theme>(themeFromDocument());
	/**
	 * No stored choice and the operator default is `'system'`: `theme` tracks the OS and reacts to
	 * it changing. Choosing the theme the OS has right now gives up the stored choice, so the
	 * choice only persists while it differs from the OS and the same toggle gets back to this state.
	 */
	followsSystem = $state(false);
	/** The OS's current scheme, kept live so the toggle's hint can say where a click leads. */
	osTheme = $state<Theme>('light');

	/**
	 * Clicking the toggle now lands on the OS's own theme, which hands control back to the OS
	 * (see `followsSystem`). Only an operator default of `'system'` has that way back.
	 */
	get toggleResumesSystem(): boolean {
		return !this.followsSystem && configuredTheme() === 'system' && this.osTheme !== this.theme;
	}
	autoEqPersistMode = $state<AutoEqPersistMode>('session');
	linkEqNormalization = $state(false);
	autoEqOptions = $state<AutoEqOptions>({ ...DEFAULT_AUTOEQ });
	/** Write EQ changes to a connected device on their own, a moment after the last edit. */
	devicePeqAutoWrite = $state(false);
	/** Ask the user to lower the volume before this page first changes what plays. */
	volumeWarning = $state(true);
	/** Show the Frequency Tutorial strip under the graph. Hidden unless the operator or user opts in. */
	frequencyTutorialVisible = $state(false);
	/**
	 * The shortcuts that are a bare character key (`1`–`4`, `\`; WCAG 2.1.4). Off leaves only the
	 * modifier ones (Ctrl+Z …). On by default.
	 */
	singleKeyShortcuts = $state(true);

	hydrate(): void {
		if (typeof window === 'undefined') return;

		this.#resolveTheme();
		this.#watchTheme();

		const mode = localStorage.getItem(LS_KEYS.persistMode);
		if (mode === 'session' || mode === 'local') this.autoEqPersistMode = mode;

		const link = localStorage.getItem(LS_KEYS.linkNorm);
		if (link === 'true') this.linkEqNormalization = true;

		if (localStorage.getItem(LS_KEYS.devicePeqAutoWrite) === 'true') this.devicePeqAutoWrite = true;
		if (localStorage.getItem(LS_KEYS.volumeWarning) === 'false') this.volumeWarning = false;
		// Only an explicit 'false' turns it off; anything else stored keeps the default.
		if (localStorage.getItem(LS_KEYS.singleKeyShortcuts) === 'false')
			this.singleKeyShortcuts = false;

		// The user's own choice wins; the operator's config only sets the first-visit default.
		const tutorial = localStorage.getItem(LS_KEYS.frequencyTutorial);
		this.frequencyTutorialVisible =
			tutorial === 'true' ||
			(tutorial !== 'false' &&
				getConfigValue('INTERFACE.SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD') === true);

		const raw = this.#activeStorage().getItem(LS_KEYS.autoEqOpts);
		if (raw) {
			try {
				this.autoEqOptions = sanitizeAutoEqOptions(JSON.parse(raw));
			} catch {
				// malformed — keep defaults
			}
		}
	}

	setTheme(theme: Theme): void {
		this.#applyTheme(theme);
		this.osTheme = systemTheme();
		if (configuredTheme() === 'system' && theme === this.osTheme) {
			// The OS already asks for this: store nothing and follow it from here on.
			localStorage.removeItem(LS_KEYS.theme);
			this.followsSystem = true;
		} else {
			localStorage.setItem(LS_KEYS.theme, theme);
			this.followsSystem = false;
		}
	}

	toggleTheme(): void {
		this.setTheme(this.theme === 'light' ? 'dark' : 'light');
	}

	setAutoEqPersistMode(mode: AutoEqPersistMode): void {
		if (this.autoEqPersistMode === mode) return;
		const oldStorage = this.#activeStorage();
		this.autoEqPersistMode = mode;
		const newStorage = this.#activeStorage();
		oldStorage.removeItem(LS_KEYS.autoEqOpts);
		newStorage.setItem(LS_KEYS.autoEqOpts, JSON.stringify(this.autoEqOptions));
		localStorage.setItem(LS_KEYS.persistMode, mode);
	}

	setLinkEqNormalization(v: boolean): void {
		this.linkEqNormalization = v;
		localStorage.setItem(LS_KEYS.linkNorm, String(v));
	}

	setDevicePeqAutoWrite(v: boolean): void {
		this.devicePeqAutoWrite = v;
		localStorage.setItem(LS_KEYS.devicePeqAutoWrite, String(v));
	}

	setVolumeWarning(v: boolean): void {
		this.volumeWarning = v;
		localStorage.setItem(LS_KEYS.volumeWarning, String(v));
	}

	setSingleKeyShortcuts(v: boolean): void {
		this.singleKeyShortcuts = v;
		localStorage.setItem(LS_KEYS.singleKeyShortcuts, String(v));
	}

	setFrequencyTutorialVisible(v: boolean): void {
		this.frequencyTutorialVisible = v;
		localStorage.setItem(LS_KEYS.frequencyTutorial, String(v));
	}

	persistAutoEqOptions(): void {
		if (typeof window === 'undefined') return;
		this.#activeStorage().setItem(LS_KEYS.autoEqOpts, JSON.stringify(this.autoEqOptions));
	}

	#applyTheme(theme: Theme): void {
		this.theme = theme;
		document.documentElement.classList.toggle('dark', theme === 'dark');
	}

	/** The stored choice, migrating the pre-`gt-settings-*` key the first time it is seen. */
	#storedTheme(): Theme | null {
		const saved = localStorage.getItem(LS_KEYS.theme);
		if (saved === 'light' || saved === 'dark') return saved;
		const legacy = localStorage.getItem(LEGACY_THEME_KEY);
		if (legacy === 'light' || legacy === 'dark') {
			localStorage.setItem(LS_KEYS.theme, legacy);
			localStorage.removeItem(LEGACY_THEME_KEY);
			return legacy;
		}
		return null;
	}

	/** Stored choice, else the operator default, else light; sets `followsSystem` to match. */
	#resolveTheme(): void {
		const stored = this.#storedTheme();
		const cfg = configuredTheme();
		this.osTheme = systemTheme();
		this.followsSystem = stored === null && cfg === 'system';
		this.#applyTheme(
			stored ?? (cfg === 'dark' ? 'dark' : cfg === 'system' ? this.osTheme : 'light')
		);
	}

	#unwatchTheme: (() => void) | null = null;

	/**
	 * Follow the OS while no choice is stored, and another tab's choice (or its reset). Installed
	 * from `hydrate()`, once per page; a second call replaces the first rather than doubling it.
	 */
	#watchTheme(): void {
		this.#unwatchTheme?.();
		const mq = window.matchMedia?.(DARK_QUERY);
		const onScheme = (e: MediaQueryListEvent) => {
			this.osTheme = e.matches ? 'dark' : 'light';
			if (this.followsSystem) this.#applyTheme(this.osTheme);
		};
		const onStorage = (e: StorageEvent) => {
			// A null key is `localStorage.clear()`.
			if (e.key === LS_KEYS.theme || e.key === null) this.#resolveTheme();
		};
		mq?.addEventListener?.('change', onScheme);
		window.addEventListener('storage', onStorage);
		this.#unwatchTheme = () => {
			mq?.removeEventListener?.('change', onScheme);
			window.removeEventListener('storage', onStorage);
		};
	}

	#activeStorage(): Storage {
		return this.autoEqPersistMode === 'local' ? localStorage : sessionStorage;
	}
}

export const settingsStore = new SettingsStore();

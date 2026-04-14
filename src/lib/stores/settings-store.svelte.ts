import { getConfigValue } from '$lib/utils/config.js';

const LS_KEYS = {
	theme: 'gt-settings-theme',
	persistMode: 'gt-settings-autoeq-persist-mode',
	linkNorm: 'gt-settings-link-eq-normalization',
	autoEqOpts: 'gt-settings-autoeq-options'
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
};

export type AutoEqPersistMode = 'session' | 'local';

const DEFAULT_AUTOEQ: AutoEqOptions = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true
};

class SettingsStore {
	theme = $state<'light' | 'dark'>('light');
	autoEqPersistMode = $state<AutoEqPersistMode>('session');
	linkEqNormalization = $state(false);
	autoEqOptions = $state<AutoEqOptions>({ ...DEFAULT_AUTOEQ });

	hydrate(): void {
		if (typeof window === 'undefined') return;

		let savedTheme = localStorage.getItem(LS_KEYS.theme) as 'light' | 'dark' | null;
		if (savedTheme !== 'light' && savedTheme !== 'dark') {
			const legacy = localStorage.getItem(LEGACY_THEME_KEY);
			if (legacy === 'light' || legacy === 'dark') {
				savedTheme = legacy;
				localStorage.setItem(LS_KEYS.theme, legacy);
				localStorage.removeItem(LEGACY_THEME_KEY);
			}
		}
		if (savedTheme === 'light' || savedTheme === 'dark') {
			this.theme = savedTheme;
		} else {
			const cfg = (getConfigValue('INTERFACE.PREFERRED_DARK_MODE_THEME') as string) ?? 'system';
			if (cfg === 'dark') {
				this.theme = 'dark';
			} else if (cfg === 'system') {
				this.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			}
		}
		document.documentElement.classList.toggle('dark', this.theme === 'dark');

		const mode = localStorage.getItem(LS_KEYS.persistMode);
		if (mode === 'session' || mode === 'local') this.autoEqPersistMode = mode;

		const link = localStorage.getItem(LS_KEYS.linkNorm);
		if (link === 'true') this.linkEqNormalization = true;

		const raw = this.#activeStorage().getItem(LS_KEYS.autoEqOpts);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partial<AutoEqOptions>;
				this.autoEqOptions = { ...DEFAULT_AUTOEQ, ...parsed };
			} catch {
				// malformed — keep defaults
			}
		}
	}

	setTheme(theme: 'light' | 'dark'): void {
		this.theme = theme;
		document.documentElement.classList.toggle('dark', theme === 'dark');
		localStorage.setItem(LS_KEYS.theme, theme);
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

	persistAutoEqOptions(): void {
		if (typeof window === 'undefined') return;
		this.#activeStorage().setItem(LS_KEYS.autoEqOpts, JSON.stringify(this.autoEqOptions));
	}

	#activeStorage(): Storage {
		return this.autoEqPersistMode === 'local' ? localStorage : sessionStorage;
	}
}

export const settingsStore = new SettingsStore();

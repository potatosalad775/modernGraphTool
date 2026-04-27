import "./environment.js";
import "./runtime.js";
function getConfigValue(path) {}
//#endregion
//#region src/lib/stores/settings-store.svelte.ts
var LS_KEYS = {
	theme: "gt-settings-theme",
	persistMode: "gt-settings-autoeq-persist-mode",
	linkNorm: "gt-settings-link-eq-normalization",
	autoEqOpts: "gt-settings-autoeq-options"
};
var LEGACY_THEME_KEY = "gt-theme";
var DEFAULT_AUTOEQ = {
	freqMin: 20,
	freqMax: 15e3,
	qMin: .5,
	qMax: 2,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true
};
var SettingsStore = class {
	theme = "light";
	autoEqPersistMode = "session";
	linkEqNormalization = false;
	autoEqOptions = { ...DEFAULT_AUTOEQ };
	hydrate() {
		if (typeof window === "undefined") return;
		let savedTheme = localStorage.getItem(LS_KEYS.theme);
		if (savedTheme !== "light" && savedTheme !== "dark") {
			const legacy = localStorage.getItem(LEGACY_THEME_KEY);
			if (legacy === "light" || legacy === "dark") {
				savedTheme = legacy;
				localStorage.setItem(LS_KEYS.theme, legacy);
				localStorage.removeItem(LEGACY_THEME_KEY);
			}
		}
		if (savedTheme === "light" || savedTheme === "dark") this.theme = savedTheme;
		else {
			const cfg = getConfigValue("INTERFACE.PREFERRED_DARK_MODE_THEME") ?? "system";
			if (cfg === "dark") this.theme = "dark";
			else if (cfg === "system") this.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		document.documentElement.classList.toggle("dark", this.theme === "dark");
		const mode = localStorage.getItem(LS_KEYS.persistMode);
		if (mode === "session" || mode === "local") this.autoEqPersistMode = mode;
		if (localStorage.getItem(LS_KEYS.linkNorm) === "true") this.linkEqNormalization = true;
		const raw = this.#activeStorage().getItem(LS_KEYS.autoEqOpts);
		if (raw) try {
			const parsed = JSON.parse(raw);
			this.autoEqOptions = {
				...DEFAULT_AUTOEQ,
				...parsed
			};
		} catch {}
	}
	setTheme(theme) {
		this.theme = theme;
		document.documentElement.classList.toggle("dark", theme === "dark");
		localStorage.setItem(LS_KEYS.theme, theme);
	}
	toggleTheme() {
		this.setTheme(this.theme === "light" ? "dark" : "light");
	}
	setAutoEqPersistMode(mode) {
		if (this.autoEqPersistMode === mode) return;
		const oldStorage = this.#activeStorage();
		this.autoEqPersistMode = mode;
		const newStorage = this.#activeStorage();
		oldStorage.removeItem(LS_KEYS.autoEqOpts);
		newStorage.setItem(LS_KEYS.autoEqOpts, JSON.stringify(this.autoEqOptions));
		localStorage.setItem(LS_KEYS.persistMode, mode);
	}
	setLinkEqNormalization(v) {
		this.linkEqNormalization = v;
		localStorage.setItem(LS_KEYS.linkNorm, String(v));
	}
	persistAutoEqOptions() {
		if (typeof window === "undefined") return;
		this.#activeStorage().setItem(LS_KEYS.autoEqOpts, JSON.stringify(this.autoEqOptions));
	}
	#activeStorage() {
		return this.autoEqPersistMode === "local" ? localStorage : sessionStorage;
	}
};
var settingsStore = new SettingsStore();
//#endregion
export { getConfigValue as n, settingsStore as t };

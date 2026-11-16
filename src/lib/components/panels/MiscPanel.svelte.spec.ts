/**
 * `MiscPanel` is the settings/about tab: theme toggle, language picker, the
 * operator-authored description blocks and the footer links.
 *
 * Almost everything it renders is driven by `window.GRAPHTOOL_CONFIG`, so each
 * test sets the config it needs before rendering.
 *
 * `setLocale` is stubbed — the real one reloads the page, which would tear the
 * test runner's iframe down mid-run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import MiscPanel, { CHANGELOG_URL } from './MiscPanel.svelte';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { analyticsService } from '#lib/services/analytics-service.svelte.js';
import { setLocale, locales } from '#lib/paraglide/runtime.js';

vi.mock('#lib/paraglide/runtime.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/runtime.js')>();
	return { ...actual, setLocale: vi.fn() };
});

function setConfig(cfg: Record<string, unknown>) {
	window.GRAPHTOOL_CONFIG = cfg as never;
}

/** The switches sit in the Settings section, which starts closed and renders nothing until open. */
async function openSettings() {
	await page.getByRole('button', { name: 'Settings' }).click();
}

describe('MiscPanel', () => {
	beforeEach(() => {
		setConfig({});
		settingsStore.theme = 'light';
		settingsStore.followsSystem = false;
		settingsStore.osTheme = 'light';
		vi.mocked(setLocale).mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
		document.documentElement.classList.remove('dark');
	});

	// ── Theme ────────────────────────────────────────────────────────────────

	describe('theme toggle', () => {
		it('offers dark mode while the light theme is active', async () => {
			render(MiscPanel);

			await expect
				.element(page.getByRole('button', { name: 'Switch to dark mode' }))
				.toBeInTheDocument();
		});

		it('switches the store and the button over on click', async () => {
			render(MiscPanel);
			await page.getByRole('button', { name: 'Switch to dark mode' }).click();

			expect(settingsStore.theme).toBe('dark');
			await expect
				.element(page.getByRole('button', { name: 'Switch to light mode' }))
				.toBeInTheDocument();
		});

		it('toggles back to light on a second click', async () => {
			render(MiscPanel);
			await page.getByRole('button', { name: 'Switch to dark mode' }).click();
			await page.getByRole('button', { name: 'Switch to light mode' }).click();

			expect(settingsStore.theme).toBe('light');
		});

		it('says so while the theme follows the system', async () => {
			settingsStore.followsSystem = true;
			render(MiscPanel);

			await expect
				.element(page.getByRole('button', { name: 'Switch to dark mode' }))
				.toHaveAccessibleDescription(/Following your device/);
		});

		it('says a click back to the system theme resumes following it', async () => {
			setConfig({ INTERFACE: { PREFERRED_DARK_MODE_THEME: 'system' } });
			settingsStore.theme = 'dark';
			render(MiscPanel);

			await expect
				.element(page.getByRole('button', { name: 'Switch to light mode' }))
				.toHaveAccessibleDescription(/follows it again/);
		});
	});

	// ── Language ─────────────────────────────────────────────────────────────

	describe('language picker', () => {
		it('stays hidden while i18n is off', async () => {
			render(MiscPanel);

			await expect
				.element(page.getByRole('button', { name: 'Switch to dark mode' }))
				.toBeInTheDocument();
			expect(page.getByRole('combobox').elements()).toHaveLength(0);
		});

		it('lists every registered locale when i18n is on', async () => {
			setConfig({ LANGUAGE: { ENABLE_I18N: true } });
			render(MiscPanel);

			const select = page.getByRole('combobox');
			await expect.element(select).toBeInTheDocument();
			expect((select.element() as HTMLSelectElement).options).toHaveLength(locales.length);
		});

		it('labels each locale with its own endonym', async () => {
			setConfig({ LANGUAGE: { ENABLE_I18N: true } });
			render(MiscPanel);

			const options = [...(page.getByRole('combobox').element() as HTMLSelectElement).options];
			const ko = options.find((o) => o.value === 'ko');
			expect(ko?.textContent).toBe('한국어');
		});

		it('names the picker for assistive tech', async () => {
			setConfig({ LANGUAGE: { ENABLE_I18N: true } });
			render(MiscPanel);

			await expect.element(page.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
		});

		it('switches locale on change', async () => {
			setConfig({ LANGUAGE: { ENABLE_I18N: true } });
			render(MiscPanel);
			await page.getByRole('combobox').selectOptions('ko');

			expect(setLocale).toHaveBeenCalledWith('ko');
		});
	});

	// ── Single-key shortcuts ─────────────────────────────────────────────────

	describe('single-key shortcuts switch', () => {
		afterEach(() => {
			settingsStore.singleKeyShortcuts = true;
			localStorage.removeItem('gt-settings-single-key-shortcuts');
		});

		it('is on by default and named by its label', async () => {
			render(MiscPanel);
			await openSettings();

			const toggle = page.getByRole('switch', { name: 'Single-key shortcuts' });
			await expect.element(toggle).toBeChecked();
		});

		it('turns the shortcuts off and persists the choice', async () => {
			render(MiscPanel);
			await openSettings();
			await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();

			expect(settingsStore.singleKeyShortcuts).toBe(false);
			expect(localStorage.getItem('gt-settings-single-key-shortcuts')).toBe('false');
		});
	});

	// ── Analytics consent ────────────────────────────────────────────────────

	describe('usage statistics switch', () => {
		afterEach(() => {
			analyticsService.available = false;
			analyticsService.consent = 'granted';
		});

		it('is absent where the deployment has no analytics', async () => {
			render(MiscPanel);
			await openSettings();

			await expect
				.element(page.getByRole('switch', { name: 'Single-key shortcuts' }))
				.toBeInTheDocument();
			expect(page.getByRole('switch', { name: 'Usage statistics' }).query()).toBeNull();
		});

		it('shows the current answer and passes a change to the service', async () => {
			analyticsService.available = true;
			analyticsService.consent = 'denied';
			const setConsent = vi.spyOn(analyticsService, 'setConsent').mockImplementation(() => {});
			render(MiscPanel);
			await openSettings();

			const toggle = page.getByRole('switch', { name: 'Usage statistics' });
			await expect.element(toggle).not.toBeChecked();
			await toggle.click();
			expect(setConsent).toHaveBeenCalledWith(true);
		});
	});

	// ── Operator description ─────────────────────────────────────────────────

	describe('description blocks', () => {
		it('renders nothing when the config has no description', async () => {
			render(MiscPanel);

			await expect.element(page.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
			expect(document.querySelectorAll('img')).toHaveLength(0);
		});

		it('renders a text block as a paragraph', async () => {
			setConfig({ DESCRIPTION: [{ TYPE: 'text', CONTENT: 'Measured on a 5128 rig.' }] });
			render(MiscPanel);

			await expect.element(page.getByText('Measured on a 5128 rig.')).toBeInTheDocument();
		});

		it('renders an image block', async () => {
			setConfig({ DESCRIPTION: [{ TYPE: 'IMAGE', CONTENT: './assets/banner.png' }] });
			render(MiscPanel);

			// The image is decorative (`alt=""`), so it has no `img` role to query by.
			await vi.waitFor(() =>
				expect(document.querySelector('img')?.getAttribute('src')).toBe('./assets/banner.png')
			);
		});

		it('injects an html block verbatim', async () => {
			setConfig({ DESCRIPTION: [{ TYPE: 'html', CONTENT: '<b>Bold notice</b>' }] });
			render(MiscPanel);

			const el = page.getByText('Bold notice');
			await expect.element(el).toBeInTheDocument();
			expect(el.element().tagName).toBe('B');
		});

		it('skips a block with an unknown type', async () => {
			setConfig({ DESCRIPTION: [{ TYPE: 'video', CONTENT: 'ignored content' }] });
			render(MiscPanel);

			expect(page.getByText('ignored content').elements()).toHaveLength(0);
		});
	});

	// ── Footer ───────────────────────────────────────────────────────────────

	describe('footer', () => {
		it('prints the build version', async () => {
			render(MiscPanel);

			await expect.element(page.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
		});

		it('links to the repository and the docs', async () => {
			render(MiscPanel);

			await expect
				.element(page.getByRole('link', { name: 'GitHub' }))
				.toHaveAttribute('href', 'https://github.com/potatosalad775/modernGraphTool');
			await expect
				.element(page.getByRole('link', { name: 'Documentation' }))
				.toHaveAttribute('href', 'https://potatosalad775.github.io/modernGraphTool/docs');
		});

		it('links to the changelog, the same page the version toast opens', async () => {
			render(MiscPanel);

			await expect
				.element(page.getByRole('link', { name: 'Changelog' }))
				.toHaveAttribute('href', CHANGELOG_URL);
		});

		it('shows the donate link by default', async () => {
			render(MiscPanel);

			await expect
				.element(page.getByRole('link', { name: 'Support on Ko-fi' }))
				.toBeInTheDocument();
		});

		it('hides the donate link when the operator opts out', async () => {
			setConfig({ INTERFACE: { HIDE_DEV_DONATE_BUTTON: true } });
			render(MiscPanel);

			expect(page.getByRole('link', { name: 'Support on Ko-fi' }).elements()).toHaveLength(0);
		});
	});
});

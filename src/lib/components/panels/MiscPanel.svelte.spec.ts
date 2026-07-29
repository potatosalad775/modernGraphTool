/**
 * `MiscPanel` is the settings/about tab: theme toggle, language picker, the
 * operator-authored description blocks and the footer links.
 *
 * Almost everything it renders is driven by `window.GRAPHTOOL_CONFIG`, so each
 * test sets the config it needs before rendering. `PREFERENCE_BOUND` is read at
 * component init rather than in a `$derived`, so it can only be set up front.
 *
 * `setLocale` is stubbed — the real one reloads the page, which would tear the
 * test runner's iframe down mid-run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import MiscPanel from './MiscPanel.svelte';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { setLocale, locales } from '$lib/paraglide/runtime.js';
import * as m from '$lib/paraglide/messages.js';

vi.mock('$lib/paraglide/runtime.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/paraglide/runtime.js')>();
	return { ...actual, setLocale: vi.fn() };
});

function setConfig(cfg: Record<string, unknown>) {
	window.GRAPHTOOL_CONFIG = cfg as never;
}

describe('MiscPanel', () => {
	beforeEach(() => {
		setConfig({});
		settingsStore.theme = 'light';
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

		it('switches locale on change', async () => {
			setConfig({ LANGUAGE: { ENABLE_I18N: true } });
			render(MiscPanel);
			await page.getByRole('combobox').selectOptions('ko');

			expect(setLocale).toHaveBeenCalledWith('ko');
		});
	});

	// ── Operator description ─────────────────────────────────────────────────

	describe('description blocks', () => {
		it('renders nothing when the config has no description', async () => {
			render(MiscPanel);

			await expect.element(page.getByTitle('GitHub')).toBeInTheDocument();
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

	// ── Preference bound note ────────────────────────────────────────────────

	describe('preference bound note', () => {
		it('names the configured base target', async () => {
			setConfig({ PREFERENCE_BOUND: { BASE_DF_TARGET_FILE: 'KEMAR DF' } });
			render(MiscPanel);

			await expect
				.element(page.getByText(`${m.pref_bound_description_label()}: KEMAR DF`))
				.toBeInTheDocument();
		});

		it('is omitted when no base target is configured', async () => {
			render(MiscPanel);

			expect(
				page.getByText(m.pref_bound_description_label(), { exact: false }).elements()
			).toHaveLength(0);
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
				.element(page.getByTitle('GitHub'))
				.toHaveAttribute('href', 'https://github.com/potatosalad775/modernGraphTool');
			await expect
				.element(page.getByTitle('Documentation'))
				.toHaveAttribute('href', 'https://potatosalad775.github.io/modernGraphTool/docs');
		});

		it('shows the donate link by default', async () => {
			render(MiscPanel);

			await expect.element(page.getByTitle('Support on Ko-fi')).toBeInTheDocument();
		});

		it('hides the donate link when the operator opts out', async () => {
			setConfig({ INTERFACE: { HIDE_DEV_DONATE_BUTTON: true } });
			render(MiscPanel);

			expect(page.getByTitle('Support on Ko-fi').elements()).toHaveLength(0);
		});
	});
});

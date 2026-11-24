/**
 * `PhoneSelector` renders the brand / device panes. This spec covers the two
 * pieces of a device row that come straight out of `phone_book.json`: the HTML
 * description and the operator-defined `links` list.
 *
 * `MetadataParser.phoneMetadata` is a module singleton read directly by the
 * component, so it is stubbed rather than mocked — no fetch involved. Cross-site
 * search stays inert because it only loads on a query of 2+ characters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import PhoneSelector from './PhoneSelector.svelte';
import MetadataParser from '#lib/utils/metadata-parser.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import { rankingService } from '#lib/services/ranking-service.svelte.js';
import type { BrandMetadata, FRDataObject, PhoneMetadata } from '#lib/types/data-types.js';

type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

function makePhone(overrides: Partial<PhoneMetadata> = {}): PhoneMetadata {
	return {
		brand: 'Sennheiser',
		name: 'HD 600',
		identifier: 'Sennheiser HD 600',
		files: [
			{
				suffix: '',
				fullName: 'Sennheiser HD 600',
				files: { L: 'HD 600 L.txt', R: 'HD 600 R.txt' },
				fileName: 'HD 600'
			}
		],
		...overrides
	};
}

function stubBook(phone: PhoneMetadata): void {
	const book: BrandMetadata[] = [{ brand: phone.brand, phones: [phone] }];
	MetadataParser.phoneMetadata = book;
}

/** A row only shows its meta line (links, price, review) once the device is loaded. */
function markLoaded(phone: PhoneMetadata): void {
	frStore.set('uuid-1', {
		uuid: 'uuid-1',
		type: 'phone',
		identifier: phone.identifier,
		channels: {},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#f00', R: '#00f', AVG: '#0f0' },
		dash: '1 0'
	} as unknown as FRDataObject);
}

describe('PhoneSelector', () => {
	let realBook: BrandMetadata[] | null;

	beforeEach(() => {
		realBook = MetadataParser.phoneMetadata;
	});

	afterEach(() => {
		MetadataParser.phoneMetadata = realBook;
		frStore.delete('uuid-1');
		delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
		rankingService.scale = [];
		vi.restoreAllMocks();
	});

	describe('search tips', () => {
		it('opens the hint popover from the header button', async () => {
			stubBook(makePhone());
			await render(PhoneSelector);

			await page.getByRole('button', { name: 'Search tips' }).click();

			// The examples are literal, so they double as the popover's fingerprint — every
			// other line in there is a Paraglide string and moves with the locale. Mirrored
			// in the `ps-help-code` samples in PhoneSelector.svelte; change both together.
			await expect.element(page.getByText('hd 600, u12t')).toBeInTheDocument();
			await expect
				.element(page.getByText('Separate devices with commas', { exact: false }))
				.toBeInTheDocument();
			await expect.element(page.getByText('lyro // lyrö')).toBeInTheDocument();
			await expect.element(page.getByText('earphones -pro -max')).toBeInTheDocument();
		});

		// The trigger is a sibling of the field, not the label's icon — clicking it
		// must not pull focus into the input and fight the popover's focus trap.
		it('leaves the search field unfocused when the hint is opened', async () => {
			stubBook(makePhone());
			await render(PhoneSelector);

			await page.getByRole('button', { name: 'Search tips' }).click();

			await expect.element(page.getByText('hd 600, u12t')).toBeInTheDocument();
			const input = document.querySelector('input[type="search"]');
			expect(document.activeElement).not.toBe(input);
		});

		// The narrow layout keeps the trigger alongside the Brands/Devices toggle;
		// it is `shrink-0` and measurably costs the search field no width there.
		it('shows the trigger alongside the nav toggle on a narrow container', async () => {
			stubBook(makePhone());
			await render(PhoneSelector);

			const host = document.querySelector('[style*="container-type"]') as HTMLElement;
			host.style.width = '420px';

			await vi.waitFor(() => expect(host.querySelector('.ps-nav-btn')).toBeInstanceOf(HTMLElement));
			await expect.element(page.getByRole('button', { name: 'Search tips' })).toBeInTheDocument();
		});
	});

	describe('search field', () => {
		it('has an accessible name and text-correction hints off', async () => {
			stubBook(makePhone());
			await render(PhoneSelector);

			const input = page.getByRole('searchbox', { name: 'Search devices' });
			await expect.element(input).toBeInTheDocument();
			const el = input.element();
			expect(el.getAttribute('autocomplete')).toBe('off');
			expect(el.getAttribute('autocorrect')).toBe('off');
			expect(el.getAttribute('autocapitalize')).toBe('none');
			expect(el.getAttribute('spellcheck')).toBe('false');
			expect(el.getAttribute('enterkeyhint')).toBe('search');
		});
	});

	describe('pressed state', () => {
		it('exposes a loaded device and a selected brand through aria-pressed', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			const phone = makePhone();
			stubBook(phone);
			await render(PhoneSelector);

			const row = page.getByRole('button', { name: /HD 600/ });
			await expect.element(row).toHaveAttribute('aria-pressed', 'false');
			markLoaded(phone);
			await expect.element(row).toHaveAttribute('aria-pressed', 'true');

			const brand = page.getByRole('button', { name: 'Sennheiser', exact: true });
			await expect.element(brand).toHaveAttribute('aria-pressed', 'false');
			await brand.click();
			await expect.element(brand).toHaveAttribute('aria-pressed', 'true');
		});
	});

	describe('result count announcement', () => {
		function status(): string {
			return document.querySelector('[role="status"]')?.textContent.trim() ?? '';
		}

		it('says nothing until a filter is active, then speaks the count once typing settles', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			MetadataParser.phoneMetadata = [
				{
					brand: 'Acme',
					phones: ['Alpha', 'Alpine'].map((name) =>
						makePhone({ brand: 'Acme', name, identifier: `Acme ${name}` })
					)
				}
			];
			await render(PhoneSelector);
			expect(status()).toBe('');

			const box = page.getByRole('searchbox');
			await box.fill('alp');
			// Still inside the debounce window: nothing yet.
			expect(status()).toBe('');
			await vi.waitFor(() => expect(status()).toBe('2 devices found'), { timeout: 3000 });

			await box.fill('alpha');
			await vi.waitFor(() => expect(status()).toBe('1 device found'), { timeout: 3000 });

			await box.fill('zzz');
			await vi.waitFor(() => expect(status()).toBe('No results.'), { timeout: 3000 });
			expect(document.querySelector('.ps-phone-pane > p')?.textContent.trim()).toBe('No results.');

			await box.fill('');
			await vi.waitFor(() => expect(status()).toBe(''), { timeout: 3000 });
		});
	});

	describe('brand list', () => {
		function stubTwoBrands(): void {
			MetadataParser.phoneMetadata = [
				{
					brand: 'Acme',
					phones: [makePhone({ brand: 'Acme', name: 'Pula', identifier: 'Acme Pula' })]
				},
				{
					brand: 'Zeta',
					phones: [makePhone({ brand: 'Zeta', name: 'One', identifier: 'Zeta One' })]
				}
			];
		}

		function brands(): string[] {
			return [...document.querySelectorAll('.ps-brand-pane > button')].map((b) =>
				b.textContent!.trim()
			);
		}

		it('lists only brands with a device matching the search', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			stubTwoBrands();
			await render(PhoneSelector);

			await vi.waitFor(() => expect(brands()).toEqual(['Acme', 'Zeta']));
			await page.getByRole('searchbox').fill('pula');
			await vi.waitFor(() => expect(brands()).toEqual(['Acme']));
			await page.getByRole('searchbox').fill('');
			await vi.waitFor(() => expect(brands()).toEqual(['Acme', 'Zeta']));
		});

		// Hiding a selected brand would leave its filter applied with no way to see it.
		it('keeps a selected brand listed when none of its devices match', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			stubTwoBrands();
			await render(PhoneSelector);

			await page.getByRole('button', { name: 'Zeta', exact: true }).click();
			await page.getByRole('searchbox').fill('pula');
			await vi.waitFor(() => expect(brands()).toEqual(['Acme', 'Zeta']));
		});
	});

	/**
	 * Pins what a query lists, in which order, and which brands it keeps, against one
	 * fixture book. It exists so the search can be made cheaper (precomputed lowercase
	 * text, a deferred query) without changing a single result: every case here must
	 * hold before and after.
	 */
	describe('search results', () => {
		const BOOK: Record<string, string[]> = {
			Sennheiser: ['HD 600', 'HD 650', 'HD650/HD6XX', 'IE 200 Pro'],
			Moondrop: ['Lyrö', 'Lyro', 'Blessing 2 Pro', 'Aria'],
			Truthear: ['Zero', 'Zero Max', 'Prodigy', 'Nozzle -6dB Bass']
		};
		const ALL = Object.entries(BOOK).flatMap(([brand, names]) =>
			names.map((name) => `${brand} ${name}`)
		);

		function stubFixture(): void {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			MetadataParser.phoneMetadata = Object.entries(BOOK).map(([brand, names]) => ({
				brand,
				phones: names.map((name) => makePhone({ brand, name, identifier: `${brand} ${name}` }))
			}));
		}

		function rows(): string[] {
			return [...document.querySelectorAll('.ps-phone-pane > div > button')].map((b) =>
				b.textContent!.trim()
			);
		}

		function brands(): string[] {
			return [...document.querySelectorAll('.ps-brand-pane > button')].map((b) =>
				b.textContent!.trim()
			);
		}

		/** The brands a result list implies, in book order. */
		function brandsOf(identifiers: string[]): string[] {
			return Object.keys(BOOK).filter((brand) =>
				identifiers.some((id) => id.startsWith(brand + ' '))
			);
		}

		const CASES: [query: string, expected: string[]][] = [
			['hd 6', ['Sennheiser HD 600', 'Sennheiser HD 650']],
			['hd6', ['Sennheiser HD650/HD6XX']],
			['HD 600, truthear zero', ['Sennheiser HD 600', 'Truthear Zero', 'Truthear Zero Max']],
			['lyro // lyrö', ['Moondrop Lyrö', 'Moondrop Lyro']],
			['lyro', ['Moondrop Lyro']],
			['pro', ['Sennheiser IE 200 Pro', 'Moondrop Blessing 2 Pro', 'Truthear Prodigy']],
			// A group with only exclusions names no device, so it filters nothing.
			['-pro', ALL],
			// Whole-word exclusion: `Prodigy` is not the word `pro`.
			['pro -pro', ['Truthear Prodigy']],
			['moondrop -pro', ['Moondrop Lyrö', 'Moondrop Lyro', 'Moondrop Aria']],
			[
				'truthear -max, aria',
				['Moondrop Aria', 'Truthear Zero', 'Truthear Prodigy', 'Truthear Nozzle -6dB Bass']
			],
			['zzz', []],
			// The `-` of a name's own `-6dB` is a word start like any other.
			['truthear -6db', ['Truthear Zero', 'Truthear Zero Max', 'Truthear Prodigy']],
			['nozzle', ['Truthear Nozzle -6dB Bass']],
			// A trailing comma, a half-typed `//` and stray spaces change nothing.
			['zero,', ['Truthear Zero', 'Truthear Zero Max']],
			['lyro /', ['Moondrop Lyro']],
			['  HD   600  ', ['Sennheiser HD 600']]
		];

		it.each(CASES)('lists the same devices and brands for %j', async (query, expected) => {
			stubFixture();
			await render(PhoneSelector);
			// Start from a different list so the wait below can't pass on the initial one.
			if (expected.length === ALL.length) await page.getByRole('searchbox').fill('zzz');
			await page.getByRole('searchbox').fill(query);

			await vi.waitFor(() => expect(rows()).toEqual(expected));
			await vi.waitFor(() => expect(brands()).toEqual(brandsOf(expected)));
		});

		it('keeps the book order when a query is cleared again', async () => {
			stubFixture();
			await render(PhoneSelector);

			await page.getByRole('searchbox').fill('pro');
			await vi.waitFor(() => expect(rows()).toHaveLength(3));
			await page.getByRole('searchbox').fill('');
			await vi.waitFor(() => expect(rows()).toEqual(ALL));
			expect(brands()).toEqual(['Sennheiser', 'Moondrop', 'Truthear']);
		});

		it('applies a selected brand on top of the query', async () => {
			stubFixture();
			await render(PhoneSelector);

			await page.getByRole('button', { name: 'Moondrop', exact: true }).click();
			await vi.waitFor(() => expect(rows()).toHaveLength(4));
			await page.getByRole('searchbox').fill('pro');
			await vi.waitFor(() => expect(rows()).toEqual(['Moondrop Blessing 2 Pro']));
			// The brand list is not narrowed by the brand filter, only by the query.
			expect(brands()).toEqual(['Sennheiser', 'Moondrop', 'Truthear']);
		});

		it('updates the field at once, ahead of the list', async () => {
			stubFixture();
			await render(PhoneSelector);

			const box = page.getByRole('searchbox');
			await box.fill('zzz');
			expect((box.element() as HTMLInputElement).value).toBe('zzz');
			await vi.waitFor(() => expect(rows()).toEqual([]));
		});
	});

	describe('description', () => {
		it('renders the allowed inline HTML as markup, not as literal text', async () => {
			stubBook(
				makePhone({
					description: 'B&K5128 measurement is available <a href="https://x.example">here</a>'
				})
			);
			await render(PhoneSelector);

			const link = page.getByRole('link', { name: 'here' });
			await expect.element(link).toBeInTheDocument();
			await expect.element(link).toHaveAttribute('href', 'https://x.example');
			// The `&` survives as a character rather than an escaped entity.
			await expect
				.element(page.getByText('B&K5128 measurement is available', { exact: false }))
				.toBeInTheDocument();
		});

		it('strips markup that is not on the allowlist', async () => {
			stubBook(
				makePhone({
					description: 'safe <script>window.__pwned = true;</script><img src=x onerror=1>text'
				})
			);
			await render(PhoneSelector);

			await expect.element(page.getByText('safe text', { exact: false })).toBeInTheDocument();
			expect(document.querySelector('.ps-description script')).toBeNull();
			expect(document.querySelector('.ps-description img')).toBeNull();
		});

		it('flattens the description to plain text for the tooltip', async () => {
			stubBook(makePhone({ description: 'B&K5128 unit <a href="https://x.example">here</a>' }));
			await render(PhoneSelector);

			// On the row button, not the description: that is click-through, so no tooltip there.
			const button = document.querySelector('.ps-phone-pane > div > button');
			expect(button?.getAttribute('title')).toBe('B&K5128 unit here');
		});

		// An anchor in the description is interactive content, so it can't live in the button.
		it('keeps the description beside the row button, not inside it', async () => {
			stubBook(makePhone({ description: 'see <a href="https://x.example">here</a>' }));
			await render(PhoneSelector);

			const link = page.getByRole('link', { name: 'here' });
			await expect.element(link).toBeInTheDocument();
			const anchor = link.element();
			expect(anchor.closest('button')).toBeNull();

			const button = document.querySelector('.ps-phone-pane > div > button') as HTMLElement;
			const description = anchor.closest('.ps-description') as HTMLElement;
			expect(button.querySelector('a, .ps-description')).toBeNull();
			expect(button.parentElement?.contains(description)).toBe(true);
			// The button is still described by it, so a screen reader keeps the text.
			const wrapper = description.parentElement as HTMLElement;
			expect(button.getAttribute('aria-describedby')).toBe(wrapper.id);
			expect(button.textContent.trim()).toBe('Sennheiser HD 600');
		});

		it('leaves the description out of the button that is disabled while loading', async () => {
			let release!: () => void;
			vi.spyOn(dataProvider, 'toggleFRData').mockImplementation(
				() => new Promise<void>((resolve) => (release = resolve))
			);
			stubBook(makePhone({ description: 'see <a href="https://x.example">here</a>' }));
			await render(PhoneSelector);

			const row = page.getByRole('button', { name: /HD 600/ });
			await row.click();
			await vi.waitFor(() => expect((row.element() as HTMLButtonElement).disabled).toBe(true));
			const link = page.getByRole('link', { name: 'here' }).element();
			expect(link.closest('[disabled]')).toBeNull();
			release();
		});

		it('sets no description reference on a row without a description', async () => {
			stubBook(makePhone());
			await render(PhoneSelector);

			const button = document.querySelector('.ps-phone-pane > div > button') as HTMLElement;
			expect(button.hasAttribute('aria-describedby')).toBe(false);
			expect(button.hasAttribute('title')).toBe(false);
		});

		it('does not toggle the device when a link inside the description is clicked', async () => {
			const toggle = vi.spyOn(dataProvider, 'toggleFRData').mockResolvedValue(undefined);
			stubBook(makePhone({ description: 'see <a href="https://x.example">here</a>' }));
			await render(PhoneSelector);

			// The anchor sits beside the row button, so its click never reaches it.
			const anchor = document.querySelector('.ps-description a') as HTMLAnchorElement;
			anchor.removeAttribute('href'); // keep the test from navigating
			anchor.click();

			expect(toggle).not.toHaveBeenCalled();
		});
	});

	describe('links', () => {
		it('renders every operator link on a loaded device', async () => {
			const phone = makePhone({
				links: [
					{ label: 'Amazon', url: 'https://amazon.example/hd600' },
					{ label: 'Local Shop', url: 'https://shop.example/hd600' }
				]
			});
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const amazon = page.getByRole('link', { name: 'Amazon' });
			await expect.element(amazon).toHaveAttribute('href', 'https://amazon.example/hd600');
			await expect.element(amazon).toHaveAttribute('rel', 'external noopener noreferrer');
			await expect
				.element(page.getByRole('link', { name: 'Local Shop' }))
				.toHaveAttribute('href', 'https://shop.example/hd600');
		});

		it('does not toggle the device when an operator link is clicked', async () => {
			const toggle = vi.spyOn(dataProvider, 'toggleFRData').mockResolvedValue(undefined);
			const phone = makePhone({ links: [{ label: 'Amazon', url: 'https://amazon.example' }] });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const anchor = document.querySelector(
				'a[href="https://amazon.example"]'
			) as HTMLAnchorElement;
			anchor.removeAttribute('href');
			anchor.click();

			expect(toggle).not.toHaveBeenCalled();
		});

		// Links nested in a button are invalid and drop out of the accessibility tree.
		it('keeps the links beside the row button, not inside it', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { RANKING: { URL: '/ranking/#{slug}' } };
			const phone = makePhone({
				reviewLink: 'https://review.example/hd600',
				shopLink: 'https://shop.example/hd600',
				links: [{ label: 'Amazon', url: 'https://amazon.example/hd600' }],
				reviewScore: 4
			});
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			for (const name of ['Review', 'Shop', 'Amazon']) {
				const link = page.getByRole('link', { name });
				await expect.element(link).toBeInTheDocument();
				const el = link.element();
				expect(el.closest('button')).toBeNull();
				expect(el.getAttribute('target')).toBe('_blank');
				expect(el.getAttribute('rel')).toContain('noopener');
				expect(el.getAttribute('rel')).toContain('noreferrer');
			}
			const rank = page.getByTitle('Rank: 4');
			await expect.element(rank).toBeInTheDocument();
			expect(rank.element().tagName).toBe('A');
			expect(rank.element().closest('button')).toBeNull();
		});

		it('leaves the links out of the button that is disabled while loading', async () => {
			let release!: () => void;
			vi.spyOn(dataProvider, 'toggleFRData').mockImplementation(
				() => new Promise<void>((resolve) => (release = resolve))
			);
			const phone = makePhone({ links: [{ label: 'Amazon', url: 'https://amazon.example' }] });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const row = page.getByRole('button', { name: /HD 600/ });
			await row.click();
			await vi.waitFor(() => expect((row.element() as HTMLButtonElement).disabled).toBe(true));
			const link = page.getByRole('link', { name: 'Amazon' }).element();
			expect(link.closest('button')).toBeNull();
			expect(link.closest('[disabled]')).toBeNull();
			release();
		});

		it('keeps the meta row hidden until the device is loaded', async () => {
			stubBook(makePhone({ links: [{ label: 'Amazon', url: 'https://amazon.example' }] }));
			await render(PhoneSelector);

			expect(document.querySelector('a[href="https://amazon.example"]')).toBeNull();
		});
	});

	/**
	 * The panel unmounts on every panel switch, so the list is rebuilt scrolled to
	 * the top. Devices loaded when it opens are pinned to the head of the list —
	 * and that order then holds for the rest of the panel's life.
	 */
	describe('pinned devices', () => {
		const added: string[] = [];

		function stubBigBook(): void {
			MetadataParser.phoneMetadata = [
				{
					brand: 'Acme',
					phones: (['Alpha', 'Bravo', 'Charlie'] as const).map((name) =>
						makePhone({ brand: 'Acme', name, identifier: `Acme ${name}` })
					)
				}
			];
		}

		function load(identifier: string): void {
			const uuid = `pin-${identifier}`;
			added.push(uuid);
			frStore.set(uuid, {
				uuid,
				type: 'phone',
				identifier,
				channels: {},
				dispChannel: ['AVG'],
				dispSuffix: '',
				colors: { L: '#f00', R: '#00f', AVG: '#0f0' },
				dash: '1 0'
			} as unknown as FRDataObject);
		}

		/** Device rows in render order. Brand buttons live in the other pane. */
		function rowOrder(): string[] {
			return [...document.querySelectorAll('.ps-phone-pane > div > button')].map((b) =>
				b.textContent!.trim()
			);
		}

		afterEach(() => {
			for (const uuid of added) frStore.delete(uuid);
			added.length = 0;
		});

		it('floats devices loaded at mount to the top, keeping book order within each group', async () => {
			stubBigBook();
			load('Acme Charlie');
			await render(PhoneSelector);

			await vi.waitFor(() =>
				expect(rowOrder()).toEqual(['Acme Charlie', 'Acme Alpha', 'Acme Bravo'])
			);
		});

		it('marks the boundary between the pinned block and the rest', async () => {
			stubBigBook();
			load('Acme Charlie');
			await render(PhoneSelector);

			await vi.waitFor(() => expect(rowOrder()[0]).toBe('Acme Charlie'));
			const rows = [...document.querySelectorAll('.ps-phone-pane > div')];
			expect(rows[0].className).toContain('border-b-2');
			expect(rows[1].className).not.toContain('border-b-2');
			expect(rows[2].className).not.toContain('border-b-2');
		});

		// Commas and `//` both union locally: one device can't be two of them.
		it('lists devices matching any comma group or `//` alternative', async () => {
			// Typing would otherwise lazy-load the real aggregate index.
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			stubBigBook();
			await render(PhoneSelector);

			await page.getByRole('searchbox').fill('alpha // charlie');
			await vi.waitFor(() => expect(rowOrder()).toEqual(['Acme Alpha', 'Acme Charlie']));

			await page.getByRole('searchbox').fill('bravo, alpha // charlie');
			await vi.waitFor(() =>
				expect(rowOrder()).toEqual(['Acme Alpha', 'Acme Bravo', 'Acme Charlie'])
			);
		});

		// An exclusion belongs to its comma group, so it can't hide another group's match.
		it("applies a group's `-word` exclusions to that group only", async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { CROSS_SITE_SEARCH: { ENABLED: false } };
			stubBigBook();
			await render(PhoneSelector);

			await page.getByRole('searchbox').fill('acme -bravo');
			await vi.waitFor(() => expect(rowOrder()).toEqual(['Acme Alpha', 'Acme Charlie']));

			await page.getByRole('searchbox').fill('acme -bravo, bravo');
			await vi.waitFor(() =>
				expect(rowOrder()).toEqual(['Acme Alpha', 'Acme Bravo', 'Acme Charlie'])
			);
		});

		it('does not reorder the list when a device is selected', async () => {
			const toggle = vi.spyOn(dataProvider, 'toggleFRData').mockResolvedValue(undefined);
			stubBigBook();
			await render(PhoneSelector);

			await expect.element(page.getByRole('button', { name: 'Acme Bravo' })).toBeInTheDocument();
			await page.getByRole('button', { name: 'Acme Bravo' }).click();
			expect(toggle).toHaveBeenCalled();
			// The real load lands asynchronously, after the click.
			load('Acme Bravo');

			await vi.waitFor(() => expect(rowOrder()[1]).toBe('Acme Bravo'));
			expect(rowOrder()).toEqual(['Acme Alpha', 'Acme Bravo', 'Acme Charlie']);
		});

		it('leaves a pinned device in place after it is deselected', async () => {
			vi.spyOn(dataProvider, 'toggleFRData').mockResolvedValue(undefined);
			stubBigBook();
			load('Acme Charlie');
			await render(PhoneSelector);

			await vi.waitFor(() => expect(rowOrder()[0]).toBe('Acme Charlie'));
			frStore.delete('pin-Acme Charlie');

			await vi.waitFor(() =>
				expect(rowOrder()).toEqual(['Acme Charlie', 'Acme Alpha', 'Acme Bravo'])
			);
		});
	});
	/**
	 * The rank indicator. `rankingService.lookup` is spied rather than fed a real
	 * sheet — the fetch and the matching have their own specs in
	 * `services/ranking-core.spec.ts`, and what is worth pinning here is that the
	 * sheet wins over `phone_book.json`, that the fallback still looks like it
	 * always did, and that a matched row links to *its own* card.
	 */
	describe('rank indicator', () => {
		it('still renders a phone_book score as the star row, unlinked', async () => {
			const phone = makePhone({ reviewScore: 4 });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			await expect.element(page.getByTitle('Rank: 4')).toBeInTheDocument();
			expect(page.getByTitle('Rank: 4').element().tagName).toBe('SPAN');
			const stars = page.getByRole('img', { name: 'Rank: 4' }).element();
			expect(stars.lastElementChild?.getAttribute('style')).toContain('width: 80%');
		});

		// A half used to be the emoji star, which the emoji font draws larger and
		// in its own color. The fill is a clipped width, so any fraction is exact.
		it('fills the star row to a fractional score', async () => {
			const phone = makePhone({ reviewScore: 4.5 });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const stars = page.getByRole('img', { name: 'Rank: 4.5' });
			await expect.element(stars).toBeInTheDocument();
			expect(stars.element().textContent).not.toContain('⭐');
			expect(stars.element().lastElementChild?.getAttribute('style')).toContain('width: 90%');
		});

		it('links the rank when RANKING.URL is configured', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = {
				RANKING: { URL: '/ranking/?type={type}#{slug}', TYPE: 'headphone' }
			};
			const phone = makePhone({ reviewScore: 4 });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const link = page.getByTitle('Rank: 4');
			await expect.element(link).toBeInTheDocument();
			expect(link.element().getAttribute('href')).toBe(
				'/ranking/?type=headphone#sennheiser-hd-600'
			);
		});

		it('still honors the deprecated flat RANKING_URL', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { RANKING_URL: '/ranking/#{slug}' };
			const phone = makePhone({ reviewScore: 4 });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const link = page.getByTitle('Rank: 4');
			await expect.element(link).toBeInTheDocument();
			expect(link.element().getAttribute('href')).toBe('/ranking/#sennheiser-hd-600');
		});

		it('prefers the sheet row over the phone book score, as a scale badge', async () => {
			(window as ConfigWindow).GRAPHTOOL_CONFIG = { RANKING: { URL: '/ranking/#{slug}' } };
			vi.spyOn(rankingService, 'lookup').mockReturnValue({
				value: 'S',
				brand: 'Sennheiser',
				model: 'HD600',
				slug: 'sennheiser-hd600'
			});
			rankingService.scale = [{ value: 'S', color: '#b71c1c' }];
			const phone = makePhone({ reviewScore: 4 });
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			const link = page.getByTitle('Rank: S');
			await expect.element(link).toBeInTheDocument();
			expect(link.element().textContent.trim()).toBe('S');
			// The sheet spells it "HD600"; the phone book spells it "HD 600". The
			// ranking page anchored its card with the sheet's spelling.
			expect(link.element().getAttribute('href')).toBe('/ranking/#sennheiser-hd600');
			const badge = link.element().querySelector('span');
			expect(badge?.getAttribute('style')).toContain('background-color: rgb(183, 28, 28)');
		});

		it('shows a rank the sheet has even where the phone book has none', async () => {
			vi.spyOn(rankingService, 'lookup').mockReturnValue({
				value: 'A',
				brand: 'Sennheiser',
				model: 'HD 600',
				slug: 'sennheiser-hd-600'
			});
			const phone = makePhone();
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			await expect.element(page.getByTitle('Rank: A')).toBeInTheDocument();
		});

		it('shows nothing when neither the sheet nor the phone book has a rank', async () => {
			const phone = makePhone();
			stubBook(phone);
			markLoaded(phone);
			await render(PhoneSelector);

			await expect.element(page.getByRole('button', { name: /HD 600/ })).toBeInTheDocument();
			expect(document.querySelector('[title^="Rank:"]')).toBeNull();
		});
	});

	describe('cross-site search', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		// The empty-state line belongs to the selector and the results to its child, so the
		// selector has to know how many results there are and whether more are on the way.
		it('holds back "No results." while the index loads, and once it has matches', async () => {
			const index = {
				v: 2,
				phonesFormat: 'flat',
				brands: ['64Audio'],
				sites: [{ id: 'alice', name: 'Alice', url: 'https://alice.squig.link' }],
				dbs: [
					{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' }
				],
				phones: [{ db: 'alice:iems', b: 0, n: 'U12t', s: '64Audio_U12t' }]
			};
			let deliver = (): void => undefined;
			const gate = new Promise<void>((resolve) => (deliver = resolve));
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => {
					await gate;
					return new Response(JSON.stringify(index), { status: 200 });
				})
			);
			stubBook(makePhone());
			await render(PhoneSelector);
			const search = page.getByRole('searchbox');
			const noResults = page.getByText('No results.');

			await search.fill('u12t');
			await expect.element(page.getByText('Loading databases...')).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: /HD 600/ })).not.toBeInTheDocument();
			await expect.element(noResults).not.toBeInTheDocument();

			deliver();
			await expect.element(page.getByRole('link', { name: /64Audio U12t/ })).toBeInTheDocument();
			await expect.element(noResults).not.toBeInTheDocument();

			await search.fill('zzqq');
			await expect.element(noResults).toBeInTheDocument();
		});
	});
});

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
import MetadataParser from '$lib/utils/metadata-parser.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import type { BrandMetadata, FRDataObject, PhoneMetadata } from '$lib/types/data-types.js';

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
		vi.restoreAllMocks();
	});

	describe('description', () => {
		it('renders the allowed inline HTML as markup, not as literal text', async () => {
			stubBook(
				makePhone({
					description: 'B&K5128 measurement is available <a href="https://x.example">here</a>'
				})
			);
			render(PhoneSelector);

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
			render(PhoneSelector);

			await expect.element(page.getByText('safe text', { exact: false })).toBeInTheDocument();
			expect(document.querySelector('.ps-description script')).toBeNull();
			expect(document.querySelector('.ps-description img')).toBeNull();
		});

		it('flattens the description to plain text for the tooltip', async () => {
			stubBook(makePhone({ description: 'B&K5128 unit <a href="https://x.example">here</a>' }));
			render(PhoneSelector);

			const span = document.querySelector('.ps-description');
			expect(span?.getAttribute('title')).toBe('B&K5128 unit here');
		});

		it('does not toggle the device when a link inside the description is clicked', async () => {
			const toggle = vi.spyOn(dataProvider, 'toggleFRData').mockResolvedValue(undefined);
			stubBook(makePhone({ description: 'see <a href="https://x.example">here</a>' }));
			render(PhoneSelector);

			// The anchor lives inside the row button; the guard reads event.target.
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
			render(PhoneSelector);

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
			render(PhoneSelector);

			const anchor = document.querySelector(
				'a[href="https://amazon.example"]'
			) as HTMLAnchorElement;
			anchor.removeAttribute('href');
			anchor.click();

			expect(toggle).not.toHaveBeenCalled();
		});

		it('keeps the meta row hidden until the device is loaded', async () => {
			stubBook(makePhone({ links: [{ label: 'Amazon', url: 'https://amazon.example' }] }));
			render(PhoneSelector);

			expect(document.querySelector('a[href="https://amazon.example"]')).toBeNull();
		});
	});
});

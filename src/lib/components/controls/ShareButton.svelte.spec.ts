/**
 * `ShareButton` copies the share URL. When the clipboard is unavailable (plain HTTP) or refuses
 * (permission denied), it opens a popover with the URL in a read-only, pre-selected field so
 * the user can still copy it by hand. The popover renders into a portal, hence `page.getBy*`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { toast } from '#lib/services/toast.js';
import ShareButton from './ShareButton.svelte';
import { urlProvider } from '#lib/utils/url-provider.js';

const URL_TO_SHARE = 'https://example.com/?share=A+B&x=%C3%A9';

function setClipboard(value: unknown) {
	Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('ShareButton', () => {
	let success: ReturnType<typeof vi.spyOn>;
	let error: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.spyOn(urlProvider, 'getCurrentURL').mockReturnValue(URL_TO_SHARE);
		success = vi.spyOn(toast, 'success').mockReturnValue(1);
		error = vi.spyOn(toast, 'error').mockReturnValue(1);
	});

	afterEach(() => {
		// Drop the own property so the prototype's real `clipboard` getter shows again.
		delete (navigator as unknown as Record<string, unknown>).clipboard;
		vi.restoreAllMocks();
	});

	it('copies the URL, toasts, and shows a check mark without opening the field', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		setClipboard({ writeText });
		render(ShareButton);
		const button = page.getByRole('button', { name: 'Share' });
		const idleIcon = button.element().innerHTML;

		await button.click();

		expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_TO_SHARE);
		expect(success).toHaveBeenCalledOnce();
		expect(error).not.toHaveBeenCalled();
		expect(button.element().innerHTML).not.toBe(idleIcon);
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('puts the URL in a focused, selected, read-only field when the clipboard is missing', async () => {
		setClipboard(undefined);
		render(ShareButton);

		await page.getByRole('button', { name: 'Share' }).click();

		const field = page.getByRole('textbox', { name: 'Share link' });
		await expect.element(field).toBeVisible();
		await expect.element(field).toHaveValue(URL_TO_SHARE);
		await expect.element(field).toHaveAttribute('readonly');
		await expect.element(field).toHaveFocus();
		const input = field.element() as HTMLInputElement;
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe(URL_TO_SHARE.length);
		expect(success).not.toHaveBeenCalled();
	});

	it('does the same when writeText rejects, and Escape closes the field', async () => {
		setClipboard({ writeText: vi.fn().mockRejectedValue(new DOMException('denied')) });
		render(ShareButton);

		await page.getByRole('button', { name: 'Share' }).click();
		const field = page.getByRole('textbox', { name: 'Share link' });
		await expect.element(field).toHaveValue(URL_TO_SHARE);
		expect(success).not.toHaveBeenCalled();

		await userEvent.keyboard('{Escape}');
		await expect.element(field).not.toBeInTheDocument();
	});
});

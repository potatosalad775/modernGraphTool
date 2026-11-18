/** Make a share link, open it as a new visit, and find the same selection. */
export const name = 'share-link';

const DEVICE = 'GZR HT5';

export default async function ({ page, origin, boot, panel, toolbar, check, shot }) {
	// Share shows the link in a dialog only when the clipboard refuses, which a headless
	// browser does and a headed one does not. Take the clipboard away, as on a plain-HTTP
	// host, so the journey reads the link either way and never overwrites a real clipboard.
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
	});
	await boot();
	await panel('DEVICES');
	const controls = page.getByRole('region', { name: 'Controls' });
	await controls.getByRole('button', { name: DEVICE, exact: true }).click();
	await page.waitForFunction((device) => document.title.includes(device), DEVICE);

	await toolbar();
	await page.getByRole('button', { name: 'Share' }).click();
	const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
	check('the link carries a share parameter', link.startsWith(`${origin}/?share=`), link);
	await shot('link');

	await boot(link.slice(origin.length));
	const restored = await page
		.waitForFunction((device) => document.title.includes(device), DEVICE, { timeout: 20_000 })
		.then(() => true)
		.catch(() => false);
	check('the link restores the device', restored, await page.title());
	check(
		'the graph labels its curve again',
		(await page.locator('svg text', { hasText: DEVICE }).count()) > 0
	);
	await shot('restored');
}

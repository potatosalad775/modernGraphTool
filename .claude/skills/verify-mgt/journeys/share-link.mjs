/** Make a share link, open it as a new visit, and find the same selection. */
export const name = 'share-link';

const DEVICE = 'GZR HT5';

export default async function ({ page, origin, boot, panel, toolbar, check, shot }) {
	await boot();
	await panel('DEVICES');
	const controls = page.getByRole('region', { name: 'Controls' });
	await controls.getByRole('button', { name: DEVICE, exact: true }).click();
	await page.waitForFunction((device) => document.title.includes(device), DEVICE);

	await toolbar();
	// A headless browser refuses the clipboard, so the link is shown in a dialog instead.
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

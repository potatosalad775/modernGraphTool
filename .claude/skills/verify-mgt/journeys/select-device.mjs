/** Find a device by name, add it to the graph, then remove it. */
export const name = 'select-device';

const DEVICE = 'GZR HT5';

export default async function ({ page, boot, panel, check, shot, aria }) {
	await boot();
	await panel('DEVICES');
	const controls = page.getByRole('region', { name: 'Controls' });
	// The curve count is no proof here: with two devices on the graph each one switches from
	// its L and R curves to a single average, so the count can stay the same.
	const label = page.locator('svg text', { hasText: DEVICE });

	await controls.getByRole('searchbox', { name: 'Search devices' }).fill('ht5');
	const row = controls.getByRole('button', { name: DEVICE, exact: true });
	await row.waitFor();
	check('search narrows the list to the device', (await row.count()) === 1);
	check('the graph does not show it yet', (await label.count()) === 0);
	await shot('search');

	await row.click();
	await label.first().waitFor();
	check('the graph labels its curve', true);
	check('the device row is pressed', (await row.getAttribute('aria-pressed')) === 'true');
	check('the page title names the device', (await page.title()).includes(DEVICE));
	await shot('added');
	await aria('added', controls);

	// Pressing a loaded device again unloads it.
	await row.click();
	await label.first().waitFor({ state: 'detached' });
	check('the device row is released', (await row.getAttribute('aria-pressed')) === 'false');
	check('the page title drops the device', !(await page.title()).includes(DEVICE));
	await shot('removed');
}

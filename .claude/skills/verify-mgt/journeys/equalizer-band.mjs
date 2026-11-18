/** Add an EQ band, change its gain, and undo it. */
export const name = 'equalizer-band';

export default async function ({ page, boot, panel, check, shot, aria }) {
	await boot();
	await panel('EQUALIZER');
	const controls = page.getByRole('region', { name: 'Controls' });
	const gain = controls.getByLabel('Band 1 gain, dB');

	await controls.getByRole('button', { name: 'Add band' }).click();
	await gain.waitFor();
	check(
		'the EQ switch is on',
		await controls.getByRole('switch', { name: 'EQUALIZER' }).isChecked()
	);
	await shot('band-added');

	// A band counts once it has a frequency, a gain and a Q. Number fields commit on
	// change, so leave each field the way a user would.
	for (const [label, value] of [
		['Band 1 frequency, Hz', '1000'],
		['Band 1 Q', '1'],
		['Band 1 gain, dB', '6']
	]) {
		const field = controls.getByLabel(label);
		await field.fill(value);
		await field.blur();
	}
	await controls.getByText('Preamp: -6.0 dB').waitFor();
	check('a +6 dB band lowers the preamp to -6 dB', true);
	// The curve is drawn a frame after the preamp text changes.
	await page.locator('.fr-graph-eq-curve').first().waitFor({ state: 'attached' });
	check('the graph draws the equalized curve', true);
	await shot('gain-set');
	await aria('gain-set', controls);

	await page.keyboard.press('Control+z');
	await controls.getByText('Preamp: 0.0 dB').waitFor();
	check('undo restores a flat preamp', true);
	await shot('undone');
}

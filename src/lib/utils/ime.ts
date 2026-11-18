/**
 * True while an IME is mid-composition (Korean, Japanese, Chinese …). The Enter or Escape that
 * confirms or cancels a composition must not also commit or cancel the field it types into.
 *
 * `keyCode === 229` covers Safari, which fires the confirming keydown after `compositionend`,
 * when `isComposing` is already false.
 */
export function isImeComposing(e: KeyboardEvent): boolean {
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Safari reports the composition only here
	return e.isComposing || e.keyCode === 229;
}

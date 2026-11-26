/**
 * The rows of Hardware EQ's "Device Setting" box: Device EQ, and the device's own settings under
 * it. One grid for the whole box, so every label ends and every control starts on the same line
 * whatever the labels' lengths, and each control is as wide as the next. A row is a subgrid of it
 * with one height, so the gaps between rows are equal whether a row holds a dropdown or a slider.
 */

/** The box's content. The label column is as wide as the longest label, up to 45% of the box. */
export const deviceGridClass =
	'grid grid-cols-[fit-content(45%)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5';

/** One row: a label cell and a control cell. */
export const deviceRowClass =
	'col-span-2 grid min-h-7 grid-cols-subgrid items-center text-xs text-base-content/80';

/** Something across both columns: a hint under a row, the rule between the EQ's rows and the device's. */
export const deviceSpanClass = 'col-span-2';

export const deviceSelectClass =
	'w-full min-w-0 rounded border border-base-content/20 bg-base-200 py-1 pl-2 text-xs text-base-content disabled:opacity-60 aria-disabled:opacity-60';

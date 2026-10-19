export interface Size {
	width: number;
	height: number;
}

/** The fields of a `DOMRect` this reads. */
export interface Box {
	top: number;
	left: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export interface Placement {
	top: number;
	left: number;
}

/** Clear of the spotlight's 6 px padding and 2 px ring. */
const GAP = 16;
/** From the viewport edge — the 1rem the edge-pinned placement uses. */
const MARGIN = 16;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * The dialog's top-left corner beside its target, or null if it fits on no side.
 *
 * Left or right first — a widescreen has the room there, and a dialog above or below
 * a target near the middle lands far from it — then below or above. Of two sides that
 * fit, the roomier. Centred on the target along the other axis, kept on screen.
 */
export function placeBeside(target: Box, dialog: Size, viewport: Size): Placement | null {
	if (dialog.width === 0 || dialog.height === 0) return null;

	const room = {
		left: target.left - GAP - MARGIN,
		right: viewport.width - target.right - GAP - MARGIN,
		above: target.top - GAP - MARGIN,
		below: viewport.height - target.bottom - GAP - MARGIN
	};
	const centredTop = clamp(
		target.top + target.height / 2 - dialog.height / 2,
		MARGIN,
		viewport.height - dialog.height - MARGIN
	);
	const centredLeft = clamp(
		target.left + target.width / 2 - dialog.width / 2,
		MARGIN,
		viewport.width - dialog.width - MARGIN
	);

	if (dialog.height <= viewport.height - MARGIN * 2) {
		const fitsLeft = room.left >= dialog.width;
		const fitsRight = room.right >= dialog.width;
		if (fitsLeft || fitsRight) {
			const right = fitsRight && (!fitsLeft || room.right >= room.left);
			return {
				top: centredTop,
				left: right ? target.right + GAP : target.left - GAP - dialog.width
			};
		}
	}

	if (dialog.width <= viewport.width - MARGIN * 2) {
		const fitsAbove = room.above >= dialog.height;
		const fitsBelow = room.below >= dialog.height;
		if (fitsAbove || fitsBelow) {
			const below = fitsBelow && (!fitsAbove || room.below >= room.above);
			return {
				top: below ? target.bottom + GAP : target.top - GAP - dialog.height,
				left: centredLeft
			};
		}
	}

	return null;
}

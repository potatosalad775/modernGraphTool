/**
 * Which guided tour is showing, and which ones the user has already seen.
 *
 * One `TutorialModal` (mounted once in AppShell) renders whatever tour is active.
 * The trigger for a panel's tour lives there too, not in the panel: panels unmount
 * on every switch, and a tour hosted in one would vanish mid-walkthrough without
 * recording the dismissal.
 */
export type TourId = 'welcome' | 'equalizer';

/** `welcome` keeps the key the original single tour used, so returning users stay dismissed. */
export const TOUR_STORAGE_KEYS: Record<TourId, string> = {
	welcome: 'gt-tutorial-dismissed',
	equalizer: 'gt-tutorial-eq-dismissed'
};

class TutorialStore {
	/** The tour on screen, or the last one shown — kept after a dismissal so the
	 * dialog's close transition still has its steps to render. */
	tour = $state<TourId>('welcome');
	isOpen = $state(false);
	step = $state(0);

	isDismissed(id: TourId): boolean {
		try {
			return localStorage.getItem(TOUR_STORAGE_KEYS[id]) !== null;
		} catch {
			return false;
		}
	}

	/** Start a tour from its first step — also how the replay buttons reopen one. */
	open(id: TourId): void {
		this.step = 0;
		this.tour = id;
		this.isOpen = true;
	}

	/** Close the active tour and remember it, whether it was finished or skipped. */
	dismiss(): void {
		if (!this.isOpen) return;
		try {
			localStorage.setItem(TOUR_STORAGE_KEYS[this.tour], 'true');
		} catch {
			// Storage blocked: the tour just shows again next visit.
		}
		// `step` is left alone so the closing dialog doesn't flash back to step one;
		// `open` resets it.
		this.isOpen = false;
	}
}

export const tutorialStore = new TutorialStore();

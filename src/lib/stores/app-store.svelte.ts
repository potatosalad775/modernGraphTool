class AppStore {
	isMobile = $state(false);
	isReady = $state(false);
	/**
	 * The user's own expand/collapse of the target list, kept here because panels unmount on
	 * every switch. `null` until they toggle it, so the config default applies until then.
	 */
	targetListOpen = $state<boolean | null>(null);
}

export const appStore = new AppStore();

class AppStore {
  theme = $state<'light' | 'dark'>('light');
  isMobile = $state(false);
  isReady = $state(false);
}

export const appStore = new AppStore();

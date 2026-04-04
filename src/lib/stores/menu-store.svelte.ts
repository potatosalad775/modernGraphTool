export const MENU_PANELS = ['device', 'graph', 'equalizer', 'misc'] as const;
export type MenuPanel = (typeof MENU_PANELS)[number];

class MenuStore {
  currentPanel = $state<MenuPanel>('graph');
  /** 1 = sliding right (next panel), -1 = sliding left (prev panel) */
  slideDirection = $state(1);

  setPanel(panel: MenuPanel) {
    const oldIdx = MENU_PANELS.indexOf(this.currentPanel);
    const newIdx = MENU_PANELS.indexOf(panel);
    this.slideDirection = newIdx >= oldIdx ? 1 : -1;
    this.currentPanel = panel;
  }
}

export const menuStore = new MenuStore();

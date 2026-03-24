export const MENU_PANELS = ['device', 'graph', 'equalizer', 'misc'] as const;
export type MenuPanel = (typeof MENU_PANELS)[number];

class MenuStore {
  currentPanel = $state<MenuPanel>('graph');
}

export const menuStore = new MenuStore();

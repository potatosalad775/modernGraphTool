import StringLoader from "./util/string-loader.js";
import ConfigGetter from "./util/config-getter.js";
import CoreExtension from "../core-extension.js";

/** Menu State Management
 * Handles the current menu state, core and extension menus
 * Provides methods to initialize, add extension menus, and update language
 */
class MenuState {
  constructor() {
    /** @type {string} */
    this.currentMenu = ConfigGetter.get('INITIAL_PANEL') || 'phone';
    /** @type {Array<{id: string, name: string}>} */
    this.coreMenuList = [
      { id: 'device', name: 'DEVICES' },
      { id: 'graph', name: 'GRAPH' },
      { id: 'misc', name: 'MISC' },
    ];
    /** @type {Array<{id: string, name: string}>} */
    this.extensionMenuList = [];
  }

  /**
   * Initialize MenuState with core event and set initial menu state
   * @param {import('../core-event.js').default} coreEvent - Core event dispatcher
   */
  init(coreEvent) {
    this.coreEvent = coreEvent;
    // Update Menu Panel to Initial Value
    document.querySelector(`.menu-panel[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
    // Update Menu Bar Item to Initial Value
    document.querySelector(`.menu-bar-item[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
    // Update Current Menu
    window.addEventListener('core:menu-change', (/** @type any */ e) => {
      this.currentMenu = e.detail.target.replace('-panel', '');
    });
    // Add StringLoader Observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
  };

  /**
   * Get the list of menu data including core and extension menus
   * @returns {Array<{id: string, name: string}>} Current menu list
   */
  getMenuList() {
    return [...this.coreMenuList, ...this.extensionMenuList];
  };

  /**
   * Get the list of core menu data
   * This does not include extension menus
   * @returns {Array<{id: string, name: string}>} Current core menu
   */
  getCoreMenuList() {
    return [...this.coreMenuList];
  }

  /**
   * Get the index of current menu
   * @returns {number} Current menu index
   */
  getCurrentIndex() {
    const menuList = this.getMenuList();
    return menuList.findIndex(menu => menu.id === this.currentMenu);
  }

  /**
   * Add Extension Menu to Menu Panel and Menu Bar
   * @param {string} menuName name of the extension menu
   * @param {string} menuBarTitle title of the menu bar item
   * @param {string} elementName name of the element to create
   */
  addExtensionMenu(menuName, menuBarTitle, elementName) {
    const trimmedName = menuName.trim();
    
    // Add to extension lists
    this.extensionMenuList.push({ id: trimmedName, name: menuBarTitle });

    // Create and add panel
    const newPanel = document.createElement("div");
    newPanel.id = `${trimmedName}-panel`;
    newPanel.className = "menu-panel extension-panel";
    newPanel.setAttribute("data-target", `${trimmedName}-panel`);
    
    // Get the existing extension instance with retries
    let extensionInstance = null;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 100; // 100ms delay between retries

    const getExtensionWithRetry = async () => {
      while (retryCount < maxRetries) {
        extensionInstance = CoreExtension.getExtension(menuName);
        if (extensionInstance) {
          // Append the existing instance to the panel
          newPanel.appendChild(extensionInstance);
          return;
        }
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      // Fallback to original behavior if instance not found after all retries
      console.warn(`modernGraphTool: Extension instance for '${trimmedName}' not found. This shouldn't happen but creating new one anyway.`);
      newPanel.innerHTML = `<${elementName}></${elementName}>`;
    };

    getExtensionWithRetry();

    document.querySelector('.menu-panels')?.insertBefore(
      newPanel, 
      document.querySelector('misc-panel')
    );

    // Create and add button
    const newButton = document.createElement("button");
    newButton.className = "menu-bar-item";
    newButton.setAttribute("type", "button");
    newButton.setAttribute("data-target", `${trimmedName}-panel`);
    newButton.innerHTML = StringLoader.getString(`extension.${menuName}.menu-label`, menuName.toUpperCase()) 
    || menuBarTitle.trim() || '?';
    document.querySelector('.menu-carousel')?.insertBefore(
      newButton, 
      document.querySelector('.menu-bar-item[data-target="misc-panel"]')
    );

    this.coreEvent.dispatchEvent('extension-menu-added');
  };

  /**
   * Update the current language for core and extension menus
   * @private
   */
  _updateLanguage() {
    this._updateCoreLanguage();
    this._updateExtensionLanguage();
  };

  /**
   * Update the language for core menus
   * @private
   */
  _updateCoreLanguage() {
    if(!this.coreMenuList) return;
    this.coreMenuList.forEach((menu, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${menu.id}-panel"]`);
      if (menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`menu.item-${menu.id}-label`, menu.name.toUpperCase());
      }
    })
  };

  /**
   * Update the language for extension menus
   * @private
   */
  _updateExtensionLanguage() {
    if(!this.extensionMenuList) return;
    this.extensionMenuList.forEach((menu, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${menu.id}-panel"]`);
      if(menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`extension.${menu.id}.menu-label`, menu.name.toUpperCase());
      }
    })
  };

  /**
   * Get singleton instance of MenuState
   * @returns {MenuState} Singleton instance
   */
  static getInstance() {
    if(!MenuState._instance) {
      MenuState._instance = new MenuState();
    }
    return MenuState._instance;
  }
}

/** @type {MenuState|null} */
MenuState._instance = null;

export default MenuState.getInstance();
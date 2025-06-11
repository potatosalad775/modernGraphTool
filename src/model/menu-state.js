import StringLoader from "./util/string-loader.js";
import ConfigGetter from "./util/config-getter.js";
import CoreExtension from "../core-extension.js";

class MenuState {
  constructor() {
    this.currentMenu = ConfigGetter.get('INITIAL_PANEL') || 'phone';
    this.coreMenuList = [
      { id: 'phone', name: 'DEVICES' },
      { id: 'graph', name: 'GRAPH' },
      { id: 'misc', name: 'MISC' },
    ];
    this.extensionMenuList = [];
  }

  init(coreEvent) {
    this.coreEvent = coreEvent;
    // Update Menu Panel to Initial Value
    document.querySelector(`.menu-panel[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
    // Update Menu Bar Item to Initial Value
    document.querySelector(`.menu-bar-item[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
    // Update Current Menu
    window.addEventListener('core:menu-change', (e) => {
      this.currentMenu = e.detail.target.replace('-panel', '');
    });
    // Add StringLoader Observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
  };

  getMenuList() {
    return [...this.coreMenuList, ...this.extensionMenuList];
  };

  getCoreMenuList() {
    return [...this.coreMenuList];
  }

  getCurrentIndex() {
    const menuList = this.getMenuList();
    return menuList.findIndex(menu => menu.id === this.currentMenu);
  }

  /**
   * Add Extension Menu to Menu Panel and Menu Bar
   * @param {string} menuName 
   * @param {string} menuBarTitle 
   * @param {string} elementName 
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

    document.querySelector('.menu-panels').insertBefore(
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
    document.querySelector('.menu-carousel').insertBefore(
      newButton, 
      document.querySelector('.menu-bar-item[data-target="misc-panel"]')
    );

    this.coreEvent.dispatchEvent('extension-menu-added');
  };

  _updateCarousel() {
    const carousel = document.querySelector('menu-carousel');
    if (carousel) {
      // Force carousel to reinitialize with new buttons
      carousel._buttons = Array.from(carousel.querySelectorAll('.menu-bar-item')).filter(button => {
        const computedStyle = window.getComputedStyle(button);
        return computedStyle.display !== 'none';
      });
      carousel._updateCarousel();
      carousel._addEventListener();
    }
  };

  _updateLanguage() {
    this._updateCoreLanguage();
    this._updateExtensionLanguage();
  };

  _updateCoreLanguage() {
    if(!this.coreMenuList) return;
    this.coreMenuList.forEach((menu, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${menu.id}-panel"]`);
      if (menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`menu.item-${menu.id}-label`, menu.name.toUpperCase());
      }
    })
  };

  _updateExtensionLanguage() {
    if(!this.extensionMenuList) return;
    this.extensionMenuList.forEach((menu, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${menu.id}-panel"]`);
      if(menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`extension.${menu.id}.menu-label`, menu.name.toUpperCase());
      }
    })
  };

  static getInstance() {
    if(!MenuState.instance) {
      MenuState.instance = new MenuState();
    }
    return MenuState.instance;
  }
}

export default MenuState.getInstance();
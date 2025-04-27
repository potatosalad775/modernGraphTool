import StringLoader from "./util/string-loader.js";
import ConfigGetter from "./util/config-getter.js";

class MenuState {
  constructor() {
    this.currentMenu = ConfigGetter.get('INITIAL_PANEL') || 'phone';
    this.coreMenuList = ['phone', 'graph', 'list', 'misc'];
    this.coreMenuBarName = ['DEVICES', 'GRAPH', 'LIST', 'MISC'];
    this.extensionMenuList = [];
  }

  init(coreEvent) {
    this.coreEvent = coreEvent;
    // Add StringLoader Observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
    // Update Menu Panel to Initial Value
    document.querySelector(`.menu-panel[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
    // Update Menu Bar Item to Initial Value
    document.querySelector(`.menu-bar-item[data-target="${this.currentMenu}-panel"]`)
    ?.classList.add('active');
  };

  getMenuList() {
    return [...this.coreMenuList, ...this.extensionMenuList];
  };
  
  getCoreMenuPanels() {
    var htmlString = '';
    this.coreMenuList.forEach((menu) => {
      htmlString += `<${menu}-panel></${menu}-panel>`;
    });
    return htmlString;
  };

  getCoreMenuBarItem() {
    var htmlString = '';
    this.coreMenuList.forEach((menu, index) => {
      htmlString += `
      <button type="button" class="menu-bar-item" data-target="${menu}-panel">
        ${StringLoader.getString(`menu.item-${menu}-label`, this.coreMenuBarName[index] || '?')}
      </button>
      `;
    })
    return htmlString;
  };

  /**
   * Add Extension Menu to Menu Panel and Menu Bar
   * @param {string} menuName 
   * @param {string} menuBarTitle 
   * @param {string} inputHTML 
   */
  addExtensionMenu(menuName, menuBarTitle, inputHTML) {
    const trimmedName = menuName.trim();
    
    // Add to extension lists
    this.extensionMenuList.push(trimmedName);

    // Create and add panel
    const newPanel = document.createElement("div");
    newPanel.id = `${trimmedName}-panel`;
    newPanel.className = "menu-panel extension-panel";
    newPanel.setAttribute("data-target", `${trimmedName}-panel`);
    newPanel.innerHTML = inputHTML;
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
    this.coreMenuBarName.forEach((menuBarName, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${this.coreMenuList[index]}-panel"]`);
      if (menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`menu.item-${this.coreMenuList[index]}-label`, menuBarName);
      }
    })
  };

  _updateExtensionLanguage() {
    this.extensionMenuList.forEach((menu, index) => {
      const menuBarItem = document.querySelector(`.menu-bar-item[data-target="${menu}-panel"]`);
      if(menuBarItem) {
        menuBarItem.textContent = StringLoader.getString(`extension.${menu}.menu-label`, menu.toUpperCase());
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
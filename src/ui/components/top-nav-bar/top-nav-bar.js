import ConfigGetter from "../../../model/util/config-getter.js";
import StringLoader from "../../../model/util/string-loader.js";
import { IconProvider } from "../../../styles/icon-provider.js";
import { topNavBarStyles } from "./top-nav-bar.styles.js";

class TopNavBar extends HTMLElement {
  constructor() {
    super();

    this.isMobile = document.documentElement.hasAttribute('data-mobile') || window.innerWidth < 1000;
    this.linkList = ConfigGetter.get('TOPBAR.LINK_LIST') || [];
    this.render();
    this.setupEventListeners();
  }

  connectedCallback() {
    window.addEventListener('resize', this._handleScreenResize.bind(this));
    StringLoader.addObserver(this._handleLanguageChange.bind(this));
  }
  disconnectedCallback() {
    window.removeEventListener('resize', this._handleScreenResize.bind(this));
    StringLoader.removeObserver(this._handleLanguageChange.bind(this));
  }

  render() {
    const titleType = window.GRAPHTOOL_CONFIG?.TOPBAR?.TITLE?.TYPE || "TEXT";
    const titleContent = window.GRAPHTOOL_CONFIG?.TOPBAR?.TITLE?.CONTENT || "modernGraphTool";

    this.innerHTML = `
      <header class="header">
        <nav class="top-nav-bar">
          <div class="top-nav-bar-leading">
            <a class="top-nav-bar-leading-title" href=".">
              ${titleType === "HTML" ? titleContent : ""}
              ${titleType === "TEXT" ? "<h2>" + titleContent + "</h2>" : ""}
              ${titleType === "IMAGE" ? "<img src='" + titleContent + "' alt='topbar title'/>" : ""}
            </a>
          </div>
          ${this.isMobile ? `
            <button class="mobile-menu-button">
              ${IconProvider.Icon('menu', 'width: 1.5rem; height: 1.5rem;')}
            </button>
            <div class="mobile-sidebar">
              <div class="mobile-sidebar-overlay"></div>
              <div class="mobile-sidebar-content">
                <div class="mobile-sidebar-header">
                  <h2>${StringLoader.getString('top-nav-bar.sidebar-link-title', 'LINKS')}</h2>
                  <button class="mobile-sidebar-close">
                    ${IconProvider.Icon('close', 'width: 1.5rem; height: 1.5rem;')}
                  </button>
                </div>
                ${this.linkList.map((link) => `
                  <a href="${link.URL}" target="_blank" rel="noopener">${link.TITLE}</a>
                `).join("")}
              </div>
            </div>
          ` : `
            <div class="top-nav-bar-trailing">
              ${this.linkList.map((link) => `
                <a href="${link.URL}" target="_blank" rel="noopener">${link.TITLE}</a>
              `).join("")}
            </div>
          `}
        </nav>
      </header>
    `;

    const style = document.createElement("style");
    style.textContent = topNavBarStyles;
    this.appendChild(style);
  }

  setupEventListeners() {
    if (this.isMobile) {
      const menuButton = this.querySelector('.mobile-menu-button');
      const sidebar = this.querySelector('.mobile-sidebar');
      const overlay = this.querySelector('.mobile-sidebar-overlay');
      const closeButton = this.querySelector('.mobile-sidebar-close');

      menuButton?.addEventListener('click', () => {
        sidebar.classList.add('visible');
        document.body.style.overflow = 'hidden';
      });

      overlay?.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        document.body.style.overflow = '';
      });
      
      closeButton?.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        document.body.style.overflow = '';
      });
    }
  }

  _handleScreenResize() {
    this.isMobile = document.documentElement.hasAttribute('data-mobile');
    this.render();
    this.setupEventListeners();
  }

  _handleLanguageChange() {
    this.linkList = ConfigGetter.get('TOPBAR.LINK_LIST') || [];
    this.render();
    this.setupEventListeners();
  }
}

customElements.define("top-nav-bar", TopNavBar);
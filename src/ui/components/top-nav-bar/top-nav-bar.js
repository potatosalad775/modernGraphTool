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
    window.addEventListener('core:ui-mode-change', this._handleScreenResize.bind(this));
    StringLoader.addObserver(this._handleLanguageChange.bind(this));
  }
  disconnectedCallback() {
    window.removeEventListener('core:ui-mode-change', this._handleScreenResize.bind(this));
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
          <!-- Trailing Button -->
          <button class="mobile-menu-button" style="display: ${this.isMobile ? 'block' : 'none'}">
            ${IconProvider.Icon('menu', 'width: 1.5rem; height: 1.5rem;')}
          </button>
          <div class="mobile-sidebar" style="display: ${this.isMobile ? 'block' : 'none'}">
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
          <div class="top-nav-bar-trailing" style="display: ${this.isMobile ? 'none' : 'flex'}">
            ${this.linkList.map((link) => `
              <a href="${link.URL}" target="_blank" rel="noopener">${link.TITLE}</a>
            `).join("")}
          </div>
        </nav>
      </header>
    `;

    const style = document.createElement("style");
    style.textContent = topNavBarStyles;
    this.appendChild(style);
  }

  setupEventListeners() {
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

  _handleScreenResize(e = null) {
    if (e && this.isMobile !== e?.detail.isMobile) {
      this.isMobile = e.detail.isMobile; // Update the stored state
    }
    // Update UI element
    if (this.isMobile) {
      this.querySelector('.top-nav-bar-trailing').style.display = 'none';
      this.querySelector('.mobile-menu-button').style.display = 'block';
      this.querySelector('.mobile-sidebar').style.display = 'block';
    } else {
      this.querySelector('.top-nav-bar-trailing').style.display = 'flex';
      this.querySelector('.mobile-menu-button').style.display = 'none';
      this.querySelector('.mobile-sidebar').style.display = 'none';
    }
  }

  _handleLanguageChange() {
    this.linkList = ConfigGetter.get('TOPBAR.LINK_LIST') || [];

    // Update desktop links
    const trailingContainer = this.querySelector('.top-nav-bar-trailing');
    if (trailingContainer) {
      trailingContainer.innerHTML = this.linkList.map((link) => `
        <a href="${link.URL}" target="_blank" rel="noopener">${link.TITLE}</a>
      `).join("");
    }

    // Update mobile sidebar links and header
    const sidebarContent = this.querySelector('.mobile-sidebar-content');
    if (sidebarContent) {
      const sidebarHeader = sidebarContent.querySelector('.mobile-sidebar-header h2');
      if (sidebarHeader) {
        sidebarHeader.textContent = StringLoader.getString('top-nav-bar.sidebar-link-title', 'LINKS');
      }
      // Remove existing links before adding new ones
      sidebarContent.querySelectorAll('a').forEach(a => a.remove());
      // Add new links
      this.linkList.forEach(link => {
        const linkElement = document.createElement('a');
        linkElement.href = link.URL;
        linkElement.target = '_blank';
        linkElement.rel = 'noopener';
        linkElement.textContent = link.TITLE;
        sidebarContent.appendChild(linkElement);
      });
    }
  }
}

customElements.define("top-nav-bar", TopNavBar);
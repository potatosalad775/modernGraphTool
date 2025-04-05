import { DataProvider } from "../../core.min.js";
window.activePhones = []; // Expose activePhones List Globally

// Function to update the active phones
function updateActivePhones() {
  Array.from(DataProvider.getFRDataMap()).forEach(([uuid, phone]) => {
    window.activePhones.push({
      uuid: uuid,
      isTarget: phone.type === 'target',
      fullName: phone.identifier,
      dispName: phone.identifier + " " + phone.dispSuffix,
    })
  });

  window.addEventListener('core:fr-phone-added', (e) => {
    const phone = DataProvider.frDataMap.get(e.detail.uuid);
    window.activePhones.push({
      uuid: phone.uuid,
      isTarget: false,
      fullName: phone.identifier,
      dispName: phone.identifier + " " + phone.dispSuffix,
    })
  });

  window.addEventListener('core:fr-target-added', (e) => {
    const phone = DataProvider.frDataMap.get(e.detail.uuid);
    window.activePhones.push({
      uuid: phone.uuid,
      isTarget: false,
      fullName: phone.identifier,
      dispName: phone.identifier + " " + phone.dispSuffix,
    })
  });

  window.addEventListener('core:fr-phone-removed', (e) => {
    window.activePhones = window.activePhones.filter((phone) => phone.uuid !== e.detail.uuid);
  });

  window.addEventListener('core:fr-target-removed', (e) => {
    window.activePhones = window.activePhones.filter((phone) => phone.uuid !== e.detail.uuid);
  });
}
updateActivePhones();

export default class SquiglinkIntegration {
  constructor(config = {}) {
    this.config = config;
    this.scriptsLoaded = false;

    // Analytic Parameter
    window.ANALYTICS_SITE = window.ANALYTICS_SITE || "";
    window.ANALYTICS_GTM_ID = window.ANALYTICS_GTM_ID || "";
    window.LOG_ANALYTICS = this.config.LOG_ANALYTICS || true;
  }

  async init() {
    await this._initElements();
    await this._loadDependencies();
    this._initSquiglinkFeatures();
  }

  async _initElements() {
    // Add necessary classes / elements for Squiglink integration
    document.querySelector('.ps-header-search')?.classList.add('search');
    document.querySelector('.menu-bar-item[data-target="equalizer-panel"]')?.classList.add('extra');
    // Add IDs and Classes to Phone List for Squiglink Search integration
    const phoneList = document.querySelector('.ps-phone-list');
    if (phoneList) { phoneList.id = 'phones'; }
    phoneList.querySelectorAll('.ps-phone-item')?.forEach((item) => {
      item.classList.add('phone-item');
    });
    const searchResultStyle = document.createElement('style');
    searchResultStyle.textContent = `
      .db-site-container {
        background-color: var(--gt-color-tertiary-container) !important;
        color: var(--gt-color-on-tertiary-container);
        border: 1px solid var(--gt-color-tertiary);
        border-radius: 0.75rem !important;
        margin-bottom: 0.75rem;
      }
      .db-site-header {
        position: initial !important;
        border-bottom: 1px solid var(--gt-color-outline) !important;
      }
      .db-site-header:before {
        display: none !important;
      }
      .db-site-header:after {
        background: var(--gt-color-tertiary) !important;
      }
      .fauxn-link {
        color: var(--gt-color-on-tertiary-container) !important;
      }
      .fauxn-link:before {
        background-color: var(--gt-color-on-tertiary-container) !important;
      }
    `;
    phoneList?.appendChild(searchResultStyle);
    // Replace Target Group Name with Div for Squiglink Delta integration
    document.querySelectorAll('.target-list-container')?.forEach((container) => {
      container.classList.add('targetClass');
      const h4Element = container.querySelector('h4.target-group-name');
      if (h4Element) {
        const divElement = document.createElement('div');
        const spanElement = document.createElement('span');
        spanElement.textContent = h4Element.textContent;
        spanElement.style = `color: var(--gt-color-primary); font-weight: 600;`;
        divElement.className = 'targetLabel';
        divElement.appendChild(spanElement);
        h4Element.parentNode.replaceChild(divElement, h4Element);
      }
    });
    const targetClassStyle = document.createElement('style');
    targetClassStyle.textContent = `
      .targetClass.delta-targets:before {
        width: 4.5rem !important;
        height: 1.5rem !important;
        margin: 0 !important;
        background: var(--gt-color-primary) !important;
      }
      .welcome-deltaReady-launcher { 
        margin: 0 !important;
        color: var(--gt-color-on-secondary) !important;
        background-color: var(--gt-color-secondary) !important;
      }
    `;
    document.querySelector('.target-selector-group')?.appendChild(targetClassStyle);
    // Add Header Link for Squiglink Options
    const headerLink = document.createElement('ul');
    headerLink.className = 'header-links';
    headerLink.style = `
      list-style-type: none;
      margin: 0;
      padding: 0;
      padding-left: 1rem;
      margin-left: 1rem;
      overflow: hidden;
    `
    headerLink.innerHTML = `
      <style>
        .squig-select-li { padding: 0 !important; }
        .squig-select {
          background-color: var(--gt-color-surface-container-lowest) !important;
          color: var(--gt-color-on-surface) !important;
          border: 1px solid var(--gt-color-outline) !important;
          border-radius: 0.5rem !important;
        }
      </style>`
    document.querySelector('.top-nav-bar-leading')?.appendChild(headerLink);
    // Add Helper Row to Graph Panel for Squiglink Intro
    const introRow = document.createElement('div');
    introRow.classList.add('tools', 'menu-panel-row');
    introRow.innerHTML = `
      <style>
        .tools { padding: 1rem 0.1rem 0 0.1rem; }
        .welcome-launcher-container { padding: 0 !important; }
        .welcome-launcher { 
          color: var(--gt-color-on-secondary) !important;
          background-color: var(--gt-color-secondary) !important;
        }
        .shop-link-container { padding: 0 !important; }
        .shop-link-container span { color: var(--gt-color-on-surface) !important; }
      </style>`
    const graphPanel = document.querySelector('#graph-panel');
    const divider = graphPanel?.querySelector('gt-divider');
    if (graphPanel) {
      graphPanel.insertBefore(introRow, divider);
    }
    // Add Helper Row to Graph Panel for Squiglink Intro
    document.querySelector('.eq-uploader')?.classList.add('extra-upload');
    const extraUploadStyle = document.createElement('style');
    extraUploadStyle.textContent = `
      .welcome-eq-launcher {
        color: var(--gt-color-on-secondary) !important;
        background-color: var(--gt-color-secondary) !important;
      }`;
    document.querySelector('.eq-uploader')?.appendChild(extraUploadStyle);
  }

  async _loadDependencies() {
    // Load graphAnalytics and squigsites from local reference
    await Promise.all([
      this._injectScript('./extension/squiglink-integration/graphAnalytics.js'),
      this._injectScript('https://squig.link/squigsites.js')
    ]);
    
    this.scriptsLoaded = true;
  }

  _initSquiglinkFeatures() {
    // Wait for graph container to be ready
    const waitForGraph = setInterval(() => {
      if (customElements.get('graph-container') && this.scriptsLoaded) {
        clearInterval(waitForGraph);
        // Add Delta Target Mods from Squig.link
        window.deltaTargetMods();
        // Connect Graph Analytic Event Listeners
        this._connectGraphAnalytics();
      }
    }, 100);
  }

  async _injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  _connectGraphAnalytics() {
    if(!this.config.ENABLE_ANALYTICS) return;
    // See if iframe gets CORS error when interacting with window.top
    let targetWindow;
    try {
      let emb = window.location.href.includes('embed');
      targetWindow = emb ? window : window.top;
    } catch {
      targetWindow = window;
    }
    // Connect screenshot analytics
    const screenshotButton = document.querySelector('.graph-screenshot-button');
    if (screenshotButton && window.pushEventTag) {
      screenshotButton.addEventListener('click', () => {
        window.pushEventTag("clicked_download", targetWindow);
      });
    }
    // Connect Equalizer analytics
    const equalizerButton = document.querySelector('.menu-bar-item[data-target="equalizer-panel"]');
    if (equalizerButton && window.pushEventTag) {
      equalizerButton.addEventListener('click', () => {
        window.pushEventTag("clicked_equalizer", targetWindow);
      });
    }
    // Connect Baseline analytics
    window.addEventListener('core:fr-baseline-updated', (e) => {
      const phone = DataProvider.frDataMap.get(e.detail.baselineUUID);
      if(phone) {
        window.pushPhoneTag("baseline_set", {
          phone: phone.type === 'target' ? phone.identifier.replace(/ Target$/, '') : phone.meta.name,
          dispBrand: phone.type === 'target' ? 'Target' : phone.meta.brand,
          dispName: phone.type === 'target' ? phone.identifier.replace(/ Target$/, '') : phone.meta.name + ' ' + phone.dispSuffix,
        });
      }
    });
    // Connect Phone analytics
    window.addEventListener('core:fr-phone-added', (e) => {
      const phone = DataProvider.frDataMap.get(e.detail.uuid);
      if(phone) {
        window.pushPhoneTag("phone_displayed", {
          phone: phone.meta.name,
          dispBrand: phone.meta.brand,
          dispName: phone.meta.name + ' ' + phone.dispSuffix,
        });
      }
    });
    window.addEventListener('core:fr-target-added', (e) => {
      const phone = DataProvider.frDataMap.get(e.detail.uuid);
      if(phone) {
        window.pushPhoneTag("phone_displayed", {
          phone: phone.identifier.replace(/ Target$/, ''),
          dispBrand: 'Target',
          dispName: phone.identifier.replace(/ Target$/, ''),
        });
      }
    });
  }
}
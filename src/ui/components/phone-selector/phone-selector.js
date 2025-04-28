import CoreEvent from "../../../core-event.js";
import DataProvider from "../../../model/data-provider.js";
import StringLoader from "../../../model/util/string-loader.js";
import ConfigGetter from "../../../model/util/config-getter.js";
import MetadataParser from "../../../model/util/metadata-parser.js";
import { IconProvider } from "../../../styles/icon-provider.js";
import { phoneSelectorStyles } from "./phone-selector.styles.js";

class PhoneSelector extends HTMLElement {
  constructor() {
    super();
    //this.attachShadow({ mode: 'open' });

    this.className = "phone-selector-container";
    this.innerHTML = `
      <header class="ps-header">
        <gt-button class="ps-header-nav-brand" variant="filled">
          ${'< ' + StringLoader.getString('phone-selector.header-brand-btn', 'Brands')}
        </gt-button>
        <input type="search" class="ps-header-search" placeholder='${
          StringLoader.getString('phone-selector.header-search-bar-placeholder', 'Search')
        }'>
        <gt-button class="ps-header-nav-phone" variant="filled" style="display:none">
          ${StringLoader.getString('phone-selector.header-device-btn', 'Devices') + ' >'}
        </gt-button>
      </header>
      <div class="ps-lists">
        <div class="ps-brand-list"></div>
        <div class="ps-phone-list mobile-visible"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = phoneSelectorStyles;
    this.appendChild(style);

    // Search Box Event Listener
    this.querySelector('.ps-header-search').addEventListener('input', (e) => {
      this._filterPhoneList(e.target.value);
    });
    // Mobile UI Nav Button Event Listener
    this.querySelector('.ps-header-nav-brand').addEventListener('click', (e) => this._switchListPanel(e, 'brand'));
    this.querySelector('.ps-header-nav-phone').addEventListener('click', (e) => this._switchListPanel(e, 'phone'));
  }

  connectedCallback() {
    window.addEventListener('core:fr-phone-added', (e) => this._changePhoneItemBtnStatus(e, true));
    window.addEventListener('core:fr-phone-removed', (e) => this._changePhoneItemBtnStatus(e, false));
    window.addEventListener('core:metadata-loaded', () => this._init());
    StringLoader.addObserver(this._updateLanguage.bind(this));

    // I really hate this approach, but it's the only way to avoid flexbox bug in Android Chromium
    if (/Android/.test(navigator.userAgent)) {
      window.addEventListener('core:init-ready', () => { 
        this.style.display = 'none'; setTimeout(() => { this.style.display = 'flex' }, "1000");
      });
    }
  }

  disconnectedCallback() {
    window.removeEventListener('core:fr-phone-added', (e) => this._changePhoneItemBtnStatus(e, true));
    window.removeEventListener('core:fr-phone-removed', (e) => this._changePhoneItemBtnStatus(e, false));
    window.removeEventListener('core:metadata-loaded', () => this._init());
    StringLoader.removeObserver(this._updateLanguage.bind(this));
  }

  _init() {
    if(MetadataParser.phoneMetadata === null) {
      return;
    }
    // Fetch Data
    this.brandListData = Array.from(MetadataParser.phoneMetadata).map((brand) => brand.brand);
    this.fullPhoneListData = Array.from(MetadataParser.phoneMetadata).flatMap(
      (brand) => brand.phones.map(phone => ({...phone, brand: brand.brand}))
    );
    this.phoneListData = Array.from(MetadataParser.phoneMetadata).flatMap(
      (brand) => brand.phones.map(phone => ({...phone, brand: brand.brand}))
    );

    // Render Elements and Add EventListeners
    this._renderBrandList();
    this._renderPhoneList();
    this._addBrandEventListeners();
    this._addPhoneEventListeners();

    // Dispatch Event
    CoreEvent.dispatchInitEvent("phone-ui-ready");
  }

  _renderBrandList() {
    this.brandListData.forEach((brand) => {
      const brandItem = document.createElement("label");
      brandItem.className = "ps-brand-item";
      brandItem.innerHTML = `
        <input type="checkbox" data-identifier="${brand}">
        <span>${brand}</span>
      `;
      this.querySelector(".ps-brand-list").appendChild(brandItem);
    });
  }

  _renderPhoneList() {
    // Clear existing phone list
    this.querySelector(".ps-phone-list").innerHTML = '';
    // Render new phone list
    this.phoneListData.forEach((phone) => {
      const phoneItem = document.createElement("div");
      phoneItem.className = "ps-phone-item";
      phoneItem.innerHTML = `
        <label>
          <input type="checkbox" 
            data-identifier="${phone.identifier}" 
            ${DataProvider.isFRDataLoaded(phone.identifier) ? "checked" : ""}
          >
          <span class="ps-phone-name">${phone.identifier}</span>
          ${phone.reviewScore ? `<span class="ps-phone-review-score">${this._getScoreElement(phone.reviewScore)}</span>` : ""}
          ${phone.price ? `<span class="ps-phone-price">${phone.price}</span>` : ""}
          ${phone.reviewLink || phone.shopLink 
            ? `<div class="ps-link-group">
                ${phone.reviewLink 
                  ? `<a target="_blank" rel="noopener" href="${phone.reviewLink}" class="ps-link-review">
                      ${IconProvider.Icon('externalLink')} ${StringLoader.getString('phone-selector.item-review', 'Review')}
                    </a>` 
                  : ""
                }
                ${phone.shopLink 
                  ? `<a target="_blank" rel="noopener" href="${phone.shopLink}" class="ps-link-shop">
                      ${IconProvider.Icon('externalLink')} ${StringLoader.getString('phone-selector.item-shop', 'Shop')}
                    </a>` 
                  : ""
                }
              </div>` 
            : ""}
        </label>
      `;
      this.querySelector(".ps-phone-list").appendChild(phoneItem);
    });
  }

  _addBrandEventListeners() {
    this.querySelectorAll(".ps-brand-item input").forEach((input) => {
      input.addEventListener("change", (e) => {
        e.preventDefault();
        
        const brand = e.target.dataset.identifier;
        const checkedInputs = Array.from(this.querySelectorAll(".ps-brand-item input:checked"));
        
        // If no inputs are checked, show full phone list
        if (checkedInputs.length === 0) {
          this.phoneListData = [...this.fullPhoneListData];
        }
        // If only one input is checked, show only phones from that brand
        else if (checkedInputs.length === 1) {
          const selectedBrand = checkedInputs[0].dataset.identifier;
          this.phoneListData = this.fullPhoneListData.filter(
            phone => phone.brand === selectedBrand
          );
        }
        // If multiple inputs are checked, add or remove phones based on checkbox state
        else {
          if (e.target.checked) {
            const selectedBrands = checkedInputs.map(input => input.dataset.identifier);
            this.phoneListData = this.fullPhoneListData.filter(
              phone => selectedBrands.includes(phone.brand)
            );
          } else {
            // Remove phones from the unselected brand
            this.phoneListData = this.phoneListData.filter(
              phone => phone.brand !== brand
            );
          }
        }
        
        // Re-render Phone List and Re-attach Event Listeners
        this._renderPhoneList();
        this._addPhoneEventListeners();
      });
    });
  }

  _addPhoneEventListeners() {
    this.querySelectorAll(".ps-phone-item input").forEach((input) => {
      input.addEventListener("change", async (e) => {
        e.preventDefault();

        const phoneItem = e.target.closest('.ps-phone-item');
        phoneItem.setAttribute('aria-busy', 'true');
        input.disabled = true;

        const identifier = e.target.dataset.identifier;
        const wasChecked = DataProvider.isFRDataLoaded(identifier);
        
        try {
          await DataProvider.toggleFRData("phone", identifier, !wasChecked);
        } catch (e) {
          input.checked = wasChecked;
          console.error('Failed to toggle phone data:', e);
        } finally {
          input.disabled = false;
          phoneItem.setAttribute('aria-busy', 'false');
        }

        // Block removing Phone once it's selected
        if (!ConfigGetter.get('INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR') && input.checked) {
          input.disabled = true;
        }
      });
    });
  }

  _filterPhoneList(query) {
    const searchTerm = query.toLowerCase().trim();
    this.querySelectorAll('.ps-phone-item').forEach(item => {
      const phoneName = item.querySelector('.ps-phone-name').textContent.toLowerCase();
      const displayStyle = phoneName.includes(searchTerm) ? 'flex' : 'none';
      item.style.display = displayStyle;
    });
  }

  _changePhoneItemBtnStatus(e, enable) {
    // Clear any pending timeouts
    if (this._updateBtnStatTimeout && this._previousBtnTarget === e.detail.identifier) {
      clearTimeout(this._updateBtnStatTimeout);
    }

    // If the phone is still included, ignore disable request
    if (!enable && DataProvider.isFRDataLoaded(e.detail.identifier)) {
      return;
    }

    this._previousBtnTarget = e.detail.identifier,
    this._updateBtnStatTimeout = setTimeout(() => {
      // Change Button Appearance to Selected
      if(enable) {
        const input = this.querySelector(`.ps-phone-item input[data-identifier="${e.detail.identifier}"]`);
        if (input) {
          input.checked = true;
          if (!ConfigGetter.get('INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR')) {
            input.disabled = true;
          }
        }
      }
      // Change Button Appearance to Unselected
      else {
        const input = this.querySelector(`.ps-phone-item input[data-identifier="${e.detail.identifier}"]`);
        if (input) {
          input.checked = false;
          input.disabled = false;
        }
      }
      this._updateBtnStatTimeout = null;
    }, 100); // 100ms Delay before Changing Button status to prevent flickering
  }

  _switchListPanel(e, type) {
    e.preventDefault();
    this.querySelector('.ps-brand-list').classList.toggle('mobile-visible');
    this.querySelector('.ps-phone-list').classList.toggle('mobile-visible');
    this.querySelector(`.ps-header-nav-${type === 'phone' ? 'brand' : 'phone'}`).style.display = '';
    this.querySelector(`.ps-header-nav-${type}`).style.display = 'none';
  }

  _getScoreElement(score) {
    // Return score immediately if it's a whole number between 0-5
    if (!Number.isInteger(parseInt(score)) || score < 0 && 5 < score) {
      return score;
    }

    let stars = '';
    const fullStars = Math.floor(score);
    const hasHalfStar = (score % 1) >= 0.5;
    const emptyStars = 5 - Math.ceil(score);

    // Add full stars
    for (let i = 0; i < fullStars; i++) { stars += IconProvider.Icon('starFill'); }
    // Add half star if needed
    if (hasHalfStar) { stars += IconProvider.Icon('starHalf'); }
    // Add empty stars
    for (let i = 0; i < emptyStars; i++) { stars += IconProvider.Icon('starLine'); }

    return stars;
  }

  _updateLanguage() {
    // Update Selector Header
    this.querySelector('.ps-header-nav-brand').innerHTML =
      '< ' + StringLoader.getString('phone-selector.header-brand-btn', 'Brands');
    this.querySelector('.ps-header-search').placeholder =
      StringLoader.getString('phone-selector.header-search-bar-placeholder', 'Search');
    this.querySelector('.ps-header-nav-phone').innerHTML =
      StringLoader.getString('phone-selector.header-device-btn', 'Devices') + ' >';
    // Update Phone List
    this.querySelectorAll('.ps-link-review').forEach(e =>
      e.innerHTML = `${IconProvider.Icon('externalLink')} ${StringLoader.getString('phone-selector.item-review', 'Review')}`
    )
    this.querySelectorAll('.ps-link-shop').forEach(e =>
      e.innerHTML = `${IconProvider.Icon('externalLink')} ${StringLoader.getString('phone-selector.item-shop', 'Shop')}`
    )
  }
}

customElements.define("phone-selector", PhoneSelector);

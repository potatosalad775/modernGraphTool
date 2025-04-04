import StringLoader from "../../../model/util/string-loader.js";
import { IconProvider } from "../../../styles/icon-provider.js";

class GraphScreenshotButton extends HTMLElement {
  constructor() {
    super();
    
    this.innerHTML = `
      <gt-button variant="filled-tonal" style="height: 2.5rem">
        ${IconProvider.Icon('screenshot', 'margin-top: -2px; width: 1.2rem; height: 1.2rem;')}
        <span>${StringLoader.getString('screenshot-button.label', 'Screenshot')}</span>
      </gt-button>
    `;
    
    this._boundCapture = this.capture.bind(this);
    this._boundApplyComputedStyles = this._applyComputedStyles.bind(this);

    this._button = this.querySelector('gt-button');
    this._button.addEventListener('click', (e) => this._boundCapture(e, 'graph'));
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  /**
   * Captures the FR graph and downloads it as a PNG file
   * @param {string} filename - Name of the downloaded file (without extension)
   */
  capture(e, filename = 'fr-graph') {
    e.preventDefault();
    
    const svg = document.getElementById('fr-graph');
    if (!svg) {
      console.error('FR Graph not found');
      return;
    }

    // Temporarily Hide Y-Axis Scaler Handle
    const scaler = svg.querySelector('.y-scaler-handle');
    if (scaler) scaler.style.display = 'none';

    // Create a copy of the SVG to modify for export
    const clone = svg.cloneNode(true);
    
    // Set explicit dimensions to match viewBox
    clone.setAttribute('width', svg.viewBox.baseVal.width);
    clone.setAttribute('height', svg.viewBox.baseVal.height);
    
    // Apply computed styles to ensure the image looks exactly like what's displayed
    this._boundApplyComputedStyles(clone);
    
    // Convert SVG to a data URL with base64 encoded images
    this._embedImages(clone).then(() => {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create an image from the SVG
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Rest of the canvas drawing code...
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = svg.viewBox.baseVal.width * scale;
        canvas.height = svg.viewBox.baseVal.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.querySelector('.main-graph')).backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        URL.revokeObjectURL(url);
      };
      
      // Convert SVG to base64 data URL for WebKit
      const reader = new FileReader();
      reader.onloadend = () => {
        img.src = reader.result;
      };
      reader.readAsDataURL(svgBlob);
    });

    // Recover Y-Axis Scaler Handle
    if (scaler) scaler.style.display = 'block';
  }

  /**
   * Applies computed styles to the SVG clone to maintain visual consistency
   * @param {SVGElement} clone - The cloned SVG element
   */
  _applyComputedStyles(clone) {
    // First, apply styles to the SVG element itself
    const svgComputed = window.getComputedStyle(document.getElementById('fr-graph'));
    clone.style.backgroundColor = svgComputed.backgroundColor;

    // Get all elements including the ones in shadow DOM
    const elements = clone.querySelectorAll('*');
    const originalElements = document.getElementById('fr-graph').querySelectorAll('*');
    
    elements.forEach((element, index) => {
      const original = originalElements[index];
      if (!original) return;

      const computed = window.getComputedStyle(original);
      
      // Copy essential SVG properties
      const svgProperties = [
        'fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 
        'font-family', 'font-weight', 'text-anchor', 'transform',
        'mask', 'clip-path', 'display', 'visibility'
      ];

      svgProperties.forEach(prop => {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'none') {
          element.style[prop] = value;
        }
      });

      // Handle CSS variables
      const cssVars = computed.cssText.match(/--[\w-]+/g) || [];
      cssVars.forEach(varName => {
        const value = computed.getPropertyValue(varName);
        if (value) {
          element.style.setProperty(varName, value);
        }
      });

      // Ensure text elements are visible
      if (element.tagName === 'text') {
        element.style.fill = computed.fill;
        element.style.fontFamily = computed.fontFamily;
        element.style.fontSize = computed.fontSize;
      }
    });
  }

  /**
   * Embeds image under SVG elements
   * @param {SVGElement} clone - The cloned SVG element
   */
  async _embedImages(clone) {
    const images = clone.querySelectorAll('image');
    const promises = Array.from(images).map(async (image) => {
      const href = image.getAttribute('href') || image.getAttribute('xlink:href');
      if (href) {
        try {
          const response = await fetch(href);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              image.setAttribute('href', reader.result);
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.warn('Failed to embed image:', href, error);
        }
      }
    });

    await Promise.all(promises);
  }

  _updateLabel() {
    this.querySelector('span').textContent = StringLoader.getString('screenshot-button.label', 'Screenshot');
  }
}

customElements.define('graph-screenshot-button', GraphScreenshotButton);
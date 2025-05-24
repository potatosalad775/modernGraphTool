import { StringLoader } from "../../core.min.js";

export default class FrequencyTutorial {
  constructor(config = {}) {
    this.config = config;
    this.enContent = null;
    this.currentRange = null;

    this._init();
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  async _init() {
    await this._getString();
    this._render();
  }

  async _getString() {
    if(!this.enContent) {
      const enResponse = await fetch(import.meta.resolve("./strings/en.json"));
      if (!enResponse.ok) throw new Error();

      this.enContent = await enResponse.json();
    }
    
    if(!this.config.USE_ENGLISH_ONLY) {
      const lang = StringLoader.getCurrentLanguage();
      const response = await fetch(import.meta.resolve(`./strings/${lang}.json`));
      if (!response.ok) throw new Error(`Language ${lang} not found`);

      this.content = await response.json()
    } else {
      this.content = this.enContent;
    }
  }

  _render() {
    // Create container for buttons and description
    this.container = document.createElement('div');
    this.container.className = 'frequency-tutorial-container';
    this.container.innerHTML = `
      <style>
        .frequency-tutorial-container {
          display: flex;
          flex-direction: column;
        }
        .frequency-buttons {
          display: flex;
          flex-direction: row;
          justify-content: safe center;
          gap: 0.5rem;
          overflow-x: scroll;
          padding-bottom: 0.3rem;
          margin-bottom: 0.3rem;

          gt-button {
            min-width: fit-content;
            height: 100%;
          }
        }
        .frequency-description {
          padding: 1rem;
          border-radius: 0.5rem;
          background: var(--gt-color-tertiary-container);
          color: var(--gt-color-tertiary);
          font: var(--gt-typescale-body-medium);
          display: none;
        }
        .frequency-description.visible {
          display: block;
          margin-bottom: 1rem;
        }
        .frequency-buttons::-webkit-scrollbar {
          height: 0.4rem;
        }
        .frequency-buttons::-webkit-scrollbar-track {
          background: rgba(0,0,0,0);
        }
        .frequency-buttons::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.2);
          border-radius: 1rem;
        }

      </style>
      <div class="frequency-buttons"></div>
      <div class="frequency-description"></div>
    `;

    // Add buttons for each frequency range
    const buttonContainer = this.container.querySelector('.frequency-buttons');
    this.content.forEach((range, index) => {
      const button = document.createElement('gt-button');
      button.setAttribute('variant', 'filled-tertiary');
      button.setAttribute('toggleable', '');
      button.textContent = range.name;
      button.addEventListener('gt-button-toggle', (e) => this.showRange(e, index));
      buttonContainer.appendChild(button);
    });

    // Insert container after the graph
    const targetSelectorGroup = document.querySelector('.target-selector-container');
    targetSelectorGroup.parentNode.insertBefore(this.container, targetSelectorGroup);

    // Create highlight rectangle in SVG
    const svg = d3.select('#fr-graph');
    if (!svg.select('.frequency-highlight').empty()) {
      svg.select('.frequency-highlight').remove();
    }
    
    svg.insert('rect', ':first-child')
      .attr('class', 'frequency-highlight')
      .attr('x', 0)
      .attr('y', 15)
      .attr('height', 420)
      .attr('fill', 'var(--gt-color-tertiary)')
      .attr('opacity', 0.1)
      .style('display', 'none');

    this._addDragScroll(this.container.querySelector('.frequency-buttons'));
  }

  showRange(e, index) {
    e.preventDefault();
    
    const range = this.content[index];
    const description = document.querySelector('.frequency-description');
    const highlight = d3.select('.frequency-highlight');
    const xScale = d3.scaleLog()
      .domain([20, 20000])
      .range([15, 785]);

    // Toggle description
    if (this.currentRange === index) {
      description.classList.remove('visible');
      highlight.style('display', 'none');
      this.currentRange = null;
    } else {
      // Untoggle all other buttons silently
      this.container.querySelectorAll('.frequency-buttons > gt-button').forEach((btn, i) => {
        if (i !== index) btn.toggle(false, true);
      });
      
      description.textContent = range.description;
      description.classList.add('visible');
      
      // Show and position highlight rectangle
      highlight
        .style('display', 'block')
        .attr('x', xScale(range.range[0]))
        .attr('width', xScale(range.range[1]) - xScale(range.range[0]));
      
      this.currentRange = index;
    }
  }

  _addDragScroll(element) {
    let isDown = false;
    let startX;
    let scrollLeft;

    element.addEventListener('mousedown', (e) => {
      // Prevent default drag behavior (like text selection)
      e.preventDefault();
      isDown = true;
      element.style.cursor = 'grabbing'; // Change cursor to indicate dragging
      element.style.userSelect = 'none'; // Prevent text selection during drag
      startX = e.pageX - element.offsetLeft;
      scrollLeft = element.scrollLeft;
    });

    element.addEventListener('mouseleave', () => {
      if (!isDown) return;
      isDown = false;
      element.style.cursor = 'default'; // Reset cursor
      element.style.userSelect = ''; // Re-enable text selection
    });

    element.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      element.style.cursor = 'default'; // Reset cursor
      element.style.userSelect = ''; // Re-enable text selection
    });

    element.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - element.offsetLeft;
      const walk = (x - startX) * 1.5; // Multiplier for scroll speed adjustment
      element.scrollLeft = scrollLeft - walk;
    });

    // Set initial cursor style
    element.style.cursor = 'default';
  };

  async _updateLanguage() {
    // Update String
    await this._getString();
    // Update Button Name
    this.container.querySelectorAll('.frequency-buttons > gt-button').forEach((btn, index) => {
      btn.textContent = this.content[index].name;
    });
  }
}
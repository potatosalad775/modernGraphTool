/**
 * Preference Bound Extension
 * 
 * This extension adds a toggleable preference bound area to the graph.
 * The bounds are read from 'Bounds U.txt' and 'Bounds D.txt'.
 */
import { RenderEngine, StringLoader, FRParser, FRNormalizer } from "../../core.min.js";
import { interpolatePath } from "./d3-interpolate-path.js";

export default class PreferenceBoundExtension {
  constructor(config = {}) {
    this.config = config;
    this.boundDataU = null;
    this.boundDataD = null;
    this.baseDFTargetData = null;
    this.boundsVisible = false;
    this.preferenceBoundArea = null;
    this.pathData = {
      raw: null,
      comp: null,
    }
    this.previousBaselineUUID = null;
    this.buttonId = 'ext-preference-bound-toggle';
  }

  async init() {
    //console.log('Preference Bound Extension: Initializing...');
    try {
      // Load data
      await this.loadBoundData();
      await this.loadBaseDFTargetData();
      // Create toggle button after data is loaded to ensure it's in the documen
      this.createToggleButton();
      // Initially draw bound if config says so
      this.togglePreferenceBounds(this.config.ENABLE_BOUND_ON_INITIAL_LOAD || false); 
      // Add event listeners for baseline change
      window.addEventListener('core:fr-baseline-updated', this.updatePath.bind(this, true));
      window.addEventListener('core:fr-normalized', this.updateNormalization.bind(this));
      const yScaleButton = document.querySelector('graph-scale-button gt-button');
      if (yScaleButton) {
        yScaleButton.addEventListener('click', this.updateYScale.bind(this));
      }
      StringLoader.addObserver(this.updateLanguage.bind(this));
      //console.log('Preference Bound Extension: Initialized successfully.');
    } catch (error) {
      console.error('Preference Bound Extension: Initialization failed', error);
    }
  }

  async loadBoundData() {
    try {
      const responseU = await fetch(
        import.meta.resolve(`./data/${this.config.BOUND_DATA_FILE || 'Bounds'} U.txt`)
      );
      if (!responseU.ok) throw new Error(`Failed to load Bounds U.txt: ${responseU.statusText}`);
      const textU = await responseU.text();
      this.boundDataU = await FRParser.parseFRData(textU);

      const responseD = await fetch(
        import.meta.resolve(`./data/${this.config.BOUND_DATA_FILE || 'Bounds'} D.txt`)
      );
      if (!responseD.ok) throw new Error(`Failed to load Bounds D.txt: ${responseD.statusText}`);
      const textD = await responseD.text();
      this.boundDataD = await FRParser.parseFRData(textD);
      
      //console.log('Preference Bound Extension: Bound data loaded.');
    } catch (error) {
      console.error('Preference Bound Extension: Error loading bound data', error);
      this.boundDataU = {};
      this.boundDataD = {};
      throw error; // Re-throw to be caught by init
    }
  }

  async loadBaseDFTargetData() {
    try {
      const fileName = this.config.BASE_DF_TARGET_FILE + (
        !this.config.BASE_DF_TARGET_FILE.endsWith('.txt') 
          ? (this.config.BASE_DF_TARGET_FILE.endsWith(' Target') ? '.txt' : ' Target.txt')
          : ''
        );
      if (!fileName) {
        console.warn('Preference Bound Extension: No BASE_DF_TARGET_FILE specified in config.');
        return;
      }

      // Load text data
      const responseDF = await fetch(import.meta.resolve(`./data/${fileName}`));
      if (!responseDF.ok) throw new Error(`Failed to load Bounds U.txt: ${responseDF.statusText}`);
      const textU = await responseDF.text();

      // Parse and normalize data
      const parsedDF = await FRParser.parseFRData(textU);
      this.baseDFTargetData = FRNormalizer.normalize(parsedDF); 
      
      //console.log('Preference Bound Extension: Bound data loaded.');
    } catch (error) {
      console.error('Preference Bound Extension: Error loading base DF target data', error);
      this.baseDFTargetData = {};
      throw error; // Re-throw to be caught by init
    }
  }

  createToggleButton() {
    const graphControls = document.querySelector('#graph-panel .menu-panel-row'); 
    
    if (graphControls) {
      // Append styles
      const styleElement = document.createElement('style');
      styleElement.innerHTML = prefBoundButtonStyles;
      graphControls.parentNode.appendChild(styleElement);

      // Append the toggle button
      const button = document.createElement('button');
      button.id = this.buttonId;
      button.innerHTML = `
        ${StringLoader.getString('extension.preference-bound.button.toggle', 'Preference Bound')}
      `;
      button.title = 'Toggle Preference Bounds';
      button.addEventListener('click', () => this.togglePreferenceBounds());
      graphControls.appendChild(button);

      //console.log('Preference Bound Extension: Toggle button added to #graph-controls.');
    } else {
      console.warn('Preference Bound Extension: Could not find a suitable place to add the toggle button. componentManager.addButton or #graph-controls or .graph-toolbar-secondary not found.');
    }
  }

  togglePreferenceBounds(forceState) {
    this.boundsVisible = typeof forceState === 'boolean' ? forceState : !this.boundsVisible;
    if (this.boundsVisible) {
      this.drawPreferenceBounds();
    } else {
      this.removePreferenceBounds();
    }
    // Update button appearance if necessary
    const button = document.getElementById(this.buttonId);
    if (button) {
      button.classList.toggle('active', this.boundsVisible);
    }
    //console.log(`Preference Bound Extension: Bounds ${this.boundsVisible ? 'shown' : 'hidden'}.`);
  }

  drawPreferenceBounds() {
    const svg = d3.select('#fr-graph');

    if (!svg || !this.boundDataU || !this.boundDataD || 
      this.boundDataU.data.length === 0 || this.boundDataD.data.length === 0
    ) {
      console.warn('Preference Bound Extension: Cannot draw bounds, missing data or renderEngine.');
      return;
    }
    this.removePreferenceBounds(); // Clear existing if any

    // Update path data
    this.updatePathData();
    
    const mainCurveContainer = svg.select('.fr-graph-curve-container');
    const boundsGroup = svg.insert('g', '.fr-graph-curve-container')
        .attr('class', 'preference-bound-area-group');

    this.preferenceBoundArea = boundsGroup.append('path')
      .attr('d', RenderEngine.baselineData.uuid === null ? this.pathData.raw : this.pathData.comp)
      .attr('fill', this.config.COLOR_FILL || 'rgba(180, 180, 180, 0.2)')
      .attr('stroke', this.config.COLOR_BORDER || 'rgba(120, 120, 120, 0.2)')
      .attr('stroke-width', 1);

    //console.log('Preference Bound Extension: Bounds drawn.');
  }

  removePreferenceBounds() {
    if (this.preferenceBoundArea) {
      this.preferenceBoundArea.remove();
      this.preferenceBoundArea = null;
    }
    // Also remove the group if it was created separately
    const svg = d3.select('#fr-graph');
    if (svg) {
      svg.select('.preference-bound-area-group').remove();
    }
    //console.log('Preference Bound Extension: Bounds removed.');
  }

  updatePathData() {
    const { xScale, yScale } = RenderEngine.getScales();
    
    const compLineGenerator = d3.line()
      .x(d => xScale(d[0]))
      .y(d => yScale(d[1]))
      .curve(d3.curveLinear);

    const rawLineGenerator = d3.line()
      .x(d => xScale(d[0]))
      .y(d => {
        if (!this.baseDFTargetData.data) return yScale(d[1]);

        // Create bisector for frequency lookup
        const bisect = d3.bisector(d => d[0]).left;
        
        // Find closest frequency in baseline data
        const i = bisect(this.baseDFTargetData.data, d[0], 0);
        const a = this.baseDFTargetData.data[i - 1];
        const b = this.baseDFTargetData.data[i];
        
        let baselineY = 0;
        if (a && b) {
          // interpolate between nearest points
          const t = (d[0] - a[0]) / (b[0] - a[0]);
          baselineY = a[1] + t * (b[1] - a[1]);
        } else if (a) {
          baselineY = a[1];
        } else if (b) {
          baselineY = b[1];
        }

        return yScale(baselineY + d[1]);
      })
      .curve(d3.curveNatural);

    this.pathData = {
      raw:  rawLineGenerator(this.boundDataU.data) + 
            rawLineGenerator(this.boundDataD.data.slice().reverse()).replace(/^M/, 'L') + 
            'Z',
      comp: compLineGenerator(this.boundDataU.data) + 
            compLineGenerator(this.boundDataD.data.slice().reverse()).replace(/^M/, 'L') + 
            'Z',
    }
  }

  updatePath(animate = false) {
    // No need to update path if bounds are not visible
    if(!this.boundsVisible) return;

    const self = this;

    if (RenderEngine.baselineData.uuid !== null && this.previousBaselineUUID === null) {
      // Something is selected as baseline, use comp path
      this.preferenceBoundArea
        .transition()
        .duration(animate ? 300 : 0)
        .attrTween("d", (d) => {  
          const oldPath = self.pathData.raw;
          const newPath = self.pathData.comp;
          return interpolatePath(oldPath, newPath);
        });
    } else if (RenderEngine.baselineData.uuid === null && this.previousBaselineUUID !== null) {
      // No baseline, use raw path
      this.preferenceBoundArea
        .transition()
        .duration(animate ? 300 : 0)
        .attrTween("d", (d) => {  
          const oldPath = self.pathData.comp;
          const newPath = self.pathData.raw;
          return interpolatePath(oldPath, newPath);
        });
    }
    this.previousBaselineUUID = RenderEngine.baselineData.uuid;
  }

  updateYScale(e) {
    // No need to update if bounds are not visible
    if(!this.boundsVisible) return;

    this.updatePathData();
    this.updatePath(true);
  }

  updateNormalization(e) {
    // No need to update if bounds are not visible
    if(!this.boundsVisible) return;
    
    // Update Normalization
    const normalizedData = FRNormalizer.normalize(this.baseDFTargetData);
    this.baseDFTargetData = normalizedData;

    // Update Path
    this.updatePathData();
    this.updatePath(false);
  }

  updateLanguage() {
    const button = document.getElementById(this.buttonId);
    if (button) {
      button.innerHTML = `
        ${StringLoader.getString('extension.preference-bound.button.toggle', 'Preference Bound')}
      `;
    }
  }

  // Method to be called if the extension is disabled or removed
  destroy() {
    this.removePreferenceBounds();
    const button = document.getElementById(this.buttonId);
    if (button) {
      button.remove();
    }
    console.log('Preference Bound Extension: Destroyed.');
  }
}

const prefBoundButtonStyles = `
  #ext-preference-bound-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 2.5rem;
    padding: 0.5rem 1rem;
    border-radius: 2.5rem;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.2s ease;
    gap: 0.5rem;
    background: inherit;
    color: var(--gt-color-primary);
    border: 1px solid var(--gt-color-primary);
  }

  #ext-preference-bound-toggle.active {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    border-color: var(--gt-color-primary);
  }
  
  #ext-preference-bound-toggle:not(.active):hover {
    background: var(--gt-shadow);
  }
  
  #ext-preference-bound-toggle.active:hover {
    filter: var(--gt-hover-filter);
  }
`;
/**
 * Preference Bound Extension
 * 
 * This extension adds a toggleable preference bound area to the graph.
 * The bounds are read from 'Bounds U.txt' and 'Bounds D.txt'.
 */
import { 
  RenderEngine, 
  StringLoader, 
  FRParser, 
  FRSmoother, 
  FRNormalizer 
} from "../../core.min.js";
import { interpolatePath } from "./d3-interpolate-path.js";
// D3 is loaded globally via UMD script  
const d3 = window.d3;

// Extension metadata for version compatibility
export const EXTENSION_METADATA = {
  name: 'preference-bound',
  version: '1.0.0',
  apiLevel: 1,
  coreMinVersion: '1.0.0',
  coreMaxVersion: '1.0.x',
  description: 'Preference Bound extension for modernGraphTool',
  author: 'potatosalad775'
};

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
    this.previousPathData = null;
    this.buttonId = 'ext-preference-bound-toggle';
  }

  async init() {
    //console.log('Preference Bound Extension: Initializing...');
    try {
      // Load data
      await this.loadBoundData();
      await this.loadBaseDFTargetData();

      // Create toggle button
      this.createToggleButton();

      // Initially draw bound if config says so
      this.togglePreferenceBounds(this.config.ENABLE_BOUND_ON_INITIAL_LOAD || false); 

      // Add event listeners
      window.addEventListener('core:fr-baseline-updated', this.handleBaselineChange.bind(this, true));
      window.addEventListener('core:fr-normalized', this.handleNormalizationUpdate.bind(this));
      const yScaleButton = document.querySelector('graph-scale-button gt-button');
      if (yScaleButton) {
        yScaleButton.addEventListener('click', this.handleYScaleUpdate.bind(this));
      }

      // Update Pref-bound description
      this.updatePrefBoundDescription();

      // Add observer for language change
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
      const parsedDataU = await FRParser.parseFRData(textU);
      this.boundDataU = {
        ...parsedDataU,
        data: FRSmoother.smooth(parsedDataU.data)
      };

      const responseD = await fetch(
        import.meta.resolve(`./data/${this.config.BOUND_DATA_FILE || 'Bounds'} D.txt`)
      );
      if (!responseD.ok) throw new Error(`Failed to load Bounds D.txt: ${responseD.statusText}`);
      const textD = await responseD.text();
      const parsedDataD = await FRParser.parseFRData(textD);
      this.boundDataD = {
        ...parsedDataD,
        data: FRSmoother.smooth(parsedDataD.data)
      };
      
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
      const textDF = await responseDF.text();

      // Parse and normalize data
      const parsedDF = await FRParser.parseFRData(textDF);
      const smoothedDF = {
        ...parsedDF,
        data: FRSmoother.smooth(parsedDF.data)
      };
      this.baseDFTargetData = FRNormalizer.normalize(smoothedDF); 
      
      //console.log('Preference Bound Extension: Bound data loaded.');
    } catch (error) {
      console.error('Preference Bound Extension: Error loading base DF target data', error);
      this.baseDFTargetData = {};
      throw error; // Re-throw to be caught by init
    }
  }

  async createToggleButton() {
    // Try to find graph controls element multiple times
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 100; // 500ms between attempts

    while (attempts < maxAttempts) {
      const graphControls = document.querySelector('.graph-button-container');
      
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
        graphControls.insertBefore(button, graphControls.firstChild);

        //console.log('Preference Bound Extension: Toggle button added to #graph-controls.');
        return;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      attempts++;
    }

    console.warn('Preference Bound Extension: Could not find a suitable place to add the toggle button after multiple attempts. componentManager.addButton or #graph-controls or .graph-toolbar-secondary not found.');
  }

  updatePrefBoundDescription() {
    const targetText = this.config.BASE_DF_TARGET_FILE.endsWith(' Target')
      ? this.config.BASE_DF_TARGET_FILE
      : this.config.BASE_DF_TARGET_FILE + ' Target';

    const descriptionText = StringLoader.getString(
      'extension.preference-bound.description', 
      'Preference Bound in this database is based on ${TARGET}.'
    ).replace('${TARGET}', targetText);

    if(document.querySelector('.preference-bound-description')) {
      document.querySelector('.preference-bound-description').textContent = descriptionText;
    } else {
      const descriptionContainer = document.getElementById('db-description');
      const descriptionElement = document.createElement('p');

      descriptionElement.className = 'preference-bound-description';
      descriptionElement.textContent = descriptionText;
      descriptionContainer.appendChild(descriptionElement);
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
      .y(d => {
        // Get Baseline Data
        const baselineData = RenderEngine.getBaselineData();
        if (baselineData.uuid === null) return yScale(d[1]); // No baseline, use raw data (It shouldn't supposed to happen tho)

        // Create bisector for frequency lookup
        const bisect = d3.bisector(d => d[0]).left;
        
        // Find closest frequency in base DF target data
        const i1 = bisect(this.baseDFTargetData.data, d[0], 0);
        const a1 = this.baseDFTargetData.data[i1 - 1];
        const b1 = this.baseDFTargetData.data[i1];

        // Find closest frequency in baseline data
        const i2 = bisect(baselineData.channelData, d[0], 0);
        const a2 = baselineData.channelData[i2 - 1];
        const b2 = baselineData.channelData[i2];

        // Calculate interpolated values
        let baseDFY = 0;
        let baselineY = 0;

        if (a1 && b1) {
          const t1 = (d[0] - a1[0]) / (b1[0] - a1[0]);
          baseDFY = a1[1] + t1 * (b1[1] - a1[1]);
        } else if (a1) {
          baseDFY = a1[1];
        } else if (b1) {
          baseDFY = b1[1];
        }

        if (a2 && b2) {
          const t2 = (d[0] - a2[0]) / (b2[0] - a2[0]);
          baselineY = a2[1] + t2 * (b2[1] - a2[1]);
        } else if (a2) {
          baselineY = a2[1];
        } else if (b2) {
          baselineY = b2[1];
        }

        // Add raw data and subtract baseline compensation
        return yScale(baseDFY + d[1] - baselineY);
      })
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

    if (RenderEngine.baselineData.uuid !== null) {
      // Something is selected as baseline, use comp path
      this.preferenceBoundArea
        .transition()
        .duration(animate ? 300 : 0)
        .attrTween("d", (d) => {  
          const oldPath = self.previousPathData;
          const newPath = self.pathData.comp;
          return interpolatePath(oldPath, newPath);
        });
      this.previousPathData = this.pathData.comp; // Save for next event
    } else {
      // No baseline, use raw path
      this.preferenceBoundArea
        .transition()
        .duration(animate ? 300 : 0)
        .attrTween("d", (d) => {  
          const oldPath = self.previousPathData;
          const newPath = self.pathData.raw;
          return interpolatePath(oldPath, newPath);
        });
      this.previousPathData = this.pathData.raw; // Save for next event
    }
    this.previousBaselineUUID = RenderEngine.baselineData.uuid;
  }

  handleYScaleUpdate(e) {
    // No need to update if bounds are not visible
    if(!this.boundsVisible) return;

    this.updatePathData();
    this.updatePath(true);
  }

  handleBaselineChange(e) {
    // No need to update if bounds are not visible
    if(!this.boundsVisible) return;
    // Update path data if baseline is set
    if(RenderEngine.baselineData.uuid!== null) this.updatePathData();
    // Update path
    this.updatePath(true);
  }

  handleNormalizationUpdate(e) {
    // No need to update if bounds are not visible
    if(!this.boundsVisible) return;
    
    // Save current path
    if(RenderEngine.baselineData.uuid !== null) {
      this.previousPathData = this.pathData.comp;
    } else {
      this.previousPathData = this.pathData.raw;
    }

    // Update Normalization
    const normalizedData = FRNormalizer.normalize(this.baseDFTargetData);
    this.baseDFTargetData = normalizedData;

    // Update Path
    this.updatePathData();
    this.updatePath(true);
  }

  updateLanguage() {
    const button = document.getElementById(this.buttonId);
    if (button) {
      button.innerHTML = `
        ${StringLoader.getString('extension.preference-bound.button.toggle', 'Preference Bound')}
      `;
    }
    // Update Pref-bound description
    this.updatePrefBoundDescription();
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
    background: var(--gt-color-primary-container);
    color: var(--gt-color-on-primary-container);
    border: none;
  }

  #ext-preference-bound-toggle.active {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
  }

  @media (hover: hover) and (pointer: fine) {
    #ext-preference-bound-toggle:not(.active):hover {
      filter: var(--gt-hover-filter);
    }
    
    #ext-preference-bound-toggle.active:hover {
      filter: var(--gt-hover-filter);
    }
  }
`;
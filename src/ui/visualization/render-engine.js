const d3 = window.d3;
import RenderEvent from "./render-event.js";
import FRSmoother from "../../model/util/fr-smoother.js";
import GraphWatermark from "./graph-watermark.js";
import GraphHandle from "./graph-handle.js";
import GraphInspection from "./graph-inspection.js";
import ConfigGetter from "../../model/util/config-getter.js";

/**
 * @typedef {import('../../types/data-types.js').FRDataPoint} FRDataPoint
 * @typedef {import('../../types/data-types.js').FRDataObject} FRDataObject
 */

/**
 * RenderEngine class handles the rendering of frequency response curves
 */
class RenderEngine {
  constructor() {
    this.graphGeometry = {
      xStart: 15,
      xEnd: 785,
      yTop: 15,
      yBottom: 435,
    };
    this.labelPosition = {
      BOTTOM_LEFT: { x: 60, y: 427, anchor: "start", growUp: true },
      BOTTOM_RIGHT: { x: 740, y: 427, anchor: "end", growUp: true },
      TOP_LEFT: { x: 60, y: 60, anchor: "start", growUp: false },
      TOP_RIGHT: { x: 740, y: 60, anchor: "end", growUp: false },
    };
    this.baselineData = {
      /** @type {string} */
      uuid: null,
      /** @type {string} */
      identifier: null,
      /** @type {FRDataPoint[]} */
      channelData: null,
    };
    this.transitionDuration = 300;
  }

  /**
   * Initialize RenderEngine with core event and data provider
   * @param {import('../../core-event.js').default} coreEvent - Core event handler
   * @param {import('../../model/data-provider.js').default} dataProvider - Data provider for frequency response data
   * @return {void}
   */
  init(coreEvent, dataProvider) {
    this.coreEvent = coreEvent;
    this.dataProvider = dataProvider;
    
    // Initialize Render Event
    RenderEvent.init(this);
    this.yScaleValue = parseInt(ConfigGetter.get('VISUALIZATION.DEFAULT_Y_SCALE')) || 60;

    // Setup Graph
    this.svg = d3
      .select(`#fr-graph`)
      .attr("viewBox", "0 0 800 450")
      .attr("preserveAspectRatio", "xMidYMid meet");

    this._setupScales();
    this._drawAxis();
    this._drawFadeGradient();
    this._createCurveGroup();

    // Setup Graph Watermark
    GraphWatermark(this.svg);
    // Setup Graph Vertical Scaler Handle
    this.graphHandle = new GraphHandle(this.svg, this);
    // Setup Graph Inspection System
    this.graphInspection = new GraphInspection(this);
  };

  /**
   * Update the graph with new data.
   * @returns {void}
   */
  refreshEveryFRCurves() {
    // Clear any pending timeouts
    if (this._updateCurveTimeout) {
      clearTimeout(this._updateCurveTimeout);
    }

    // 100ms delay before executing
    this._updateCurveTimeout = setTimeout(() => {
      // Remove Previous Graphs
      this.svg.select(".fr-graph-curve-container").selectAll("*").remove();
      // Re-draw every curves
      Array.from(this.dataProvider.getFRDataMap()).forEach(([uuid, _]) => {
        this.drawFRCurve(uuid);
      });
      // Re-order layers
      this.orderOverlayLayers();
      // Reset Timeout
      this._updateCurveTimeout = null;
    }, 100); 
  };

  /**
   * Update Y Scale of Graph
   * @param {string} scale
   * @returns {void}
   */
  updateYScale(scale) {
    //const oldYScale = this.yScale.copy();
    this.yScaleValue = parseInt(scale);
    this._setupScales();
    // Reset Vertical Scaler Handle
    this.graphHandle.resetHandle();
    // Re-draw Y Axis
    //this.updateYAxis(oldYScale);
    this.updateYAxis();
    // Transition Phone Graph
    this.curveGroup.selectAll("*")
      .transition()
      .duration(this.transitionDuration)
      .attr("d", d => {
        const lineGenerator = d3.line()
          .x(d => this.xScale(d[0]))
          .y(d => this.yScale(d[1]))
          .curve(d3.curveNatural);
        return lineGenerator(d);
      });
  };

  /**
   * Update Labels of graph
   * @returns {void}
   */
  updateLabels() {
    // Clear any pending timeouts
    if (this._updateLabelTimeout) {
      clearTimeout(this._updateLabelTimeout);
    }

    // 100ms delay before executing
    this._updateLabelTimeout = setTimeout(() => {
      var labelCounter = 0;
      const labelLocation = ConfigGetter.get('VISUALIZATION.LABEL.LOCATION') || "BOTTOM_LEFT";
      const startX = this.labelPosition[labelLocation].x 
        + parseInt(ConfigGetter.get('VISUALIZATION.LABEL.POSITION.RIGHT') || 0)
        - parseInt(ConfigGetter.get('VISUALIZATION.LABEL.POSITION.LEFT') || 0);
      const startY = this.labelPosition[labelLocation].y
        + parseInt(ConfigGetter.get('VISUALIZATION.LABEL.POSITION.DOWN') || 0)
        - parseInt(ConfigGetter.get('VISUALIZATION.LABEL.POSITION.UP') || 0);
      const lineHeight = parseInt(ConfigGetter.get('VISUALIZATION.LABEL.TEXT_SIZE') || 17) + 8;

      // Create new label background group
      if (this.labelBgGroup) {
        this.labelBgGroup.remove();
      }
      this.labelBgGroup = this.svg
        .append("g")
        .attr("class", "fr-graph-label-bg")
        .attr("transform", `translate(${startX},${startY})`);

      // Create new label group
      if (this.labelGroup) {
        this.labelGroup.remove();
      }
      this.labelGroup = this.svg
        .append("g")
        .attr("class", "fr-graph-label")
        .attr("transform", `translate(${startX},${startY})`);

      Array.from(this.dataProvider.frDataMap)
      .sort(([, a], [, b]) => a.type === 'target' ? -1 :  1) // Display Target First
      .forEach(([_, obj]) => {
        if(obj.hidden) return; // Skip hidden items

        const channels = [...obj.dispChannel];
        channels.forEach((channel) => {
          const textContent = obj.type !== 'target' 
            ? `${obj.identifier} ${obj.dispSuffix} (${channel})` 
            : `${obj.identifier} ${obj.dispSuffix}`;

          // Add label background
          this.labelBgGroup
            .append("rect")
            .attr("class", "fr-graph-label-bg-rect")
            .attr("x", -10)
            .attr("y", `${(labelCounter - 0.75) * lineHeight}`)
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("uuid", obj.uuid)
            .attr("width", textContent.length * lineHeight * 0.35)
            .attr("height", lineHeight)
            .attr("fill", "var(--gt-color-surface-container-lowest)")
            .attr("opacity", "0.7")
            .attr("filter", "blur(4px)");

          // Add label text
          this.labelGroup
          .append("text")
          .attr("class", "fr-graph-label-text")
          .attr("y", `${labelCounter * lineHeight}`)
          .attr("fill", obj.colors[channel] || obj.colors?.AVG)
          .attr("style", this.labelPosition[labelLocation].style)
          .attr("text-anchor", this.labelPosition[labelLocation].anchor)
          .attr("font-size", ConfigGetter.get('VISUALIZATION.LABEL.TEXT_SIZE') || "20px")
          .attr("font-weight", ConfigGetter.get('VISUALIZATION.LABEL.TEXT_WEIGHT') || 600)
          .attr("uuid", obj.uuid)
          .text(textContent);

          // Increment LabelCounter
          labelCounter++;
        })

        // Update labelGroup Y position (if label list need to grow up)
        if(this.labelPosition[labelLocation].growUp) {
          this.labelGroup.attr("transform", `translate(${startX}, ${startY - (labelCounter * lineHeight)})`);
          this.labelBgGroup.attr("transform", `translate(${startX}, ${startY - (labelCounter * lineHeight)})`);
        }
      });
      this._updateLabelTimeout = null;
      
      // Notify inspection system that labels have been updated
      if (this.graphInspection) {
        this.graphInspection.onLabelsUpdated();
      }
    }, 0); 
  };

  /**
   * Update Baseline Data
   * @param {boolean} enable 
   * @param {Object} param
   * @param {string} param.uuid - UUID of the baseline data
   * @param {FRDataPoint[]} param.channelData - Channel data for the baseline
   * @returns {void}
   */
  updateBaselineData(enable, { uuid = null, channelData = null }) {
    // Update baseline data (on Toggle)
    if(!enable) {
      // Remove Baseline Data
      this.baselineData = {
        uuid: null,
        identifier: null,
        channelData: null,
      };
    } else {
      if(uuid === null) { console.error("Baseline UUID is not defined"); return; }
      const baselineMetaData = this.dataProvider.getFRData(uuid);
      this.baselineData = {
        uuid: uuid,
        identifier: baselineMetaData.identifier,
        channelData: channelData !== null
          ? channelData
          : baselineMetaData.type === 'phone' 
            ? baselineMetaData.channels[
                baselineMetaData.dispChannel.includes("L") && baselineMetaData.dispChannel.includes("R") 
                ? "AVG" 
                : baselineMetaData.dispChannel[0]
              ]?.data
            : baselineMetaData.channels['AVG'].data,
      };
    };
    // Update Baseline on Graph
    this.updateBaseline(true);
    this.updateBaselineLabel();
  };

  /**
   * Update Baseline on Graph
   * @param {boolean} animate - Whether to animate the transition
   * @returns {void}
   */
  updateBaseline(animate = false) {
    // Transition all curves
    const self = this;
    this.curveGroup.selectAll("path[class*='fr-graph-'][class*='-curve']")
      .transition()
      .duration(animate ? this.transitionDuration : 0)
      .attrTween("d", function(d) { 
        const path = d3.select(this); 
        const oldPath = path.attr("d");
        const newPath = self._getCompensatedPath(d);
        return t => d3.interpolateString(oldPath, newPath)(t);
      });
    
    // Fire Event
    this.coreEvent.dispatchEvent('fr-baseline-updated', { 
      baselineUUID: this.baselineData.uuid,
      baselineIdentifier: this.baselineData.identifier,
    });
  }

  /**
   * Update Baseline Label
   * @returns {void}
   */
  updateBaselineLabel() {
    const uuid = this.baselineData.uuid;
    const identifier = this.baselineData.identifier;
    // Add compensation description label
    if(uuid === null) {
      this.svg.selectAll(".fr-graph-baseline-text").remove();
    } else {
      // Only add new label if it doesn't exist
      if(!this.svg.selectAll(`.fr-graph-baseline-text[data-uuid='${uuid}']`).size()) {
        // Remove existing label if it exist (Possibly label with other uuid)
        const existingLabel = this.svg.selectAll('.fr-graph-baseline-text');
        if(existingLabel) { existingLabel.remove(); }
        // Get label position
        const labelLocation = ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.LOCATION') || "BOTTOM_LEFT";
        const labelX = this.labelPosition[labelLocation].x 
          + parseInt(ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.POSITION.RIGHT') || 0)
          - parseInt(ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.POSITION.LEFT') || 0);
        const labelY = this.labelPosition[labelLocation].y
          + parseInt(ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.POSITION.DOWN') || 0)
          - parseInt(ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.POSITION.UP') || 0);
        // Add baseline description label
        this.svg
          .append("text")
          .attr("class", "fr-graph-baseline-text")
          .attr("data-uuid", uuid)
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("text-anchor", this.labelPosition[labelLocation].anchor)
          .attr("fill", "#000000")
          .attr("opacity", "0.3")
          .attr("font-size", ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.TEXT_SIZE') || "15px")
          .attr("font-weight", ConfigGetter.get('VISUALIZATION.BASELINE_LABEL.TEXT_WEIGHT') || "500")
          .text(`${identifier} Compensated`);
      }
    }
  }

  /**
   * Update visibility of curves
   * @param {string} uuid - The UUID of the curve
   * @param {boolean} visible - Whether the curve should be visible
   * @returns {void}
   */
  updateVisibility(uuid, visible) {
    // Update visibility of curves
    this.svg.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
      .attr("visibility", visible ? "visible" : "hidden");
    
    // Update visibility of labels
    this.updateLabels();
  }

  /**
   * Get compensated path for frequency response data
   * @param {FRDataPoint[]} originalData - Original frequency response data
   * @returns {string} - SVG path string
   */
  _getCompensatedPath(originalData) {
    // Create bisector for frequency lookup
    const bisect = d3.bisector(point => point[0]).left;
    const isBaselineValid = Array.isArray(this.baselineData.channelData) 
      && this.baselineData.channelData.length > 0;

    // Create new path generator
    const lineGenerator = d3.line()
      .x(d => this.xScale(d[0]))
      .y(d => {
        if (!isBaselineValid) {
          return this.yScale(d[1]);
        }
        
        // Find closest frequency in baseline data
        const i = bisect(this.baselineData.channelData, d[0], 0);
        const a = this.baselineData.channelData[i - 1];
        const b = this.baselineData.channelData[i];
        
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

        return this.yScale(d[1] - baselineY);
      })
      .curve(d3.curveNatural);

    return lineGenerator(originalData);
  }

  /**
   * Get baseline data
   * @returns {Object} - Baseline data object
   */
  getBaselineData() {
    return this.baselineData;
  }
  
  /**
   * Order overlay layers in the SVG
   * This ensures that the graph elements are layered correctly
   * @returns {void}
   */
  orderOverlayLayers() {
    this.svg.selectAll('.fr-graph-x-axis, .fr-graph-y-axis').lower(); // Grid lines
    this.svg.selectAll('.fr-graph-curve-container').raise(); // Graphs
    this.svg.selectAll('.x-grid-text, .y-grid-text').raise(); // Grid text
    this.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').raise(); // Labels
  };

  /**
   * Setup scales for the graph
   * @returns {void}
   */
  _setupScales() {
    this.xScale = d3.scaleLog()
      .domain([20, 20000])
      .range([this.graphGeometry.xStart, this.graphGeometry.xEnd]);
    this.yScale = d3.scaleLinear()
      .domain([-(this.yScaleValue / 2), (this.yScaleValue / 2)])
      .range([this.graphGeometry.yBottom, this.graphGeometry.yTop]);
  };

  /**
   * Get scales for the graph
   * @returns {Object} - Object containing xScale and yScale
   */
  getScales() {
    return { xScale: this.xScale, yScale: this.yScale };
  }

  /**
   * Draw fade gradient mask for the graph
   * @returns {void}
   * @private
   */
  _drawAxis() {
    // Draw x-axis if it doesn't exist
    if(this.svg.select(".fr-graph-x-axis").empty()) {
      this.svg
       .append("g")
       .attr("class", "fr-graph-x-axis")
       .attr("transform", "translate(0,0)");
    }

    // Draw y-axis if it doesn't exist
    if(this.svg.select(".fr-graph-y-axis").empty()) {
      this.svg
      .append("g")
      .attr("class", "fr-graph-y-axis")
      .attr("transform", "translate(0,0)");
    }
    
    // Update both axes
    this.updateXAxis();
    this.updateYAxis();
  };

  /**
   * Create curve group for frequency response curves
   * @returns {void}
   * @private
   */
  _createCurveGroup() {
    if(this.svg.select(".fr-graph-curve-container").empty())   {
      this.curveGroup = this.svg
     .append("g")
     .attr("class", "fr-graph-curve-container")
     .attr("transform", "translate(0,0)")
     .attr("fill", "none")
     .attr("mask", "url(#blur-fade-mask)");
    }
  };

  /**
   * Draw FR Curve
   * @param {string} uuid - UUID of frDataMap Object
   */
  drawFRCurve(uuid) {
    // Try remove current graph if it exists
    this.eraseFRCurve(uuid);

    const object = this.dataProvider.getFRData(uuid);

    if (object.type === "phone") {
      this._drawPhoneCurve(object);
    } else if (object.type === "target") {
      this._drawTargetCurve(object);
    } else {
      this._drawUnknownCurve(object);
    }
  };

  /**
   * Draw Phone curve
   * @param {FRDataObject} obj - Frequency response data object
   * @private
   */
  _drawPhoneCurve(obj) {
    const channels = [...obj.dispChannel];
    
    channels.forEach((channel) => {
      this.curveGroup
        .append("path")
        .datum(() => FRSmoother.smooth(obj.channels[channel].data))
        .attr("class", `fr-graph-phone-curve`)
        .attr("uuid", obj.uuid)
        .attr("type", obj.type)
        .attr("channel", channel)
        .attr("identifier", obj.identifier)
        .attr("stroke", `${obj.colors[channel] || obj.colors['AVG']}`)
        .attr("stroke-width", ConfigGetter.get('TRACE_STYLING.PHONE_TRACE_THICKNESS') || 2)
        .attr("stroke-dasharray", obj.dash || "1 0")
        .attr("d", d => this._getCompensatedPath(d));
    });
  };

  /**
   * Draw Target curve
   * @param {FRDataObject} obj - Frequency response data object
   * @private
   */
  _drawTargetCurve(obj) {
    this.curveGroup
      .append("path")
      .datum(obj.channels['AVG'].data)
      .attr("class", "fr-graph-target-curve")
      .attr("uuid", obj.uuid)
      .attr("type", obj.type)
      .attr("identifier", obj.identifier)
      .attr("stroke", `${obj.colors['AVG'] || '#666'}`)
      .attr("stroke-width", ConfigGetter.get('TRACE_STYLING.TARGET_TRACE_THICKNESS') || 1)
      .attr("stroke-dasharray", obj.dash || "4 4")
      .attr("d", d => this._getCompensatedPath(d));
  };

  /**
   * Draw Unknown curve
   * @param {FRDataObject} obj - Frequency response data object
   * @private
   */
  _drawUnknownCurve(obj) {
    const channels = [...obj.dispChannel];
    
    channels.forEach((channel) => {
      this.curveGroup
        .append("path")
        .datum(() => FRSmoother.smooth(obj.channels[channel].data))
        .attr("class", `fr-graph-${obj.type}-curve`)
        .attr("uuid", obj.uuid)
        .attr("type", obj.type)
        .attr("channel", channel)
        .attr("identifier", obj.identifier)
        .attr("stroke", `${obj.colors[channel] || obj.colors['AVG']}`)
        .attr("stroke-width", obj.type === 'inserted-target' 
          ? (ConfigGetter.get('TRACE_STYLING.TARGET_TRACE_THICKNESS') || 1) 
          : (ConfigGetter.get('TRACE_STYLING.PHONE_TRACE_THICKNESS') || 2))
        .attr("stroke-dasharray", obj.dash || "1 0")
        .attr("d", d => this._getCompensatedPath(d));
    });
  };

  /**
   * Erase FR Curve
   * @param {string} uuid - UUID of frDataMap Object
   * @return {void}
   */
  eraseFRCurve(uuid) {
    this.curveGroup
     .selectAll(`*[uuid="${uuid}"]`)
     .remove();
  };

  /**
   * Update X Axis of the graph
   * @param {boolean} transition - Whether to apply a transition effect
   * @returns {void}
   */
  updateXAxis(transition = true) {
    const tickValues = [20,30,40,50,60,70,80,100,200,300,400,500,600,800,
      1000,2000,3000,4000,5000,6000,8000,10000,15000,20000];
    const majorTickValues = new Set([80, 300, 1000, 4000, 6000, 10000]);

    const axis = this.svg.select('.fr-graph-x-axis');
    const gridGroups = axis.selectAll('.x-grid-group')
      .data(tickValues, d => d);

    // Remove old elements
    gridGroups.exit()
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .style('opacity', 0)
      .remove();

    // Create new elements
    const enterGroups = gridGroups.enter()
      .append('g')
      .attr('class', 'x-grid-group')
      .attr('transform', d => `translate(${this.xScale(d)},0)`)
      .style('opacity', 0);

    // Add elements to new groups
    this._createXAxisElements(enterGroups, majorTickValues);

    // Update all elements
    const allGroups = enterGroups.merge(/** @type {d3.Selection} */(gridGroups));
    
    // Transition everything
    allGroups
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .style('opacity', 1)
      .attr('transform', d => `translate(${this.xScale(d)},0)`);

    this.orderOverlayLayers();
  };

  /**
   * Create X Axis elements (lines and text)
   * @param {d3.Selection} selection - D3 selection of the x-axis groups
   * @param {Set<number>} majorPoints - Set of major tick values
   * @returns {void}
   * @private
   */
  _createXAxisElements(selection, majorPoints) {
    // Add lines
    selection.append('line')
      .attr('class', d => majorPoints.has(d) ? 'x-grid-line-major' : 'x-grid-line')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', this.graphGeometry.yBottom)
      .attr('y2', this.graphGeometry.yTop)
      .attr('stroke', d => (d === 20 || d === 20000 || majorPoints.has(d)) 
        ? 'var(--gt-graph-grid-major)' 
        : 'var(--gt-graph-grid-minor)')
      .attr('stroke-width', d => (d === 20 || d === 20000 || majorPoints.has(d)) ? 1 : 0.5);

    // Add text
    selection.append('text')
      .attr('class', d => majorPoints.has(d) ? 'x-grid-text-major' : 'x-grid-text')
      .attr('x', 0)
      .attr('y', this.graphGeometry.yBottom)
      .attr('dy', '11')
      .attr('font-size', '0.6rem')
      .attr('font-weight', d => majorPoints.has(d) ? '500' : '300')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--gt-graph-grid-text)')
      .text(d => d >= 1000 ? `${d/1000}k` : d);
  };

  /**
   * Update Y Axis of the graph
   * @param {d3.ScaleLinear} [oldYScale=null] - Previous y scale for transition
   * @param {boolean} [transition=true] - Whether to apply a transition effect
   * @returns {void}
   */
  updateYAxis(oldYScale = null, transition = true) {
    const yScale = this.yScale;
    const tickValues = this.yScaleValue < 60 
      ? yScale.ticks(this.yScaleValue)
      : yScale.ticks(this.yScaleValue / 5);

    const axis = this.svg.select('.fr-graph-y-axis');
    const gridGroups = axis.selectAll('.y-grid-group')
      .data(tickValues, d => d);

    // Remove old elements
    gridGroups.exit()
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .style('opacity', 0)
      .remove();

    // Create new elements
    const enterGroups = gridGroups.enter()
      .append('g')
      .attr('class', 'y-grid-group')
      .attr('y', d => d)
      .style('opacity', 0);

    // Add lines and text for new elements
    this._createYAxisElements(enterGroups, oldYScale || yScale);

    // Update all elements
    const allGroups = enterGroups.merge(/** @type {d3.Selection} */(gridGroups));
    
    // Transition everything
    allGroups
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .style('opacity', 1);

    allGroups.selectAll('.y-grid-line, .y-grid-line-major')
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d));

    allGroups.selectAll('.y-grid-text')
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .attr('y', d => yScale(d));

    // Update or create dB label
    let dbText = axis.select('.y-grid-db-text');
    if (dbText.empty()) {
      dbText = axis.append('text')
        .attr('class', 'y-grid-db-text')
        .attr('transform', 'rotate(-90)')
        .text('dB');
    }
    
    dbText
      .attr('x', -31)
      .attr('y', 15)
      .attr('dx', 4)
      .attr('dy', -4)
      .attr('font-size', '0.6rem')
      .attr('font-weight', '400')
      .attr('text-anchor', 'start')
      .attr('fill', 'var(--gt-graph-grid-text)');

    this.orderOverlayLayers();
  };

  /**
   * Create Y Axis elements (lines and text)
   * @param {d3.Selection} selection - D3 selection of the y-axis groups
   * @param {d3.ScaleLinear} scale - Y scale for positioning elements
   * @returns {void}
   * @private
   */
  _createYAxisElements(selection, scale) {
    // Add lines
    selection.append('line')
      .attr('class', d => {
        //const isMajor = this.yScaleValue < 30 ? d % 5 === 0 : d % 10 === 0;
        const isMajor = d % 10 === 0;
        return isMajor ? 'y-grid-line' : 'y-grid-line-major';
      })
      .attr('x1', this.graphGeometry.xStart)
      .attr('x2', this.graphGeometry.xEnd)
      .attr('y1', d => scale(d))
      .attr('y2', d => scale(d))
      .attr('stroke', d => {
        const isMajor = d % 10 === 0;
        return isMajor ? 'var(--gt-graph-grid-major)' : 'var(--gt-graph-grid-minor)';
      })
      .attr('stroke-width', d => {
        const isMajor = d % 10 === 0;
        return isMajor ? 1 : 0.7;
      });

    // Add text for major ticks
    selection.each((d, i, nodes) => {
      const isMajor = d % 10 === 0;
      if (isMajor) {
        d3.select(nodes[i])
          .append('text')
          .attr('class', 'y-grid-text')
          .attr('x', this.graphGeometry.xStart)
          .attr('y', scale(d))
          .attr('dx', 4)
          .attr('dy', -4)
          .attr('font-size', '0.6rem')
          .attr('font-weight', '400')
          .attr('text-anchor', 'start')
          .attr('fill', 'var(--gt-graph-grid-text)')
          .text(d);
      }
    });
  };

  /**
   * Draw fade gradient mask for the graph
   * This creates a mask that fades out the edges of the graph
   * @returns {void}
   * @private
   */
  _drawFadeGradient() {
    const defs = this.svg.append("defs");
    const ix = 20; // Edge length
    const iy = 20;

    // Create Gradient Mask using White color
    // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Clipping_and_masking#masking
    defs.append("mask")
      .attr("id", "blur-fade-mask")
      .append("rect")
      .attr("x", ix)
      .attr("y", iy)
      .attr("width", 800 - (2 * ix))
      .attr("height", 450 - (2 * iy))
      .attr("fill", "white")
      .attr("filter", "blur(5px)");
  };

  /**
   * Handle channel update for frequency response curves
   * This method is called when a channel is updated, allowing for dynamic updates to the graph
   * @param {string} uuid - UUID of the frequency response data object
   * @param {string} type - Type of the curve (e.g., 'phone', 'target', etc.)
   * @returns {void}
   */
  channelUpdateRunner(uuid, type) {
    // Remove Current Paths
    this.curveGroup.selectAll(`.fr-graph-${type}-curve[uuid="${uuid}"]`).remove();
    // Draw Phone Curve
    if(type === 'phone') {
      this._drawPhoneCurve(this.dataProvider.getFRData(uuid));
    } else {
      this._drawUnknownCurve(this.dataProvider.getFRData(uuid));
    }
  };

  static getInstance() {
    if(!RenderEngine._instance) {
      RenderEngine._instance = new RenderEngine();
    }
    return RenderEngine._instance;
  };
};

/** @type {RenderEngine} */
RenderEngine._instance = null;

export default RenderEngine.getInstance();

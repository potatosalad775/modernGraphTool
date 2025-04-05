import RenderEvent from "./render-event.js";
import FRSmoother from "../../model/util/fr-smoother.js";
import GraphWatermark from "./graph-watermark.js";
import GraphHandle from "./graph-handle.js";

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
    this.baselineUUID = null;
    this.transitionDuration = 300;
  }

  init(coreEvent, dataProvider) {
    this.coreEvent = coreEvent;
    this.dataProvider = dataProvider;
    
    // Initialize Render Event
    RenderEvent.init(this);
    this.yScaleValue = parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.DEFAULT_Y_SCALE) || 60;

    // Setup Graph
    this.svg = d3
      .select(`#fr-graph`)
      .attr("viewBox", "0 0 800 450")
      .attr("preserveAspectRatio", "xMidYMid meet");

    this._setupScales();
    this._drawAxis();
    this._drawFadeGradient();
    this._createMainGroup();

    // Setup Graph Watermark
    GraphWatermark(this.svg);
    // Setup Graph Vertical Scaler Handle
    this.resetGraphHandle = GraphHandle(this.svg, this);
  };

  /**
   * Update the graph with new data.
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
   * @param {string | int} scale 
   */
  updateYScale(scale) {
    //const oldYScale = this.yScale.copy();
    this.yScaleValue = parseInt(scale);
    this._setupScales();
    // Reset Vertical Scaler Handle
    this.resetGraphHandle();
    // Re-draw Y Axis
    //this.updateYAxis(oldYScale);
    this.updateYAxis();
    // Transition Phone Graph
    this.mainGroup.selectAll("*")
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

  updateLabels() {
    // Clear any pending timeouts
    if (this._updateLabelTimeout) {
      clearTimeout(this._updateLabelTimeout);
    }

    // 100ms delay before executing
    this._updateLabelTimeout = setTimeout(() => {
      var labelCounter = 0;
      const labelLocation = window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.LOCATION || "BOTTOM_LEFT";
      const startX = this.labelPosition[labelLocation].x 
        + parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.POSITION?.RIGHT)
        - parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.POSITION?.LEFT);
      const startY = this.labelPosition[labelLocation].y
        + parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.POSITION?.DOWN)
        - parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.POSITION?.UP);
      const lineHeight = parseInt(window.GRAPHTOOL_CONFIG?.VISUALIZATION?.LABEL?.TEXT_SIZE) + 8 || 25;

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

        const channels = obj.dispChannel || [''];
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
          .attr("fill", obj.colors[channel])
          .attr("style", this.labelPosition[labelLocation].style)
          .attr("text-anchor", this.labelPosition[labelLocation].anchor)
          .attr("font-size", window.GRAPHTOOL_CONFIG.VISUALIZATION.LABEL.TEXT_SIZE || "20px")
          .attr("font-weight", window.GRAPHTOOL_CONFIG.VISUALIZATION.LABEL.TEXT_WEIGHT || 600)
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
    }, 0); 
  };

  updateBaseline(uuid = null, toggleBaseline = false) {
    if(toggleBaseline) {
      this.baselineUUID = this.baselineUUID === uuid ? null : uuid;
    }
        
    // Get current baseline data
    const baselineMetaData = this.dataProvider.getFRData(this.baselineUUID) || {};
    const baselineData = !this.baselineUUID 
      ? null
      : baselineMetaData.type === 'phone' 
        ? baselineMetaData.channels[
            baselineMetaData.dispChannel.includes("L") && baselineMetaData.dispChannel.includes("R") 
            ? "AVG" 
            : baselineMetaData.dispChannel[0]
          ]?.data
        : baselineMetaData.channels['AVG'].data;

    // Transition all curves
    const self = this;
    this.mainGroup.selectAll("*")
      .transition()
      .duration(toggleBaseline ? this.transitionDuration : 0)
      .attrTween("d", function(d) { 
        const path = d3.select(this); 
        const originalData = d;

        // Create bisector for frequency lookup
        const bisect = d3.bisector(d => d[0]).left;

        // Create new path generator
        const lineGenerator = d3.line()
          .x(d => self.xScale(d[0]))
          .y(d => {
            if (!baselineData) return self.yScale(d[1]);
            
            // Find closest frequency in baseline data
            const i = bisect(baselineData, d[0], 0);
            const a = baselineData[i - 1];
            const b = baselineData[i];
            
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

            return self.yScale(d[1] - baselineY);
          })
          .curve(d3.curveNatural);

        const oldPath = path.attr("d");
        const newPath = lineGenerator(originalData);

        return t => d3.interpolateString(oldPath, newPath)(t);
      });

      this.coreEvent.dispatchEvent('fr-baseline-updated', { baselineUUID: this.baselineUUID });
  };
  
  orderOverlayLayers() {
    this.svg.selectAll('.fr-graph-x-axis, .fr-graph-y-axis').lower(); // Grid lines
    this.svg.selectAll('.fr-graph-curve-container').raise(); // Graphs
    this.svg.selectAll('.x-grid-text, .y-grid-text').raise(); // Grid text
    this.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').raise(); // Labels
  };

  _setupScales() {
    this.xScale = d3.scaleLog()
      .domain([20, 20000])
      .range([this.graphGeometry.xStart, this.graphGeometry.xEnd]);
    this.yScale = d3.scaleLinear()
      .domain([-(this.yScaleValue / 2), (this.yScaleValue / 2)])
      .range([this.graphGeometry.yBottom, this.graphGeometry.yTop]);
  };

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

  _createMainGroup() {
    if(this.svg.select(".fr-graph-curve-container").empty())   {
      this.mainGroup = this.svg
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

  _drawPhoneCurve(obj) {
    const channels = [...obj.dispChannel];
    
    channels.forEach((channel) => {
      const lineGenerator = d3
        .line()
        .x((d) => this.xScale(d[0]))
        .y((d) => this.yScale(d[1]))
        .curve(d3.curveNatural);

      this.mainGroup
        .append("path")
        .datum(() => FRSmoother.getSmoothDataForPath(obj.channels[channel].data))
        .attr("class", `fr-graph-phone-curve`)
        .attr("uuid", obj.uuid)
        .attr("type", obj.type)
        .attr("brand", obj.brand)
        .attr("channel", channel)
        .attr("identifier", obj.identifier)
        .attr("stroke", `${obj.colors[channel]}`)
        .attr("stroke-width", 1.5)
        .attr("d", lineGenerator);
    });
  };

  _drawTargetCurve(obj) {
    const lineGenerator = d3
      .line()
      .x((d) => this.xScale(d[0]))
      .y((d) => this.yScale(d[1]))
      .curve(d3.curveNatural);

    this.mainGroup
      .append("path")
      .datum(obj.channels['AVG'].data)
      .attr("class", "fr-graph-target-curve")
      .attr("uuid", obj.uuid)
      .attr("type", obj.type)
      .attr("brand", obj.brand)
      .attr("identifier", obj.identifier)
      .attr("stroke", `${obj.colors['AVG']}`)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 2")
      .attr("d", lineGenerator);
  };

  _drawUnknownCurve(obj) {
    const channels = [...obj.dispChannel];
    
    channels.forEach((channel) => {
      const lineGenerator = d3
        .line()
        .x((d) => this.xScale(d[0]))
        .y((d) => this.yScale(d[1]))
        .curve(d3.curveNatural);

      this.mainGroup
        .append("path")
        .datum(() => FRSmoother.getSmoothDataForPath(obj.channels[channel].data))
        .attr("class", `fr-graph-${obj.type}-curve`)
        .attr("uuid", obj.uuid)
        .attr("type", obj.type)
        .attr("channel", channel)
        .attr("identifier", obj.identifier)
        .attr("stroke", `${obj.colors[channel]}`)
        .attr("stroke-width", obj.type === 'inserted-target' ? 1 : 1.5)
        .attr("stroke-dasharray", obj.type === 'inserted-target' ? "4 2" : null)
        .attr("d", lineGenerator);
    });
  };

  /**
   * Erase FR Curve
   * @param {string} uuid - UUID of frDataMap Object
   */
  eraseFRCurve(uuid) {
    this.mainGroup
     .selectAll(`*[uuid="${uuid}"]`)
     .remove();
  };

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
    const allGroups = enterGroups.merge(gridGroups);
    
    // Transition everything
    allGroups
      .transition()
      .duration(transition ? this.transitionDuration : 0)
      .style('opacity', 1)
      .attr('transform', d => `translate(${this.xScale(d)},0)`);

    this.orderOverlayLayers();
  };

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
    const allGroups = enterGroups.merge(gridGroups);
    
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

  channelUpdateRunner(uuid, type) {
    // Remove Current Paths
    this.mainGroup.selectAll(`.fr-graph-${type}-curve[uuid="${uuid}"]`).remove();
    // Draw Phone Curve
    if(type === 'phone') {
      this._drawPhoneCurve(this.dataProvider.getFRData(uuid));
    } else {
      this._drawUnknownCurve(this.dataProvider.getFRData(uuid));
    }
  };

  static getInstance() {
    if(!RenderEngine.instance) {
      RenderEngine.instance = new RenderEngine();
    }
    return RenderEngine.instance;
  };
};

export default RenderEngine.getInstance();

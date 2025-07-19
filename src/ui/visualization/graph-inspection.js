class GraphInspection {
  constructor(renderEngine) {
    this.renderEngine = renderEngine;
    this.isEnabled = false;
    this.verticalLine = null;
    this.inspectionGroup = null;
    this.valueDisplay = null;
    this.bisector = d3.bisector(d => d[0]).left;
    
    this._setupInspectionElements();
    this._bindEvents();
  }

  _setupInspectionElements() {
    // Create inspection group container
    this.inspectionGroup = this.renderEngine.svg
      .append("g")
      .attr("class", "fr-graph-inspection")
      .style("pointer-events", "none")
      .style("display", "none");

    // Create vertical line
    this.verticalLine = this.inspectionGroup
      .append("line")
      .attr("class", "inspection-line")
      .attr("y1", this.renderEngine.graphGeometry.yTop)
      .attr("y2", this.renderEngine.graphGeometry.yBottom)
      .attr("stroke", "var(--gt-color-on-surface)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2")
      .attr("opacity", 0.7);

    // Create value display container
    this.valueDisplay = this.inspectionGroup
      .append("g")
      .attr("class", "inspection-values");

    // Create frequency display
    this.frequencyText = this.inspectionGroup
      .append("text")
      .attr("class", "inspection-frequency")
      .attr("y", this.renderEngine.graphGeometry.yBottom - 15)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .attr("font-weight", "bold")
      .attr("fill", "var(--gt-color-on-surface)");
  }

  _bindEvents() {
    // Listen for inspection mode changes
    window.addEventListener('core:inspection-mode-change', (e) => {
      this.setEnabled(e.detail.enabled);
    });
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    
    if (enabled) {
      this._enableMouseTracking();
      this._hideLabels();
      this.inspectionGroup.style("display", "block");
    } else {
      this._disableMouseTracking();
      this._showLabels();
      this.inspectionGroup.style("display", "none");
    }
  }

  _enableMouseTracking() {
    // Create invisible overlay for mouse tracking
    this.mouseTracker = this.renderEngine.svg
      .append("rect")
      .attr("class", "mouse-tracker")
      .attr("x", this.renderEngine.graphGeometry.xStart)
      .attr("y", this.renderEngine.graphGeometry.yTop)
      .attr("width", this.renderEngine.graphGeometry.xEnd - this.renderEngine.graphGeometry.xStart)
      .attr("height", this.renderEngine.graphGeometry.yBottom - this.renderEngine.graphGeometry.yTop)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .style("cursor", "crosshair");

    // Bind mouse events
    this.mouseTracker
      .on("mousemove", (event) => this._onMouseMove(event))
      .on("mouseleave", () => this._onMouseLeave());
  }

  _disableMouseTracking() {
    if (this.mouseTracker) {
      this.mouseTracker.remove();
      this.mouseTracker = null;
    }
  }

  _onMouseMove(event) {
    const [mouseX] = d3.pointer(event);
    
    // Convert mouse X to frequency
    const frequency = this.renderEngine.xScale.invert(mouseX);
    
    // Update vertical line position
    this.verticalLine.attr("x1", mouseX).attr("x2", mouseX);
    
    // Update frequency display with dynamic positioning
    this._updateFrequencyDisplay(frequency, mouseX);

    // Update value displays for all visible curves
    this._updateValueDisplays(frequency, mouseX);
  }

  _onMouseLeave() {
    // Hide inspection elements when mouse leaves graph area
    this.inspectionGroup.style("opacity", 0.7);
  }

  _updateFrequencyDisplay(frequency, mouseX) {
    const frequencyString = frequency >= 1000 ? `${(frequency/1000).toFixed(1)}kHz` : `${Math.round(frequency)}Hz`;
    
    // Calculate approximate text width (rough estimate)
    const textWidth = frequencyString.length * 10; // Approximate width per character
    const halfTextWidth = textWidth / 2;
    
    // Determine positioning to keep text within graph bounds
    let textX = mouseX;
    let textAnchor = "middle";
    
    // Check if text would overflow on the right
    if (mouseX + halfTextWidth > this.renderEngine.graphGeometry.xEnd) {
      textX = mouseX - 10;
      textAnchor = "end";
    }
    // Check if text would overflow on the left
    else if (mouseX - halfTextWidth < this.renderEngine.graphGeometry.xStart) {
      textX = mouseX + 10;
      textAnchor = "start";
    }
    
    this.frequencyText
      .attr("x", textX)
      .attr("text-anchor", textAnchor)
      .text(frequencyString);
  }

  _updateValueDisplays(frequency, mouseX) {
    // Clear existing value displays
    this.valueDisplay.selectAll("*").remove();
    
    let yOffset = 0;
    const lineHeight = 18;
    
    // Calculate device list positioning
    const deviceListData = [];
    
    // First pass: collect all device data and calculate max width
    let maxTextWidth = 0;
    Array.from(this.renderEngine.dataProvider.frDataMap)
      .filter(([_, obj]) => !obj.hidden) // Only visible items
      .sort(([, a], [, b]) => a.type === 'target' ? -1 : 1) // Targets first
      .forEach(([uuid, obj]) => {
        const channels = obj.type === 'target' ? ['AVG'] : [...obj.dispChannel];
        
        channels.forEach((channel) => {
          const channelData = obj.channels[channel]?.data;
          if (!channelData) return;
          
          // Find SPL value at current frequency
          const splValue = this._interpolateSPL(channelData, frequency);
          if (splValue === null) return;
          
          // Apply baseline compensation if active
          const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);
          
          const displayName = obj.type !== 'target' 
            ? `${obj.identifier} (${channel})` 
            : obj.identifier;
          
          const displayText = `${displayName}: ${compensatedSPL.toFixed(1)}dB`;
          const textWidth = displayText.length * 9 + 50; // Approximate width
          maxTextWidth = Math.max(maxTextWidth, textWidth);
          
          deviceListData.push({
            displayText,
            textWidth,
            color: obj.colors[channel] || obj.colors?.AVG || '#666',
            yOffset: yOffset
          });
          
          yOffset += lineHeight;
        });
      });
    
    // Determine positioning strategy for the device list
    const listPadding = 15;
    const rightEdgeSpace = this.renderEngine.graphGeometry.xEnd - mouseX;
    const leftEdgeSpace = mouseX - this.renderEngine.graphGeometry.xStart;
    
    let listX, textAnchor;
    
    // If there's enough space on the right, position there
    if (rightEdgeSpace >= maxTextWidth + listPadding) {
      listX = mouseX + listPadding;
      textAnchor = "start";
    }
    // If there's enough space on the left, position there
    else if (leftEdgeSpace >= maxTextWidth + listPadding) {
      listX = mouseX - listPadding;
      textAnchor = "end";
    }
    // If neither side has enough space, choose the side with more space
    else {
      if (rightEdgeSpace > leftEdgeSpace) {
        listX = mouseX + 10;
        textAnchor = "start";
      } else {
        listX = mouseX - 10;
        textAnchor = "end";
      }
    }
    
    // Second pass: create the visual elements
    deviceListData.forEach((item) => {
      // Create value display element
      const valueGroup = this.valueDisplay
        .append("g")
        .attr("transform", `translate(${listX}, ${this.renderEngine.graphGeometry.yTop + 32 + item.yOffset})`);
      
      // Calculate background rectangle position based on text anchor
      let rectX, rectWidth;
      if (textAnchor === "start") {
        rectX = -5;
        rectWidth = item.textWidth;
      } else {
        rectX = -item.textWidth + 5;
        rectWidth = item.textWidth;
      }
      
      // Background rectangle
      valueGroup
        .append("rect")
        .attr("x", rectX)
        .attr("y", -16)
        .attr("width", rectWidth)
        .attr("height", 18)
        .attr("fill", "var(--gt-color-surface-container-lowest)")
        .attr("rx", 2)
        .attr("opacity", 0.7);
      
      // Text display
      valueGroup
        .append("text")
        .attr("x", textAnchor === "start" ? 0 : 0)
        .attr("y", -2)
        .attr("text-anchor", textAnchor)
        .attr("font-size", "16px")
        .attr("font-weight", "500")
        .attr("fill", item.color)
        .text(item.displayText);
    });
    
    this.inspectionGroup.style("opacity", 1);
  }

  _interpolateSPL(channelData, frequency) {
    if (!channelData || channelData.length === 0) return null;
    
    const i = this.bisector(channelData, frequency);
    const a = channelData[i - 1];
    const b = channelData[i];
    
    if (a && b) {
      // Linear interpolation between two points
      const t = (frequency - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    } else if (a) {
      return a[1];
    } else if (b) {
      return b[1];
    }
    
    return null;
  }

  _applyBaselineCompensation(splValue, frequency) {
    const baselineData = this.renderEngine.getBaselineData();
    
    if (!baselineData.channelData || baselineData.channelData.length === 0) {
      return splValue;
    }
    
    const baselineSPL = this._interpolateSPL(baselineData.channelData, frequency);
    if (baselineSPL === null) return splValue;
    
    return splValue - baselineSPL;
  }

  _hideLabels() {
    // Hide existing labels
    this.renderEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg')
      .style("display", "none");
  }

  _showLabels() {
    // Show labels again
    this.renderEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg')
      .style("display", "block");
  }

  // Public method to be called by render engine after labels are updated
  onLabelsUpdated() {
    if (this.isEnabled) {
      this._hideLabels();
    }
  }

  destroy() {
    this._disableMouseTracking();
    if (this.inspectionGroup) {
      this.inspectionGroup.remove();
    }
  }
}

export default GraphInspection;

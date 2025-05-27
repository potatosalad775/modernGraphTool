class GraphHandle {
  constructor(svg, renderEngine) {
    this.svg = svg;
    this.renderEngine = renderEngine;
    this.yShift = 0;
    this.maxShift = 20;
    this.isMobile = document.documentElement.hasAttribute('data-mobile') || window.innerWidth < 1000;
    this.handleRadius = this.isMobile ? 20 : 10;

    this._initHandle();
    this._setupDragBehavior();
    this._attachEventListeners();
  }

  _initHandle() {
    // Create handle group
    this.handleGroup = this.svg.append('g')
      .attr('class', 'y-scaler-handle')
      .attr('transform', `translate(${this.renderEngine.graphGeometry.xEnd},0)`);

    // Add handle circle
    this.handle = this.handleGroup.append('circle')
      .attr('r', this.handleRadius)
      .attr('stroke', 'var(--gt-color-primary)')
      .attr('stroke-width', 2)
      .attr('fill', 'var(--gt-color-surface-container-highest)')
      .attr('opacity', '0.4')
      .attr('cursor', 'pointer')
      .attr('cy', (this.renderEngine.graphGeometry.yTop + this.renderEngine.graphGeometry.yBottom) / 2);

    // Calculate constraints for handle movement
    this.minY = this.renderEngine.graphGeometry.yTop + this.handleRadius;
    this.maxY = this.renderEngine.graphGeometry.yBottom - this.handleRadius;
    this.centerY = (this.minY + this.maxY) / 2;
  }

  _setupDragBehavior() {
    const drag = d3.drag()
      .on('start', () => {
        this.handle.attr('opacity', '1');
      })
      .on('drag', (event) => {
        // Constrain vertical movement
        const newY = Math.max(this.minY, Math.min(this.maxY, event.y));
        this.handle.attr('cy', newY);

        // Calculate shift based on handle position
        const normalizedPosition = (newY - this.centerY) / (this.maxY - this.centerY);
        this.yShift = this.maxShift * normalizedPosition;

        // Update graph without transitions for smooth movement
        this._updateGraphPosition();
      })
      .on('end', () => {
        this.handle.attr('opacity', '0.4');
      });

    // Initialize drag behavior
    this.handle.call(drag);
  }

  _updateGraphPosition() {
    // Update y-axis scale with shift
    this.renderEngine.yScale = d3.scaleLinear()
      .domain([-(this.renderEngine.yScaleValue / 2) + this.yShift,
               (this.renderEngine.yScaleValue / 2) + this.yShift])
      .range([this.renderEngine.graphGeometry.yBottom, this.renderEngine.graphGeometry.yTop]);

    // Update axis without animation
    this.renderEngine.updateYAxis(null, false);

    // Update curves without animation
    this.renderEngine.curveGroup.selectAll(".fr-graph-phone-curve, .fr-graph-target-curve")
      .attr("d", d => {
        const lineGenerator = d3.line()
          .x(d => this.renderEngine.xScale(d[0]))
          .y(d => this.renderEngine.yScale(d[1]))
          .curve(d3.curveNatural);
        return lineGenerator(d);
      });
  }

  resetHandle() {
    this.handle
      .transition()
      .duration(0)
      .attr('cy', this.centerY);
    this.yShift = 0;
    this._updateGraphPosition();
  }

  _attachEventListeners() {
    // Add double-click and double touch to reset
    this.handle.on('dblclick touchstart', (event) => {
      // Prevent double touch from triggering zoom
      if (event.type === 'touchstart') {
        let lastTouch = this.handle.property('lastTouch') || 0;
        const currentTime = new Date().getTime();

        // Reset lastTouch if it's a double touch within 300ms
        if (currentTime - lastTouch <= 300) {
          event.preventDefault();
          this.resetHandle();
          this.handle.property('lastTouch', 0);
        } else {
          this.handle.property('lastTouch', currentTime);
        }
      } else {
        this.resetHandle();
      }
    });

    // Add event listener for ui mode change
    window.addEventListener('core:ui-mode-change', (e) => {
      this.isMobile = e.detail.isMobile;
      this.handleRadius = this.isMobile ? 20 : 10;
      this.handle.attr('r', this.handleRadius);
      // Recalculate constraints as radius changes
      this.minY = this.renderEngine.graphGeometry.yTop + this.handleRadius;
      this.maxY = this.renderEngine.graphGeometry.yBottom - this.handleRadius;
      this.centerY = (this.minY + this.maxY) / 2;
      // If the handle is currently at the center, keep it there, otherwise, it might jump
      // if not actively being dragged. This check might need refinement based on desired behavior.
      if (this.yShift === 0) {
        this.handle.attr('cy', this.centerY);
      }
    });
  }
}

export default GraphHandle;
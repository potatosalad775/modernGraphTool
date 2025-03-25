const GraphHandle = (svg, renderEngine) => {
  // Initialize shift state
  var yShift = 0;
  const maxShift = 20;
  const handleRadius = 10;

  // Create handle group
  const handleGroup = svg.append('g')
    .attr('class', 'y-scaler-handle')
    .attr('transform', `translate(${renderEngine.graphGeometry.xEnd},0)`);

  // Add track line
  /*
  handleGroup.append('line')
    .attr('y1', renderEngine.graphGeometry.yTop)
    .attr('y2', renderEngine.graphGeometry.yBottom)
    .attr('stroke', 'var(--gt-color-outline)')
    .attr('stroke-width', 1);
  */

  // Add handle circle
  const handle = handleGroup.append('circle')
    .attr('r', handleRadius)
    .attr('stroke', 'var(--gt-color-primary)')
    .attr('stroke-width', 2)
    .attr('fill', 'var(--gt-color-surface-container-highest)')
    .attr('opacity', '0.4')
    .attr('cursor', 'pointer')
    .attr('cy', (renderEngine.graphGeometry.yTop + renderEngine.graphGeometry.yBottom) / 2);

  // Calculate constraints for handle movement
  const minY = renderEngine.graphGeometry.yTop + handleRadius;
  const maxY = renderEngine.graphGeometry.yBottom - handleRadius;
  const centerY = (minY + maxY) / 2;

  // Setup drag behavior
  const drag = d3.drag()
    .on('start', () => {
      handle.attr('opacity', '1');
    })
    .on('drag', (event) => {
      // Constrain vertical movement
      const newY = Math.max(minY, Math.min(maxY, event.y));
      handle.attr('cy', newY);

      // Calculate shift based on handle position
      const normalizedPosition = (newY - centerY) / (maxY - centerY);
      yShift = maxShift * normalizedPosition;

      // Update graph without transitions for smooth movement
      updateGraphPosition();
    })
    .on('end', () => {
      handle.attr('opacity', '0.4');
    });

  // Function to update graph position
  const updateGraphPosition = () => {
    // Update y-axis scale with shift
    renderEngine.yScale = d3.scaleLinear()
      .domain([-(renderEngine.yScaleValue / 2) + yShift, 
               (renderEngine.yScaleValue / 2) + yShift])
      .range([renderEngine.graphGeometry.yBottom, renderEngine.graphGeometry.yTop]);

    // Update axis without animation
    renderEngine.updateYAxis(null, false);

    // Update curves without animation
    renderEngine.mainGroup.selectAll(".fr-graph-phone-curve, .fr-graph-target-curve")
      .attr("d", d => {
        const lineGenerator = d3.line()
          .x(d => renderEngine.xScale(d[0]))
          .y(d => renderEngine.yScale(d[1]))
          .curve(d3.curveNatural);
        return lineGenerator(d);
      });
  };

  // Reset handle position
  const resetHandle = () => {
    handle
      .transition()
      .duration(0)
      .attr('cy', centerY);
    yShift = 0;
    updateGraphPosition();
  };

  // Add double-click to reset
  handle.on('dblclick', resetHandle);

  // Initialize drag behavior
  handle.call(drag);

  // Return reset function for external use
  return resetHandle;
};

export default GraphHandle;
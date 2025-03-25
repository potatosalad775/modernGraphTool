const GraphWatermark = (svg) => {
  const watermarkPositionData = {
    BOTTOM_LEFT: { x: 50, y: 400, anchor: "start", },
    BOTTOM_RIGHT: { x: 754, y: 400, anchor: "end" },
    TOP_LEFT: { x: 50, y: 70, anchor: "start" },
    TOP_RIGHT: { x: 754, y: 70, anchor: "end" },
    CENTER: {x: 400, y: 275, anchor: "middle"},
  };

  // Display Rig Description
  const rigDescription = window.GRAPHTOOL_CONFIG.VISUALIZATION.RIG_DESCRIPTION;
  if (rigDescription) {
    const rigDescriptionText = svg.append('text')
    .attr('class', 'rig-description')
    .attr('x', watermarkPositionData['TOP_RIGHT'].x)
    .attr('y', watermarkPositionData['TOP_RIGHT'].y - 8)
    .attr('font-size', '15px')
    .attr('font-weight', '500')
    .attr('text-anchor', watermarkPositionData['TOP_RIGHT'].anchor)
    .attr('fill', '#000')
    .attr('opacity', '0.3')
    .attr('filter', 'var(--watermark-text-filter)')
    .text(rigDescription);
  }

  // Draw Custom Watermark
  const watermarkData = window.GRAPHTOOL_CONFIG.WATERMARK || [];

  const watermarkGroup = svg.append('g')
    .attr('class', 'watermark-group')
    .attr('transform', 'translate(0, 0)');

  watermarkData.forEach((watermarkObj) => {
    const position = {
      x: watermarkPositionData[watermarkObj.LOCATION || 'MIDDLE'].x
        + (watermarkObj.POSITION ? watermarkObj.POSITION.RIGHT - watermarkObj.POSITION.LEFT : 0),
      y: watermarkPositionData[watermarkObj.LOCATION || 'MIDDLE'].y
        + (watermarkObj.POSITION ? watermarkObj.POSITION.DOWN - watermarkObj.POSITION.UP : 0),
      anchor: watermarkPositionData[watermarkObj.LOCATION || 'MIDDLE'].anchor,
    }

    if (watermarkObj.TYPE === 'IMAGE') {
      const watermarkImage = watermarkGroup.append('image')
        .attr('class', 'watermark-image')
        .attr('x', position.x)
        .attr('y', position.y)
        .attr('width', watermarkObj.SIZE || '100px')
        .attr('opacity', watermarkObj.OPACITY || '0.3')
        .attr('href', Array.isArray(watermarkObj.CONTENT) 
          ? watermarkObj.CONTENT[Math.floor(Math.random() * watermarkObj.CONTENT.length)] 
          : watermarkObj.CONTENT || '')
    } else if (watermarkObj.TYPE === 'TEXT') {
      const watermarkText = watermarkGroup.append('text')
        .attr('class', 'watermark-text')
        .attr('x', position.x)
        .attr('y', position.y)
        .attr('font-size', watermarkObj.SIZE || '20px')
        .attr('font-weight', watermarkObj.FONT_WEIGHT || '500')
        .attr('font-family', watermarkObj.FONT_FAMILY || '')
        .attr('text-anchor', position.anchor)
        .attr('fill', watermarkObj.COLOR || '#000')
        .attr('opacity', watermarkObj.OPACITY || '0.3')
        .attr('filter', 'var(--watermark-text-filter)')
        .text(Array.isArray(watermarkObj.CONTENT) 
          ? watermarkObj.CONTENT[Math.floor(Math.random() * watermarkObj.CONTENT.length)] 
          : watermarkObj.CONTENT || ''
        );
    }
  })
};

export default GraphWatermark;
export const graphStyles = `
#graph-container {
  position: relative;
  height: fit-content;
}

#fr-graph {
  min-height: fit-content;
  max-width: 100%;
  aspect-ratio: 16/9;
}

.fr-graph-label {
  display: flex;
  flex-direction: column;
}

:root {
  --watermark-text-filter: none;
}
:root[data-theme="dark"] {
  --watermark-text-filter: invert(1.0);
}
`;
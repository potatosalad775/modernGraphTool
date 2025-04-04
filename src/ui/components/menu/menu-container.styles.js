export const menuContainerStyles = `
.menu-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--gt-color-surface);
}

.menu-slider {
  flex: 1;
  position: relative;
  overflow-x: hidden;
}

.menu-panels {
    position: relative;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
}

.menu-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0.9rem 0.5rem 0 0.5rem;
    opacity: 0;
    transform: translateX(30%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    box-sizing: border-box;
    scrollbar-gutter: stable both-edges;
}

.menu-panel.active {
    opacity: 1;
    transform: translateX(0);
    pointer-events: all;
    transition-delay: 0.1s;
}

.menu-panel:not(.active) {
    transform: translateX(-30%);
    transition-delay: 0s;
}

.menu-panel-row {
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;

    h3 {
        margin: 0;
        color: var(--gt-color-on-surface);
    }
}
`;

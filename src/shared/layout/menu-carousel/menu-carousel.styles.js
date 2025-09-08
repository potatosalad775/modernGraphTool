export const menuCarouselStyles = `
  .menu-carousel-group {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gt-color-surface-container);
    height: 4.5rem;
    overflow: hidden;
    touch-action: pan-x;
  }

  .menu-carousel {
    position: absolute;
    display: flex;
    gap: 0.75rem;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
    padding: 0 calc(50% - 3rem); /* Half of container minus half of item width */
  }

  .menu-bar-item {
    min-width: 6rem;
    height: 2.5rem;
    margin: 1rem 0;
    background: none;
    border: none;
    border-radius: 1.5rem;
    cursor: pointer;
    color: var(--gt-color-on-surface);
    font: var(--gt-typescale-title-small);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: center;
    opacity: 0.5;
    scale: 0.8;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .menu-bar-item.active {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    opacity: 1;
    scale: 1;
  }

  .menu-bar-item.nearby {
    opacity: 0.8;
    scale: 0.9;
  }

  @media (hover: hover) and (pointer: fine) {
    .menu-bar-item:hover {
      filter: var(--gt-hover-filter);
    }
  }
`;
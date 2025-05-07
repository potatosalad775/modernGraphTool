export const topNavBarStyles = `
  .top-nav-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    height: 2rem;
    padding: 0.5rem 1rem;
    background: var(--gt-color-surface-container);
    border-bottom: 1px solid var(--gt-color-outline-variant);
  }

  .top-nav-bar-leading {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .top-nav-bar-leading-title {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--gt-color-on-surface);
  }

  .top-nav-bar-leading h2 {
    margin: 0;
    font: var(--gt-typescale-title-medium);
  }

  .top-nav-bar-leading img {
    height: 2rem;
  }

  .top-nav-bar-trailing {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .top-nav-bar-trailing a {
    text-decoration: none;
    color: var(--gt-color-on-surface-variant);
    font: var(--gt-typescale-body-large);
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
  }

  /* Mobile styles */
  .mobile-menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 2rem;
    width: 2rem;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 0.5rem;
  }

  .mobile-menu-button svg {
    color: var(--gt-color-on-surface-variant);
  }

  .mobile-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    pointer-events: none;
  }

  .mobile-sidebar.visible {
    pointer-events: auto;
  }

  .mobile-sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .mobile-sidebar.visible .mobile-sidebar-overlay {
    opacity: 1;
  }

  .mobile-sidebar-content {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 70vw;
    max-width: 20rem;
    height: 100%;
    background: var(--gt-color-surface);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    box-sizing: border-box;
    border-radius: 1rem 0 0 1rem;
  }

  .mobile-sidebar.visible .mobile-sidebar-content {
    transform: translateX(0);
  }

  .mobile-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1.5rem;
    margin-bottom: 0.75rem;

    h2 {
      margin: 0;
    }
  }

  .mobile-sidebar-content a {
    text-decoration: none;
    color: var(--gt-color-on-surface-variant);
    font: var(--gt-typescale-body-large);
    padding: 0.5rem;
    margin: 0.25rem 1rem;
    border-radius: 0.5rem;
  }

  .mobile-sidebar-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
  }

  @media (hover: hover) and (pointer: fine) {
    .top-nav-bar-trailing a:hover {
      color: var(--gt-color-primary);
      background: var(--gt-color-surface-container);
      filter: var(--gt-hover-filter);
    }

    .mobile-menu-button svg:hover {
      color: var(--gt-color-on-surface);
    }
      
    .mobile-sidebar-content a:hover {
      background: var(--gt-color-surface-variant);
      color: var(--gt-color-on-surface);
    }
  }
`;
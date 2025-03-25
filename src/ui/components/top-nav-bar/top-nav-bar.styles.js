export const topNavBarStyles = `
  .top-nav-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    height: 2rem;
    padding: 0.5rem 1rem;
    background: var(--gt-color-surface);
    border-bottom: 1px solid var(--gt-color-outline-variant);
  }

  .top-nav-bar-leading {
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
    gap: 1rem;
    align-items: center;
  }

  .top-nav-bar-trailing a {
    text-decoration: none;
    color: var(--gt-color-on-surface-variant);
    font: var(--gt-typescale-body-large);
  }

  .top-nav-bar-trailing a:hover {
    color: var(--gt-color-on-surface);
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
  }

  .mobile-menu-button svg {
    color: var(--gt-color-on-surface-variant);
  }

  .mobile-menu-button svg:hover {
    color: var(--gt-color-on-surface);
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
    width: 80vw;
    max-width: 20rem;
    background: var(--gt-color-surface);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }

  .mobile-sidebar.visible .mobile-sidebar-content {
    transform: translateX(0);
  }

  .mobile-sidebar-content h2 {
    margin: 0.5rem;
  }

  .mobile-sidebar-content a {
    text-decoration: none;
    color: var(--gt-color-on-surface-variant);
    font: var(--gt-typescale-body-large);
    padding: 0.5rem;
    border-radius: 0.5rem;
  }

  .mobile-sidebar-content a:hover {
    background: var(--gt-color-surface-variant);
    color: var(--gt-color-on-surface);
  }
`;
export const tutorialModalStyles = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 400; 
    pointer-events: none; 
  }

  .overlay-part {
    position: fixed;
    background-color: rgba(0, 0, 0, 0.6); 
    z-index: 401; 
    pointer-events: auto; 
    display: none; 
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .overlay-top { height: 0; }
  .overlay-bottom { top: auto; bottom: 0; height: 0; }
  .overlay-left { width: 0; height: 0; }
  .overlay-right { left: auto; right: 0; width: 0; height: 0; }

  .tooltip-modal {
    position: fixed; /* Position relative to viewport */
    display: none; /* Hidden by default */
    flex-direction: column;
    background-color: var(--gt-color-surface-container-highest);
    color: var(--gt-color-on-surface);
    padding: 1rem;
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 402;
    pointer-events: auto; /* Capture clicks on modal */
    max-width: 300px;
    border: 1px solid var(--gt-color-outline-variant);
  }

  .tooltip {
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }

  .navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid var(--gt-color-outline-variant);
    padding-top: 0.75rem;
    margin-top: 0.5rem;
  }

  .navigation button {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 1rem;
    cursor: pointer;
    background-color: var(--gt-color-secondary);
    color: var(--gt-color-on-secondary);
    font: var(--gt-typescale-body-small);
    transition: background-color 0.2s ease;
  }

  .navigation button:hover:not(:disabled) {
    filter: brightness(0.95);
  }

  .navigation button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .navigation .skip-btn {
    background-color: transparent;
    color: var(--gt-color-on-surface-variant);
    margin-left: auto; /* Push skip button to the right */
  }
   .navigation .skip-btn:hover {
     background-color: var(--gt-color-surface-variant, #eee);
   }

  .step-indicator {
    font: var(--gt-typescale-body-small);
    color: var(--gt-color-on-surface-variant);
  }

  /* PWA Modal Styles */
  .page-modal {
    position: fixed;
    inset: 0;
    display: none; 
    justify-content: center;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.6); 
    z-index: 404; 
    pointer-events: auto;
  }

  .page-modal-container {
    background-color: var(--gt-color-surface-container-highest);
    color: var(--gt-color-on-surface);
    padding: 1.5rem;
    border-radius: 1rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    max-width: 90vw;
    width: 400px;
    text-align: center;
    border: 1px solid var(--gt-color-outline);
  }

  .page-modal-container h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--gt-color-primary);
    font: var(--gt-typescale-title-medium);
  }

  .page-modal-container p {
    margin-bottom: 1.5rem;
    line-height: 1.5;
    white-space: pre-wrap; /* Respect line breaks in instructions */
  }

  .page-modal-close-btn {
    padding: 0.6rem 1.5rem;
    border: none;
    border-radius: 1.5rem;
    cursor: pointer;
    background-color: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    transition: background-color 0.2s ease;
  }

  .page-modal-close-btn:hover {
     filter: brightness(0.9);
  }
`;
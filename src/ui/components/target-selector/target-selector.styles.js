export const targetSelectorStyles = `
  .target-selector-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: fit-content;
  }

  .target-selector-group {
    display: inline-flex;
    flex-direction: column;
    width: 100%;
    min-height: 0.5rem;
    overflow: hidden;
    border-radius: 0.3rem 0.3rem 0.3rem 0;
    background: var(--gt-color-surface-container);
    max-height: 1000px;
    opacity: 1;
    visibility: visible;
    transform-origin: top;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .target-selector-group.collapsed {
    max-height: 0.5rem;
    filter: var(--gt-hover-filter);
  }
  
  .target-selector-group.collapsed .target-group-item {
    opacity: 0;
  }

  .target-group-item {
    display: flex;
    flex-direction: row;
    padding: 0.2rem 0;
    overflow-x: scroll;
    overflow-y: hidden;
    width: 100%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .target-group-item:first-child{
    margin-top: 0.1rem;
  }
  .tsc-single-row {
    display: block;
    width: 100%;
    overflow-x: scroll;

    .target-selector-group {
      width: auto;
      flex-direction: row;
      padding-right: 1rem;
    }
    .target-group-item {
      width: auto;
      overflow: hidden;
    }
    .target-list-container {
      padding-right: 0;
    }
  }

  .target-group-name span {
    color: var(--gt-color-primary);
    font-weight: 600;
    min-width: min-content;
    margin: 0;
  }

  .target-list-container {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0 1rem;
    position: relative;
    white-space: nowrap;
  }

  .target-list {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
  }

  .target-list-item {
    overflow: hidden;
  }

  .tsc-collapse-button-group {
    display: flex;
    flex-direction: row;
    gap: 1rem;
    width: 100%;
    overflow: hidden;
  }
  
  .tsc-collapse-button {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.2rem 1rem 0.2rem 0.6rem;
    height: 2.5rem;
    width: fit-content;
    border-radius: 0 0 0.3rem 0.3rem;
    background: var(--gt-color-surface-container-high);
    border: 1px solid var(--gt-color-surface-container-highest);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.3s ease;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--gt-color-on-surface);
  }
  
  .tsc-collapse-button span {
    width: max-content;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .tsc-collapse-button svg {
    fill: var(--gt-color-on-surface);
    transition: transform 0.3s ease;
  }
  
  .tsc-collapse-button.collapsed svg {
    transform: rotate(180deg);
  }

  @media (hover: hover) and (pointer: fine) {
    .tsc-collapse-button:hover {
      background: var(--gt-color-surface-container-highest);
      filter: var(--gt-hover-filter)
    }
  }

  .tsc-single-row::-webkit-scrollbar, .target-group-item::-webkit-scrollbar, .target-selector-container::-webkit-scrollbar {
    height: 0.4rem;
  }
  .tsc-single-row::-webkit-scrollbar-track, .target-group-item::-webkit-scrollbar-track, .target-selector-container::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.1);
  }
  .tsc-single-row::-webkit-scrollbar-thumb, .target-group-item::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.3);
    border-radius: 1rem;
  }
`;
export const targetSelectorStyles = `
  .target-selector-container {
    display: block;
    width: 100%;
    height: fit-content;
  }

  .target-selector-group {
    display: inline-flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
    border-radius: 0.3rem;
    background: var(--gt-color-surface-container-highest);
  }

  .target-group-item {
    display: flex;
    flex-direction: row;
    padding: 0.2rem 0;
    overflow-x: scroll;
    width: 100%;
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

  .target-group-name {
    color: var(--gt-color-primary);
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

  .tsc-single-row::-webkit-scrollbar, .target-group-item::-webkit-scrollbar, .target-selector-container::-webkit-scrollbar {
    height: 0.2rem;
  }
  .tsc-single-row::-webkit-scrollbar-track, .target-group-item::-webkit-scrollbar-track, .target-selector-container::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.1);
  }
  .tsc-single-row::-webkit-scrollbar-thumb, .target-group-item::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.3);
    border-radius: 1rem;
  }
`;
export const selectionListStyles = `
  .selection-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    margin-bottom: 1rem;
    border-radius: 0.5rem;
    background: var(--gt-color-surface-container-highest);
    container-type: inline-size;
    container-name: selection-list;
  }

  .selection-list-item {
    display: flex;
    flex-direction: column;
    border-radius: 0.4rem;
    color: var(--gt-color-on-surface);
    background: var(--gt-color-surface);
  }
  .selection-list-item:has(.sl-variant-btn.active) {
    background: none;
  }

  .sl-item-content {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.8rem 0.7rem 0.8rem 0.9rem;
  }
  .sl-item-content:has(.sl-variant-btn.active) {
    background: var(--gt-color-surface);
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.4rem;
  }

  .sl-item-heading {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    overflow-x: hidden;
    position: relative;

    &::after {
      content: '';
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: 2rem;
      background: linear-gradient(to right, transparent, var(--gt-color-surface));
      pointer-events: none;
    }

    span {
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }
  }

  .sl-item-leading {
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    align-items: center;
    gap: 0.7rem;
  }

  .sl-color-btn {
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--gt-color-on-surface);
    border-radius: 1rem;
    margin-right: 0.5rem;
    cursor: pointer;
  }

  .sl-name {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    overflow-x: hidden;
  }

  .sl-variant-btn {
    display: flex;
    align-items: center;
    cursor: pointer;
    border-radius: 2rem;
    margin: 0 0.2rem;
    background: none;
    border: 2px solid var(--gt-color-on-surface-variant);
    color: var(--gt-color-on-surface-variant);

    svg {
      width: 1rem;
      height: 1rem;
    }
  }

  .sl-y-offset {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.2rem;
    padding-left: 0.2rem;

    svg {
      width: 1rem;
      height: 1rem;
    }

    input {
      width: 1.6rem;
      height: 1.6rem;
      padding: 0 0.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--gt-color-outline);
      outline: none;
      color: var(--gt-color-on-surface);
      background-color: var(--gt-color-surface-container-lowest);
    }
  }

  .sl-y-offset-dec, .sl-y-offset-inc {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 1.5rem;
    border: none;
    cursor: pointer;
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);

    svg {
      width: 1rem;
      height: 1rem;
    }
  }

  .sl-channels-select {
    width: 5rem;
    height: 1.7rem;
    margin-right: 0.1rem;
    border-radius: 0.5rem;
    color: var(--gt-color-on-surface);
    background-color: var(--gt-color-surface-container-lowest);
  }

  .sl-button-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .sl-button {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    width: 2rem;
    height: 2rem;
    background: none;
    border: none;
    border-radius: 2rem;
    color: var(--gt-color-on-surface-variant);
    svg {
      width: 1.25rem;
      height: 1.25rem;
    }
  }

  .sl-variant-menu {
    display: flex;
    flex-direction: column;
    border-radius: 0 0 0.5rem 0.5rem;
    padding: 0 0.5rem;
    background: var(--gt-color-surface-container-highest);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    max-height: 0;
    visibility: hidden;
    opacity: 0;
  }

  .sl-variant-menu.active {
    padding-bottom: 0.5rem;
    max-height: 1000px;
    visibility: visible;
    opacity: 1;
    transform-origin: top;
  }

  .sl-variant-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    justify-content: space-between;
    padding: 0.5rem 0.8rem;
    background: var(--gt-color-surface-container);
    border: 1px solid var(--gt-color-outline); 
    border-top: none;
  }
  .sl-variant-item:last-child {
    border-radius: 0 0 0.5rem 0.5rem;
  }
  .sl-variant-item-name {
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .sl-y-offset-dec:hover, .sl-y-offset-inc:hover {
      background: var(--gt-color-primary);
      filter: var(--gt-hover-filter);
    }
    .sl-button:hover {
      background: var(--gt-shadow);
    }
    .sl-variant-item:hover {
      background: var(--gt-shadow);
    }
    .sl-variant-item:has(.sl-button:hover) {
      background: none;
    }
    .sl-button.add-variant:hover {
      background: var(--gt-color-primary);
      color: var(--gt-color-on-primary);
    }
  }

  .sl-y-offset-dec:active, .sl-y-offset-inc:active {
    filter: var(--gt-hover-filter);
    transition: filter 0s;
  }
  .sl-button:active {
    background: var(--gt-shadow);
    transition: background 0s;
  }
  .sl-variant-item:active {
    background: var(--gt-shadow);
    transition: background 0s;
  }
  .sl-variant-item:has(.sl-button:active) {
    background: none;
    transition: background 0s;
  }
  .sl-button.add-variant:active {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    transition: background 0s, color 0s;
  }

  @container selection-list (max-width: 700px) {
    .sl-item-content {
      flex-direction: column;
      gap: 0.7rem;
    }
    .sl-item-heading, .sl-item-leading {
      width: 100%;
    }
    .sl-item-leading {
      justify-content: flex-end;
    }
  }

  @container selection-list (min-width: 700px) {
    .sl-item-content {
      flex-direction: row;
    }
  }

  select {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border: 1px solid var(--gt-color-outline);
    padding-left: 0.6rem;
    background-repeat: no-repeat;
    background-position: right center;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"></path></svg>');
    outline: none;
    cursor: pointer;
  }
  
  /* Chrome, Safari, Edge, Opera */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  input[type=number] {
    -moz-appearance: textfield;
  }
`;
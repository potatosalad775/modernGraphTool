export const phoneSelectorStyles = `
.phone-selector-container {
  display: flex;
  flex-direction: column;
  min-width: 20rem;
  height: inherit;
  background: var(--gt-color-surface);
  box-sizing: border-box;
  container: ps-container / inline-size;
}

.ps-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 2.75rem;
  gap: 1rem;
  padding: 0 1rem 1rem 1rem;
}

.ps-header-search {
  flex: 1;
  width: 100%;
  height: 2.7rem;
  padding: 0 1.25rem;
  border: none;
  border-radius: 4rem;
  background: var(--gt-color-surface-container-highest);
  color: var(--gt-color-on-surface);
}
.ps-header-search::placeholder {
  color: var(--gt-color-on-surface-variant);
}
.ps-header-search:focus, .ps-header-search:focus-visible {
  outline: 2px solid var(--gt-color-secondary);
}

.ps-lists {
  display: flex;
  flex: 1;
  flex-direction: row;
  overflow: hidden;
  position: relative;
}

.ps-brand-list {
  flex: 1;
  display: block;
  overflow-y: auto;
  margin-right: 0.5rem;
  padding: 0 0.5rem;
  box-sizing: border-box;
  min-width: 7rem;
  scrollbar-gutter: stable both-edges;
}

.ps-brand-item {
  display: flex;
  align-items: center;
  padding: 0 1rem;
  margin: 0.75rem 0;
  height: 2.5rem;
  border-radius: 2.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 0.75rem;
  background: var(--gt-color-surface);
  border: 1px solid var(--gt-color-outline);
  color: var(--gt-color-primary);

  input {
    display: none;
  }

  span {
    width: 100%;
    height: 2.25rem;
    align-content: center;
    font: var(--gt-typescale-title-small);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
}
.ps-brand-item:first-child {
  margin-top: 0;
}
.ps-brand-item:has(input:checked) {
  background: var(--gt-color-secondary);
  color: var(--gt-color-on-secondary);
}

.ps-phone-list {
  flex: 2;
  display: block;
  transition: all 0.2s ease;
  padding: 0 0.5rem 0 0;
  overflow-y: scroll;
  scrollbar-gutter: stable both-edges;
}

.ps-phone-item {
  border-radius: 0.75rem;
  min-height: fit-content;
  margin: 0.75rem 0;
  transition: all 0.2s ease-out;
  background: var(--gt-color-surface-container);
  color: var(--gt-color-on-surface);
  border: 1px solid var(--gt-color-surface-container-highest);
  overflow: hidden;

  label {
    flex: 1;
    display: flex;
    justify-content: center;
    flex-direction: column;
    position: relative;
    padding: 0.7rem 1rem;
    gap: 0.3rem;
    cursor: pointer;
  }

  input {
    display: none;
  }
}
.ps-phone-item:has(input:checked) {
  background: var(--gt-color-primary);
  color: var(--gt-color-on-primary);

  .ps-phone-review-score {
    background: var(--gt-color-primary-container);
    color: var(--gt-color-on-primary-container);
  }
  .ps-link-group a {
    color: var(--gt-color-primary-container);
  }
}
.ps-phone-item:first-child {
  margin-top: 0;
}
.ps-phone-item:has(input:disabled) {
  cursor: not-allowed;
}
.ps-phone-item[aria-busy="true"]::after {
  border-radius: inherit;
}

.ps-phone-name {
  width: 100%;
  font: var(--gt-typescale-title-small);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.ps-phone-review-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  height: 1rem;
  background: var(--gt-color-primary);
  color: var(--gt-color-on-primary);
  padding: 0.5rem;
  border-radius: 0.7rem;
  font-weight: 500;

  svg {
    width: 1rem;
    height: 1rem;
  }
}

.ps-link-group {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-top: 0.1rem;

  a {
    display: flex;
    flex-direction: row;
    gap: 0.2rem;
    align-items: stretch;
    color: var(--gt-color-primary);
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
}

.ps-brand-item:active {
  filter: var(--gt-hover-filter);
  transition: filter 0s;
}

.ps-phone-item:active {
  -webkit-box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
  -moz-box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
  box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
  transition: box-shadow 0s;
}

.ps-link-group a:active {
  color: var(--gt-color-teritary-container);
  transition: color 0s;
}

.ps-link-group a:active {
  color: var(--gt-color-teritary);
  transition: color 0s;
}

.ps-clear-brands-btn {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  height: 2.1rem;
  transform: translateX(-50%);
  padding: 0.5rem 1rem 0.5rem 0.75rem;
  border-radius: 2rem;
  background: var(--gt-color-tertiary);
  color: var(--gt-color-on-tertiary);
  box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.3);
  border: none;
  cursor: pointer;
  font-weight: 500;
  z-index: 10;
  transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
  opacity: 0;
  pointer-events: none; /* Hidden by default */
}

.ps-clear-brands-btn.visible {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: hover) and (pointer: fine) {
  .ps-brand-item:hover {
    filter: var(--gt-hover-filter);
  }

  .ps-phone-item:hover {
    -webkit-box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
    -moz-box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
    box-shadow: inset 0 0 0.4rem var(--gt-color-primary);
  }

  .ps-link-group a:hover {
    color: var(--gt-color-teritary-container);
  }

  .ps-link-group a:hover {
    color: var(--gt-color-teritary);
  }

  .ps-clear-brands-btn:hover {
    background: var(--gt-color-tertiary);
    filter: var(--gt-hover-filter);
  }
}

/* responsive layout */
.ps-header-nav-brand, .ps-header-nav-phone {
  display: none;
  min-width: fit-content;
}

@container ps-container (max-width: 500px) {
  .ps-brand-list {
    position: absolute;
    left: -100%;
    width: 100%;
    height: 100%;
    transition: transform 0.3s ease-in-out;
    transform: translateX(0);
    box-sizing: border-box;
    overflow-y: scroll;
  }
  .ps-brand-list.mobile-visible {
    transform: translateX(100%);
  }
  
  .ps-phone-list {
    position: absolute;
    right: -100%;
    width: 100%;
    height: 100%;
    padding: 0 0.5rem;
    transition: transform 0.3s ease-in-out;
    transform: translateX(0);
    box-sizing: border-box;
  }
  .ps-phone-list.mobile-visible {
    transform: translateX(-100%);
  }

  .ps-header-nav-brand, .ps-header-nav-phone {
    display: block;
    height: 2.5rem;
  }
}
`;

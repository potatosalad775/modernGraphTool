export const normalizerInputStyles = `
  .normalizer-input {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.25rem 0.25rem 0.25rem 1rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 3.5rem;
  }

  .normalizer-input input[type="radio"] {
    display: none;
  }

  .normalizer-radio {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 1.75rem;
    color: var(--gt-color-primary);
    border: 1px solid var(--gt-color-outline);
    cursor: pointer;
    span {
      font-weight: 600;
    }
  }
  .normalizer-radio:has(input:checked) {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
  }
  .normalizer-radio.Hz {
    padding-left: 0.25rem;
    border-radius: 2.5rem 0 0 2.5rem;
    border-right: 0;
  }
  .normalizer-radio.Avg {
    padding-right: 0.25rem;
    border-radius: 0 2.5rem 2.5rem 0;
  }
  .normalizer-radio:hover {
    background: var(--gt-shadow);
    filter: var(--gt-hover-filter);
  }

  .normalizer-number {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    color: var(--gt-color-primary);
    align-self: stretch;
    font-weight: 500;
    
    input {
      outline: 0;
      border: 0;
      padding: 0;
      border-radius: 2rem;
      color: var(--gt-color-primary);
      background: transparent;
      font-weight: bold;
      max-width: 4rem;
    }
    input:disabled {
      filter: opacity(0.3);
    }
  }
`;
export const targetCustomizerStyle = `
  .target-control-component {
    display: block;
    margin: 0.5rem;
    margin-top: 0;
    container: tc-container / inline-size;
    max-height: 1000px;
    overflow: hidden;
    transition: max-height 0.3s ease-in-out, margin 0.3s ease-in-out, opacity 0.2s ease-in-out;
    opacity: 1;
  }

  .target-control-component.tc-component-hidden {
    max-height: 0;
    margin: 0 0.5rem;
    opacity: 0;
    pointer-events: none;
  }

  .tc-container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;

    span {
      font: var(--gt-typescale-title-small);
    }
  }

  .tc-input-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.5rem 0.4rem 0.5rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--gt-color-tertiary-container);

    label {
      margin-left: 0.1rem;
    }
  }

  .tc-input {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    gap: 0.3rem;

    input {
      border: 1px solid var(--gt-color-outline);
      outline: none;
      border-radius: 0.3rem;
      height: 1.5rem;
      min-width: 2rem;
    }

    button {
      min-width: 1.5rem;
      min-height: 1.5rem;
      border-radius: 1.5rem;
      background: var(--gt-color-tertiary);
      color: var(--gt-color-on-tertiary);
    }
  }

  .tc-profile-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-top: 0.5rem;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem 0.5rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--gt-color-tertiary-container);
      
    button {
      min-width: 4rem;
      min-height: 1.5rem;
      border-radius: 1.5rem;
      background: var(--gt-color-tertiary);
      color: var(--gt-color-on-tertiary);
    }
  }

  .tc-profile-select-container {
    flex: 1;

    select {
      width: 100%;
      min-height: 1.5rem;
    }
  }

  .tc-view-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 1.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--gt-color-tertiary-container);
    color: var(--gt-color-on-tertiary-container);
  }
  .tc-view-toggle-btn.active {
    background: var(--gt-color-tertiary);
    color: var(--gt-color-on-tertiary);
  }

  @media (hover: hover) and (pointer: fine) {
    .tc-input button:hover, .tc-profile-container button:hover {
      background: var(--gt-color-tertiary);
      filter: var(--gt-hover-filter);
    }
    .tc-view-toggle-btn:hover {
      background: var(--gt-color-tertiary-container);
      filter: var(--gt-hover-filter);
    }
    .tc-view-toggle-btn.active:hover {
      background: var(--gt-color-tertiary);
      filter: var(--gt-hover-filter);
    }
  }

  @container tc-container (max-width: 15rem) {
    .tc-container {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, 1fr);
    }
  }
  @container tc-container (min-width: 15rem) and (max-width: 31rem) {
    .tc-container {
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
    }
  }
  @container tc-container (min-width: 31rem) {
    .tc-container {
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: 1fr;
    }
  }
`;

export const IconProvider = {
  iconPath: {
    wave: '<path d="M22.768125 12.478124999999999c-2.15625 4.59375 -4.03125 6.6468750000000005 -6.076874999999999 6.6468750000000005 -2.59125 0 -4.106249999999999 -3.22875 -5.709375 -6.6468750000000005 -0.6693749999999999 -1.43625 -1.3696875 -2.9156250000000004 -2.083125 -3.9721874999999995C8.2865625 7.6021875 7.7371875 7.125 7.3125 7.125c-0.35812499999999997 0 -1.71 0.38625 -4.0396875 5.353125a1.125 1.125 0 0 1 -2.0371875 -0.9562499999999999c2.15625 -4.59375 4.03125 -6.6468750000000005 6.076874999999999 -6.6468750000000005 2.59125 0 4.106249999999999 3.22875 5.709375 6.6468750000000005 0.6740625 1.43625 1.3696875 2.9203124999999996 2.083125 3.9721874999999995 0.6121875 0.90375 1.1615625 1.3809375 1.59375 1.3809375 0.35812499999999997 0 1.71 -0.38625 4.0396875 -5.353125a1.125 1.125 0 0 1 2.0371875 0.9562499999999999Z"></path>',
    flatline: '<path d="M2 12C2 11.4477 2.44772 11 3 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H3C2.44772 13 2 12.5523 2 12Z"></path>',
    tilted: '<path d="M12.5935 23.2578l-0.0116 0.0017 -0.071 0.0355 -0.019 0.0037 -0.0152 -0.0037 -0.071 -0.0355c-0.0099 -0.0031 -0.0187 -0.0005 -0.0236 0.0054l-0.0041 0.0109 -0.0171 0.4273 0.005 0.0204 0.011 0.0122 0.1036 0.074 0.0148 0.0039 0.0118 -0.0039 0.1036 -0.074 0.0126 -0.016 0.0034 -0.0166 -0.0171 -0.4273c-0.002 -0.0101 -0.0086 -0.0165 -0.0161 -0.018Zm0.2649 -0.1125 -0.0139 0.002 -0.1847 0.0924 -0.0099 0.0102 -0.0027 0.0112 0.0179 0.4295 0.0048 0.0128 0.0085 0.0071 0.2009 0.0927c0.0121 0.0037 0.0229 -0.0002 0.0285 -0.008l0.004 -0.014 -0.0341 -0.6147c-0.0024 -0.0119 -0.0103 -0.0195 -0.0193 -0.0212Zm-0.7154 0.002c-0.0098 -0.0049 -0.0208 -0.002 -0.0274 0.0053l-0.0057 0.0139 -0.0341 0.6147c-0.0007 0.0115 0.007 0.0207 0.0168 0.0234l0.0157 -0.0014 0.2009 -0.0927 0.0094 -0.0081 0.0039 -0.0118 0.0179 -0.4295 -0.0032 -0.0126 -0.0094 -0.0088 -0.1848 -0.0924Z" stroke-width="5"></path><path d="M20.7071 3.29289c0.3905 0.39053 0.3905 1.02369 0 1.41422L4.70711 20.7071c-0.39053 0.3905 -1.02369 0.3905 -1.41422 0 -0.39052 -0.3905 -0.39052 -1.0237 0 -1.4142L19.2929 3.29289c0.3905 -0.39052 1.0237 -0.39052 1.4142 0Z" stroke-width="5"></path>',
  },
  
  Icon(identifier) {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
      style="width: 1.5rem; height: 1.5rem;"
    >
      ${this.iconPath[identifier]}
    </svg>
    `;
  }
}
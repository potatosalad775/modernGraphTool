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
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tc-filters-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: 0.5rem;
    background: var(--gt-color-tertiary-container);
    border: 1px solid var(--gt-color-outline-variant);
  }

  .tc-section-title {
    font: var(--gt-typescale-label-large);
    color: var(--gt-color-on-surface);
    margin: 0;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .tc-section-title::before {
    content: '';
    width: 2px;
    height: 0.875rem;
    background: var(--gt-color-primary);
    border-radius: 1px;
  }

  .tc-active-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .tc-filter-control {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    border-radius: 0.5rem;
    background: var(--gt-color-surface);
    border: 1px solid var(--gt-color-outline-variant);
    position: relative;
    transition: all 0.2s ease;
  }

  .tc-filter-control:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }

  .tc-filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tc-filter-label {
    font: var(--gt-typescale-body-small);
    color: var(--gt-color-on-surface);
    font-weight: 500;
  }

  .tc-filter-description {
    font: var(--gt-typescale-body-small);
    color: var(--gt-color-on-surface-variant);
    margin-top: -0.45rem;
    margin-bottom: 0.25rem;
    line-height: 1.25;
  }

  .tc-remove-filter-btn {
    min-width: 1.25rem;
    min-height: 1.25rem;
    border-radius: 50%;
    background: var(--gt-color-error-container);
    color: var(--gt-color-on-error-container);
    font-size: 0.75rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .tc-input {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    gap: 0.25rem;

    input {
      border: 1px solid var(--gt-color-outline);
      outline: none;
      border-radius: 0.25rem;
      height: 1.75rem;
      min-width: 2.5rem;
      text-align: center;
      font: var(--gt-typescale-body-small);
      font-weight: 500;
      background: var(--gt-color-surface);
      color: var(--gt-color-on-surface);
      transition: all 0.2s ease;
      flex: 1;
    }

    input:focus {
      border-color: var(--gt-color-primary);
      box-shadow: 0 0 0 2px rgba(var(--gt-color-primary-rgb, 98, 0, 238), 0.12);
    }

    button {
      min-width: 1.75rem;
      min-height: 1.75rem;
      border-radius: 0.25rem;
      background: var(--gt-color-primary);
      color: var(--gt-color-on-primary);
      font-weight: 600;
      font-size: 0.75rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  }

  .tc-filter-management {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.375rem;
    border-top: 1px solid var(--gt-color-outline-variant);
  }

  .tc-add-filter-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tc-add-filter-select {
    flex: 1;
    min-height: 2rem;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid var(--gt-color-outline);
    background: var(--gt-color-surface);
    color: var(--gt-color-on-surface);
    font: var(--gt-typescale-body-small);
    cursor: pointer;
    transition: all 0.2s ease;
    
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding-left: 0.3rem;
    background-repeat: no-repeat;
    background-position: right center;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"></path></svg>');
    outline: none;
  }

  .tc-add-filter-select:focus {
    border-color: var(--gt-color-primary);
    box-shadow: 0 0 0 2px rgba(var(--gt-color-primary-rgb, 98, 0, 238), 0.12);
  }

  .tc-profile-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: 0.5rem;
    background: var(--gt-color-surface-variant);
    border: 1px solid var(--gt-color-outline-variant);
  }

  .tc-profile-controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .tc-profile-select-container {
    flex: 1;
    width: 100%;

    select {
      width: 100%;
      min-height: 2rem;
      padding: 0 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid var(--gt-color-outline);
      background: var(--gt-color-surface);
      color: var(--gt-color-on-surface);
      font: var(--gt-typescale-body-small);
      transition: all 0.2s ease;
      cursor: pointer;
    
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      padding-left: 0.3rem;
      background-repeat: no-repeat;
      background-position: right center;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"></path></svg>');
      outline: none;
    }

    select:focus {
      border-color: var(--gt-color-primary);
      box-shadow: 0 0 0 2px rgba(var(--gt-color-primary-rgb, 98, 0, 238), 0.12);
    }
  }

  .tc-filter-reset-btn {
    min-width: 4rem;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: 0.375rem;
    background: var(--gt-color-secondary);
    color: var(--gt-color-on-secondary);
    font: var(--gt-typescale-body-small);
    font-weight: 500;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .tc-view-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 1.75rem;
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    background: linear-gradient(135deg, var(--gt-color-primary) 0%, var(--gt-color-secondary) 100%);
    color: var(--gt-color-on-primary);
    font: var(--gt-typescale-body-medium);
    font-weight: 500;
    transition: all 0.3s ease;
    cursor: pointer;
    overflow: hidden;
    transform: translateY(0);
  }
  
  .tc-view-toggle-btn.active {
    background: linear-gradient(135deg, var(--gt-color-primary) 0%, var(--gt-color-secondary) 100%);
    color: var(--gt-color-on-primary);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transform: translateY(-1px);
  }

  .tc-view-toggle-btn .tc-btn-icon {
    width: 1rem;
    height: 1rem;
    opacity: 0.9;
    transition: transform 0.3s ease;
  }

  .tc-view-toggle-btn.active .tc-btn-icon {
    transform: rotate(180deg);
  }

  .tc-no-filters {
    text-align: center;
    color: var(--gt-color-on-surface-variant);
    font: var(--gt-typescale-body-small);
    font-style: italic;
    padding: 1rem 0.5rem;
    background: var(--gt-color-surface-variant);
    border-radius: 0.375rem;
    border: 1px dashed var(--gt-color-outline-variant);
  }

  @media (hover: hover) and (pointer: fine) {
    .tc-input button:hover {
      background: var(--gt-color-primary);
      filter: brightness(1.1);
      transform: scale(1.05);
    }
    
    .tc-remove-filter-btn:hover {
      background: var(--gt-color-error);
      color: var(--gt-color-on-error);
      transform: scale(1.1);
    }
    
    .tc-filter-reset-btn:hover {
      background: var(--gt-color-secondary);
      filter: brightness(1.1);
    }
    
    .tc-view-toggle-btn:hover {
      background: linear-gradient(135deg, var(--gt-color-primary) 0%, var(--gt-color-secondary) 100%);
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      transform: translateY(-1px) scale(1.01);
    }
    
    .tc-view-toggle-btn.active:hover {
      background: linear-gradient(135deg, var(--gt-color-primary) 0%, var(--gt-color-secondary) 100%);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      transform: translateY(-1px) scale(1.01);
    }
  }

  @container tc-container (max-width: 20rem) {
    .tc-active-filters {
      grid-template-columns: 1fr;
    }
    
    .tc-profile-controls {
      flex-direction: column;
    }
    
    .tc-filter-reset-btn {
      width: 100%;
    }
  }

  @container tc-container (min-width: 20rem) and (max-width: 35rem) {
    .tc-active-filters {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @container tc-container (min-width: 35rem) {
    .tc-active-filters {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
  }

  /* Animation for adding/removing filters */
  .tc-filter-control {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-5px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
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
export const equalizerStyles = `
  :host {
    display: block;
    container-type: inline-size;
    container-name: equalizer-host;
  }
    
  .equalizer-container {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 1rem;
    overflow: hidden;
    box-sizing: border-box;
    height: fit-content;
  }
  
  .eq-controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .eq-controls:last-child {
    padding-bottom: 1rem;
  }

  @container equalizer-host (min-width: 600px) {
    .equalizer-container {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr;
    }

    .eq-controls {
      padding-bottom: 1rem;
    }
  }

  eq-filter-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .eq-filter-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.3rem;

    .preamp-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .eq-filter-button-row {
      display: flex;
      flex-direction: row;
      gap: 0.2rem;
    }
  }

  .eq-filter-bands {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .eq-filter-band {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0.3rem;
    padding: 0.4rem;
    height: 1.5rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.5rem;
    background: var(--gt-color-surface-container);

    label {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    input[type="checkbox"] {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 0.3rem;
      border: 0.1rem solid var(--gt-color-outline);
      width: 0.8rem;
      height: 0.8rem;
      accent-color: var(--gt-color-primary);
    }
    select {
      flex: 1;
      min-width: 3.5rem;
    }
    .filter-freq {
      flex: 2;
    }
    .filter-q, .filter-gain {
      flex: 1;
    }
  }

  .eq-data-button-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  eq-select {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.5rem;
    background: var(--gt-color-surface-container);

    select {
      height: 2rem;
    }
  }

  eq-autoeq {
    padding: 0.5rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.5rem;
    background: var(--gt-color-surface-container);
    overflow: hidden;

    p {
      margin: 0.2rem 0;
      text-align: center;
    }
  }

  .auto-eq-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;

    gt-button {
      width: 100%;
    }
  }

  .ae-params {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 0.5rem;
  }

  .ae-param-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    label { 
      flex: 3;
    }
    input { 
      flex: 2;
      height: 1rem;
    }
  }

  .audio-player {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.5rem;
    background: var(--gt-color-surface-container);
  }
  .ap-audio-source {
    width: 100%;
  }
  .ap-tone-controls {
    gap: 0.7rem;
  }
  .ap-file-info {
    gap: 0.3rem;
  }
  .ap-tone-controls, .ap-file-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0.5rem 0.1rem 0.2rem 0.1rem;

    label {
      font-weight: 600;
    }
    input {
      margin: 0;
      width: 100%;
    }
    .ap-file-name {
      margin: 0 0.1rem 0.4rem 0.1rem;
      overflow-x: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .ap-time-info {
      display: flex;
      justify-content: space-between;
      margin: 0 0.1rem 0.2rem 0.1rem;
      width: 100%;
    }
    .ap-time-slider {
      width: 100%;
    }
  }
  .ap-control {
    display: flex;
    flex-direction: row;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.5rem;
    padding: 0.2rem 0.5rem;
    background: var(--gt-color-surface-container-lowest);

    .ap-playback-controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.2rem;
    }
    
    .ap-volume-control {
      flex: 1;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0.2rem 0 0.5rem;

      label, input {
        display: flex;
        align-items: center;
      }
      input {
        flex: 1;
      }
    }
  }

  select, input[type="number"] {
    width: 100%;
    padding: 0.2rem;
    border: 1px solid var(--gt-color-outline);
    border-radius: 0.4rem;
    color: var(--gt-color-on-surface);
    background: var(--gt-color-surface-container-lowest);
    font: var(--gt-typescale-body-medium);
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding-left: 0.3rem;
    border: 1px solid var(--gt-color-outline);
    background-repeat: no-repeat;
    background-position: right center;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"></path></svg>');
    outline: none;
    cursor: pointer;
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    -webkit-appearance: none;
    appearance: none;
    background: rgba(0,0,0,0.3);
    border-radius: 0.5rem;
    height: 0.5rem;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 1rem;
    height: 1rem;
    border-radius: 1rem;
    margin-top: -4px;
    background: var(--gt-color-primary);
    cursor: pointer;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    border-radius: 2rem;
    color: var(--gt-color-on-surface);
    -webkit-tap-highlight-color: transparent;
  }
  button:hover {
    background: var(--gt-color-surface-container-low);
  }

  @layer aria-busy {
  *[aria-busy="true"] {
    pointer-events: none;
    position: relative;
    filter: blur(1px);
    opacity: 0.8 !important;
    transition: filter 0.5s ease-out;
  }
    
  *[aria-busy="true"]::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    animation: shimmer 1.5s infinite;
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(0,0,0,0.5) 50%,
      transparent 100%
    );
    opacity: 0.7;
    transition: opacity 0.3s ease-out;
  }

  /* Explicitly remove ::after when aria-busy is false/removed */
  *[aria-busy="false"]::after,
  *:not([aria-busy])::after {
    content: none;
    opacity: 0;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
    100% {
      transform: translateX(100%);
      opacity: 0.4;
    }
  }
}
`;

export const equalizerIcon = {
  iconPath: {
    plus: '<path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"></path>',
    subtract: '<path d="M5 11V13H19V11H5Z"></path>',
    sortDesc: '<path d="M20 4V16H23L19 21L15 16H18V4H20ZM12 18V20H3V18H12ZM14 11V13H3V11H14ZM14 4V6H3V4H14Z"></path>',
    import: '<path d="M13 10H18L12 16L6 10H11V3H13V10ZM4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19Z"></path>',
    export: '<path d="M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM13 9V16H11V9H6L12 3L18 9H13Z"></path>',
    arrowDown: '<path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z"></path>',
    volumeMute: '<path d="M5.88889 16.0001H2C1.44772 16.0001 1 15.5524 1 15.0001V9.00007C1 8.44778 1.44772 8.00007 2 8.00007H5.88889L11.1834 3.66821C11.3971 3.49335 11.7121 3.52485 11.887 3.73857C11.9601 3.8279 12 3.93977 12 4.05519V19.9449C12 20.2211 11.7761 20.4449 11.5 20.4449C11.3846 20.4449 11.2727 20.405 11.1834 20.3319L5.88889 16.0001ZM20.4142 12.0001L23.9497 15.5356L22.5355 16.9498L19 13.4143L15.4645 16.9498L14.0503 15.5356L17.5858 12.0001L14.0503 8.46454L15.4645 7.05032L19 10.5859L22.5355 7.05032L23.9497 8.46454L20.4142 12.0001Z"></path>',
    volumeFull: '<path d="M2 16.0001H5.88889L11.1834 20.3319C11.2727 20.405 11.3846 20.4449 11.5 20.4449C11.7761 20.4449 12 20.2211 12 19.9449V4.05519C12 3.93977 11.9601 3.8279 11.887 3.73857C11.7121 3.52485 11.3971 3.49335 11.1834 3.66821L5.88889 8.00007H2C1.44772 8.00007 1 8.44778 1 9.00007V15.0001C1 15.5524 1.44772 16.0001 2 16.0001ZM23 12C23 15.292 21.5539 18.2463 19.2622 20.2622L17.8445 18.8444C19.7758 17.1937 21 14.7398 21 12C21 9.26016 19.7758 6.80629 17.8445 5.15557L19.2622 3.73779C21.5539 5.75368 23 8.70795 23 12ZM18 12C18 10.0883 17.106 8.38548 15.7133 7.28673L14.2842 8.71584C15.3213 9.43855 16 10.64 16 12C16 13.36 15.3213 14.5614 14.2842 15.2841L15.7133 16.7132C17.106 15.6145 18 13.9116 18 12Z"></path>',
    play: '<path d="M19.376 12.4161L8.77735 19.4818C8.54759 19.635 8.23715 19.5729 8.08397 19.3432C8.02922 19.261 8 19.1645 8 19.0658V4.93433C8 4.65818 8.22386 4.43433 8.5 4.43433C8.59871 4.43433 8.69522 4.46355 8.77735 4.5183L19.376 11.584C19.6057 11.7372 19.6678 12.0477 19.5146 12.2774C19.478 12.3323 19.4309 12.3795 19.376 12.4161Z"></path>',
    pause: '<path d="M6 5H8V19H6V5ZM16 5H18V19H16V5Z"></path>',
    previous: '<path d="M8 11.3333L18.2227 4.51823C18.4524 4.36506 18.7628 4.42714 18.916 4.65691C18.9708 4.73904 19 4.83555 19 4.93426V19.0657C19 19.3419 18.7761 19.5657 18.5 19.5657C18.4013 19.5657 18.3048 19.5365 18.2227 19.4818L8 12.6667V19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19V5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5V11.3333Z"></path>',
  },

  getSVG(identifier, customStyle = "") {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
      style="${customStyle !== "" ? customStyle : "width: 1rem; height: 1rem;"}"
    >
      ${this.iconPath[identifier]}
    </svg>
    `;
  },
};

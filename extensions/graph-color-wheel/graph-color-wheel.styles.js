export const graphColorWheelStyle = `
  .graph-color-wheel-popup {
    position: absolute;
    display: flex;
    flex-direction: row;
    background-color: var(--gt-color-surface-container-high);
    border: 1px solid var(--gt-color-outline);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 500;
    width: 50dvw;
    max-width: 30rem;
    gap: 1rem;
    color: var(--gt-color-on-surface);
  }

  .graph-color-wheel-popup .color-wheel-section {
    width: 128px;
    height: 128px;

    .close-btn {
      position: absolute;
      bottom: 0.4rem;
      left: 0.4rem;
      font-size: 1.5rem;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 1.5rem;
    }
  }

  .graph-color-wheel-popup .input-section {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .graph-color-wheel-popup .color-input-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .graph-color-wheel-popup .dash-input-container {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .graph-color-wheel-popup .gcw-input-group {
    display: flex;
    flex-direction: column;
    width: 100%;

    input {
      flex: 1;
      box-sizing: border-box;
      width: 100%;
    }

    label {
      height: 1.25rem;
    }
  }

  .graph-color-wheel-popup .popup-footer {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 0.5rem;
    height: 2rem;
    margin-bottom: 0.3rem;
    position: relative;

    button {
      width: 2rem;
      height: 2rem;
      border-radius: 0.5rem;
      color: var(--gt-color-primary);
    }

    #gcw-random-color {
      position: absolute;
      top: -0.3rem;
      left: -0.5rem;
    }

    .close-btn {
      position: absolute;
      top: -0.3rem;
      right: -0.5rem;
    }
  }
`;

export const gCWIconProvider = {
  iconPath: {
    close: '<path d="M10.5859 12L2.79297 4.20706L4.20718 2.79285L12.0001 10.5857L19.793 2.79285L21.2072 4.20706L13.4143 12L21.2072 19.7928L19.793 21.2071L12.0001 13.4142L4.20718 21.2071L2.79297 19.7928L10.5859 12Z"></path>',
    random: '<path d="M10.9979 1.58018C11.6178 1.22132 12.3822 1.22132 13.0021 1.58018L20.5021 5.92229C21.1197 6.27987 21.5 6.93946 21.5 7.65314V16.3469C21.5 17.0606 21.1197 17.7202 20.5021 18.0778L13.0021 22.4199C12.3822 22.7788 11.6178 22.7788 10.9979 22.4199L3.49793 18.0778C2.88029 17.7202 2.5 17.0606 2.5 16.3469V7.65314C2.5 6.93947 2.88029 6.27987 3.49793 5.92229L10.9979 1.58018ZM4.5 7.65314V7.65792L11.0021 11.4223C11.6197 11.7799 12 12.4395 12 13.1531V20.689L19.5 16.3469V7.65314L12 3.31104L4.5 7.65314ZM6.13208 12.3C6.13206 11.7477 5.74432 11.0761 5.26604 10.7999C4.78776 10.5238 4.40004 10.7476 4.40006 11.2999C4.40008 11.8522 4.78782 12.5238 5.2661 12.7999C5.74439 13.0761 6.1321 12.8523 6.13208 12.3ZM8.72899 18.7982C9.20728 19.0743 9.59499 18.8505 9.59497 18.2982C9.59495 17.7459 9.20721 17.0743 8.72893 16.7982C8.25065 16.522 7.86293 16.7459 7.86295 17.2982C7.86297 17.8504 8.25071 18.522 8.72899 18.7982ZM5.2661 16.799C5.74439 17.0751 6.1321 16.8513 6.13208 16.299C6.13206 15.7467 5.74432 15.0751 5.26604 14.799C4.78776 14.5228 4.40004 14.7467 4.40006 15.2989C4.40008 15.8512 4.78782 16.5228 5.2661 16.799ZM8.72851 14.7995C9.20679 15.0756 9.5945 14.8518 9.59448 14.2995C9.59446 13.7472 9.20673 13.0756 8.72844 12.7995C8.25016 12.5233 7.86245 12.7471 7.86246 13.2994C7.86248 13.8517 8.25022 14.5233 8.72851 14.7995ZM14.8979 8.00001C15.3762 7.72388 15.3762 7.27619 14.8979 7.00006C14.4196 6.72394 13.6441 6.72394 13.1658 7.00006C12.6875 7.27619 12.6875 7.72388 13.1658 8.00001C13.6441 8.27614 14.4196 8.27614 14.8979 8.00001ZM10.0981 7.00006C10.5764 7.27619 10.5764 7.72388 10.0981 8.00001C9.61982 8.27614 8.84434 8.27614 8.36604 8.00001C7.88774 7.72388 7.88774 7.27619 8.36604 7.00006C8.84434 6.72394 9.61982 6.72394 10.0981 7.00006ZM15.9954 15.3495C16.5932 15.0043 17.0779 14.1649 17.0779 13.4745C17.0779 12.7842 16.5933 12.5044 15.9955 12.8496C15.3977 13.1948 14.9131 14.0342 14.913 14.7246C14.913 15.4149 15.3976 15.6947 15.9954 15.3495Z"></path>'  
  },
  
  Icon(identifier) {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
      style="width: 1.5rem; height: 1.5rem;"}"
    >
      ${this.iconPath[identifier]}
    </svg>
    `;
  }
}
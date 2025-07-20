class GtToast extends HTMLElement {
  constructor() {
    super();
    this.toasts = new Map();
    this.nextId = 1;
    
    this.innerHTML = `
      <div class="toast-container"></div>
      
      <style>
        gt-toast {
          position: fixed;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          pointer-events: none;
        }

        .toast-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 480px;
          max-width: 720px;
        }

        .toast-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-size: 0.875rem;
          line-height: 1.25rem;
          pointer-events: auto;
          animation: toast-slide-in 0.3s ease-out;
          position: relative;
          overflow: hidden;
        }

        .toast-item.removing {
          animation: toast-slide-out 0.3s ease-in forwards;
        }

        .toast-item.success {
          background: var(--gt-color-success-container, #ccffcd);
          color: var(--gt-color-on-success-container, #05310d);
          border-left: 4px solid var(--gt-color-success, #2ea043);
        }

        .toast-item.error {
          background: var(--gt-color-error-container, #ffebee);
          color: var(--gt-color-on-error-container, #410002);
          border-left: 4px solid var(--gt-color-error, #ba1a1a);
        }

        .toast-item.warning {
          background: var(--gt-color-warning-container, #ffeccc);
          color: var(--gt-color-on-warning-container, #663300);
          border-left: 4px solid var(--gt-color-warning, #ff9800);
        }

        .toast-item.loading {
          background: var(--gt-color-surface-container-high, #f5f5f5);
          color: var(--gt-color-on-surface, #1c1b1f);
          border-left: 4px solid var(--gt-color-primary, #6750a4);
        }

        .toast-icon {
          flex-shrink: 0;
          width: 1.25rem;
          height: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toast-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .toast-title {
          font-weight: 600;
          font-size: 0.875rem;
        }

        .toast-message {
          font-size: 0.8125rem;
          opacity: 0.9;
        }

        .toast-close {
          flex-shrink: 0;
          width: 1.5rem;
          height: 1.5rem;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
          transition: opacity 0.2s ease;
        }

        .toast-close:hover {
          opacity: 1;
          background: rgba(0, 0, 0, 0.1);
        }

        .loading-spinner {
          width: 1rem;
          height: 1rem;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: currentColor;
          opacity: 0.3;
          transition: width linear;
        }

        @keyframes toast-slide-in {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes toast-slide-out {
          from {
            transform: translateY(0);
            opacity: 1;
            max-height: 200px;
            margin-bottom: 0.5rem;
          }
          to {
            transform: translateY(-100%);
            opacity: 0;
            max-height: 0;
            margin-bottom: 0;
            padding-top: 0;
            padding-bottom: 0;
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          gt-toast {
            top: 0.5rem;
            left: 0.5rem;
            right: 0.5rem;
            transform: none;
          }
          
          .toast-container {
            min-width: auto;
          }
        }
      </style>
    `;
  }

  connectedCallback() {
    // Listen for global toast events
    document.addEventListener('gt-toast-show', this._handleToastEvent);
    document.addEventListener('gt-toast-update', this._handleToastUpdateEvent);
    document.addEventListener('gt-toast-dismiss', this._handleToastDismissEvent);
  }

  disconnectedCallback() {
    document.removeEventListener('gt-toast-show', this._handleToastEvent);
    document.removeEventListener('gt-toast-update', this._handleToastUpdateEvent);
    document.removeEventListener('gt-toast-dismiss', this._handleToastDismissEvent);
    
    // Clear all toasts
    this.toasts.forEach(toast => {
      if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
      }
    });
    this.toasts.clear();
  }

  _handleToastEvent = (event) => {
    const { type, title, message, duration, persistent, id } = event.detail;
    this.show(type, title, message, { duration, persistent, id });
  };

  _handleToastUpdateEvent = (event) => {
    const { id, title, message, type } = event.detail;
    this.update(id, { title, message, type });
  };

  _handleToastDismissEvent = (event) => {
    const { id } = event.detail;
    this.dismiss(id);
  };

  show(type, title, message = '', options = {}) {
    const {
      duration = type === 'loading' ? 0 : 5000,
      persistent = type === 'loading',
      id = `toast-${this.nextId++}`
    } = options;

    // Remove existing toast with same ID if it exists
    if (this.toasts.has(id)) {
      this.dismiss(id);
    }

    const container = this.querySelector('.toast-container');
    const toastElement = this._createToastElement(type, title, message, id, persistent);
    
    container.appendChild(toastElement);

    const toastData = {
      id,
      element: toastElement,
      type,
      title,
      message,
      timeoutId: null
    };

    this.toasts.set(id, toastData);

    // Auto-dismiss after duration (unless persistent)
    if (!persistent && duration > 0) {
      toastData.timeoutId = setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  update(id, updates = {}) {
    const toast = this.toasts.get(id);
    if (!toast) return false;

    const { title, message, type, dismiss = true } = updates;

    if (title !== undefined) {
      const titleElement = toast.element.querySelector('.toast-title');
      if (titleElement) titleElement.textContent = title;
      toast.title = title;
    }

    if (message !== undefined) {
      const messageElement = toast.element.querySelector('.toast-message');
      if (messageElement) {
        messageElement.textContent = message;
        messageElement.style.display = message ? 'block' : 'none';
      }
      toast.message = message;
    }

    if (type !== undefined && type !== toast.type) {
      toast.element.className = `toast-item ${type}`;
      const iconElement = toast.element.querySelector('.toast-icon');
      if (iconElement) {
        iconElement.innerHTML = this._getIcon(type);
      }
      toast.type = type;
    }
      
    // Automatically dismiss
    if (dismiss) {
      setTimeout(() => {
        this.dismiss(id);
      }, 2000);
    }

    return true;
  }

  dismiss(id) {
    const toast = this.toasts.get(id);
    if (!toast) return false;

    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    toast.element.classList.add('removing');
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(id);
    }, 300);

    return true;
  }

  dismissAll() {
    this.toasts.forEach((_, id) => {
      this.dismiss(id);
    });
  }

  _createToastElement(type, title, message, id, persistent) {
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.dataset.toastId = id;

    const icon = this._getIcon(type);
    const showMessage = message && message.trim() !== '';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${showMessage ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      ${!persistent ? `
        <button class="toast-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      ` : ''}
    `;

    // Add close button event listener
    const closeButton = toast.querySelector('.toast-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.dismiss(id);
      });
    }

    return toast;
  }

  _getIcon(type) {
    const icons = {
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12ZM12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM17.4571 9.45711L16.0429 8.04289L11 13.0858L8.20711 10.2929L6.79289 11.7071L11 15.9142L17.4571 9.45711Z"></path>
      </svg>`,
      error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"></path>
      </svg>`,
      warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>`,
      loading: `<div class="loading-spinner"></div>`
    };
    return icons[type] || icons.success;
  }

  // Static utility methods for easy access
  static _getInstance() {
    // Find the gt-toast instance in the DOM
    return document.querySelector('gt-toast');
  }

  static show(type, titleOrOptions, message, options = {}) {
    const instance = GtToast._getInstance();
    if (!instance) {
      console.warn('GtToast: No gt-toast element found in DOM');
      return null;
    }

    // Support both API styles:
    // GtToast.show('success', 'title', 'message', options)
    // GtToast.show('success', { title: 'title', message: 'message' })
    let title, msg, opts;
    
    if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
      // Object-based API
      title = titleOrOptions.title || '';
      msg = titleOrOptions.message || '';
      opts = { ...options, ...titleOrOptions };
    } else {
      // Separate parameters API
      title = titleOrOptions || '';
      msg = message || '';
      opts = options;
    }

    return instance.show(type, title, msg, opts);
  }

  static success(titleOrOptions, message, options = {}) {
    return GtToast.show('success', titleOrOptions, message, options);
  }

  static error(titleOrOptions, message, options = {}) {
    return GtToast.show('error', titleOrOptions, message, options);
  }

  static warning(titleOrOptions, message, options = {}) {
    return GtToast.show('warning', titleOrOptions, message, options);
  }

  static loading(titleOrOptions, message, options = {}) {
    return GtToast.show('loading', titleOrOptions, message, { persistent: true, ...options });
  }

  static update(id, updates) {
    const instance = GtToast._getInstance();
    if (instance) {
      return instance.update(id, updates);
    } else {
      console.warn('GtToast: No gt-toast element found in DOM');
      return false;
    }
  }

  static dismiss(id) {
    const instance = GtToast._getInstance();
    if (instance) {
      return instance.dismiss(id);
    } else {
      console.warn('GtToast: No gt-toast element found in DOM');
      return false;
    }
  }

  static dismissAll() {
    const instance = GtToast._getInstance();
    if (instance) {
      return instance.dismissAll();
    } else {
      console.warn('GtToast: No gt-toast element found in DOM');
      return false;
    }
  }
}

customElements.define('gt-toast', GtToast);

// Export for use in other modules
export { GtToast };

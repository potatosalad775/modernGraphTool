import MenuState from "../../../model/menu-state.js";
import CoreEvent from "../../../core-event.js";
import StringLoader from "../../../model/util/string-loader.js";
import { menuCarouselStyles } from "./menu-carousel.styles.js";

class MenuCarousel extends HTMLElement {
  constructor() {
    super();

    this.currentIndex = MenuState.getCurrentIndex();
    this.isDragging = false;
    this.startX = 0;
    this.currentX = 0;
    this.lastDragX = 0;
    this.animationFrame = null;
    this.isSnapping = false;
    this.snapDebounceTime = 100; // ms

    this.innerHTML = `
      <nav class="menu-carousel-group">
        <div class="menu-carousel">
          ${MenuState.getCoreMenuList().map((menu) => `
            <button type="button" class="menu-bar-item" data-target="${menu.id}-panel">
              ${StringLoader.getString(`menu.item-${menu.id}-label`, menu.name || '?')}
            </button>
          `).join('')} 
        </div>
      </nav>
    `;

    const style = document.createElement('style');
    style.textContent = menuCarouselStyles;
    this.appendChild(style);
    
    this._updateCarousel();
  }

  connectedCallback() {
    // Store bound methods
    this._handleExtensionAdded = () => {
      this._updateCarousel();
      // Update Button Listeners
      this._removeButtonListeners();
      this._setupButtonListeners();
    };
    this._handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      this.wheelAccumulator += delta * this.wheelSensitivity;
      
      if (Math.abs(this.wheelAccumulator) >= this.wheelThreshold) {
        const direction = Math.sign(this.wheelAccumulator);
        this._snap(this.currentIndex + direction);
        this.wheelAccumulator = 0;
      }
    };
    this._handleDragStart = this._startDragging.bind(this);
    this._handleDrag = this._drag.bind(this);
    this._handleDragEnd = this._stopDragging.bind(this);

    // Add event listeners
    window.addEventListener("core:ui-mode-change", this._handleUIModeChange.bind(this));
    window.addEventListener("core:extension-menu-added", this._handleExtensionAdded);
    
    // Initialize wheel event listeners
    this.wheelAccumulator = 0;
    this.wheelSensitivity = 0.3;
    this.wheelThreshold = 1.0;
    this.addEventListener('wheel', this._handleWheel, { passive: false });

    // Mouse events
    this.addEventListener('mousedown', this._handleDragStart);
    window.addEventListener('mousemove', this._handleDrag);
    window.addEventListener('mouseup', this._handleDragEnd);
    window.addEventListener('mouseleave', this._handleDragEnd);

    // Touch events
    this.addEventListener('touchstart', this._handleDragStart, { passive: false });
    window.addEventListener('touchmove', this._handleDrag, { passive: false });
    window.addEventListener('touchend', this._handleDragEnd);
    window.addEventListener('touchcancel', this._handleDragEnd);

    // Setup button click handlers once
    this._setupButtonListeners();
  }

  disconnectedCallback() {
    // Remove all event listeners
    window.removeEventListener("core:ui-mode-change", this._handleUIModeChange.bind(this));
    window.removeEventListener("core:extension-menu-added", this._handleExtensionAdded);
    this.removeEventListener('wheel', this._handleWheel);

    this.removeEventListener('mousedown', this._handleDragStart);
    window.removeEventListener('mousemove', this._handleDrag);
    window.removeEventListener('mouseup', this._handleDragEnd);
    window.removeEventListener('mouseleave', this._handleDragEnd);

    this.removeEventListener('touchstart', this._handleDragStart);
    window.removeEventListener('touchmove', this._handleDrag);
    window.removeEventListener('touchend', this._handleDragEnd);
    window.removeEventListener('touchcancel', this._handleDragEnd);
    
    // Remove button listeners
    this._removeButtonListeners();
  }

  _setupButtonListeners() {
    this._buttonHandlers = new Map();
    this._touchStartX = 0;
    this._touchStartTime = 0;
    
    this._buttons.forEach((button, index) => {
      const handleTouchStart = (e) => {
        e.preventDefault();
        this._touchStartX = e.touches[0].clientX;
        this._touchStartTime = Date.now();
      };

      const handleTouchEnd = (e) => {
        // Check if this was a swipe (movement > 10px or time < 200ms)
        const touchEndX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const isSwipe = Math.abs(touchEndX - this._touchStartX) > 10 || 
                       (Date.now() - this._touchStartTime) > 200;
        
        if (isSwipe) return;

        e.preventDefault();
        const target = e.currentTarget.dataset.target;
        if (!isSwipe && target) {
          const direction = index - this.currentIndex;
          this._animateToIndex(index, direction);
        }
      };

      const handleClick = (e) => {
        e.preventDefault();
        const target = e.currentTarget.dataset.target;
        if (target) {
          const direction = index - this.currentIndex;
          this._animateToIndex(index, direction);
        }
      };

      this._buttonHandlers.set(button, { handleClick, handleTouchStart, handleTouchEnd });
      
      button.addEventListener('touchstart', handleTouchStart, { passive: false });
      button.addEventListener('touchend', handleTouchEnd, { passive: false });
      button.addEventListener('click', handleClick);
    });
  }

  _animateToIndex(targetIndex, direction) {
    if (this.isSnapping || targetIndex === this.currentIndex) return;
    
    this.isSnapping = true;
    const steps = Math.abs(direction);
    let currentStep = 0;
    
    const animate = () => {
      currentStep++;
      const nextIndex = this.currentIndex + Math.sign(direction);
      this.currentIndex = nextIndex;
      this._updateCarousel(true);
      
      if (currentStep < steps) {
        requestAnimationFrame(animate);
      } else {
        setTimeout(() => {
          this.isSnapping = false;
        }, this.snapDebounceTime);
        
        const target = this._buttons[targetIndex].dataset.target;
        CoreEvent.dispatchEvent('menu-switched', {target});
      }
    };
    
    requestAnimationFrame(animate);
  }

  _removeButtonListeners() {
    if (this._buttonHandlers) {
      this._buttonHandlers.forEach((handlers, button) => {
        button.removeEventListener('click', handlers.handleClick);
        button.removeEventListener('touchstart', handlers.handleTouchStart);
        button.removeEventListener('touchend', handlers.handleTouchEnd);
      });
      this._buttonHandlers.clear();
    }
  }

  _updateCarousel(animate = true) {
    const itemWidth = 108; // 6rem + 0.75rem gap

    this._carousel = this.querySelector('.menu-carousel');
    this._buttons = Array.from(this.querySelectorAll('.menu-bar-item')).filter(button => {
      const computedStyle = window.getComputedStyle(button);
      return computedStyle.display !== 'none';
    });

    const totalItems = this._buttons.length;
    // Calculate position to center the active item
    const scrollPosition = ((totalItems / 2) - 0.5 - this.currentIndex) * itemWidth;
    
    this._carousel.style.transition = animate ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
    this._carousel.style.transform = `translateX(${scrollPosition}px)`;

    // Update active states
    this._buttons.forEach((button, index) => {
      button.classList.toggle('nearby', Math.abs(index - this.currentIndex) === 1);
      button.classList.toggle('active', index === this.currentIndex);
    });
  }

  _startDragging(e) {
    if (e.type.startsWith('touch')) e.preventDefault();
    
    this.isDragging = true;
    this.startX = e.type.startsWith('touch') ? e.touches[0].pageX : e.pageX;
    this.currentX = this.startX;
    this.lastDragX = this.startX;
    
    this._carousel.style.transition = 'none';
    this.dragStartIndex = this.currentIndex;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  _drag(e) {
    if (!this.isDragging) return;
    if (e.type.startsWith('touch')) e.preventDefault();

    this.currentX = e.type.startsWith('touch') ? e.touches[0].pageX : e.pageX;
    
    // Use requestAnimationFrame for smooth animation
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    
    this.animationFrame = requestAnimationFrame(() => {
      const itemWidth = 108;
      const totalItems = this._buttons.length;
      const dragDistance = this.currentX - this.startX;
      const scrollPosition = ((totalItems / 2) - 0.5 - this.dragStartIndex) * itemWidth;
      
      this._carousel.style.transform = `translateX(${scrollPosition + dragDistance}px)`;

      // Update active item based on position
      const estimatedIndex = Math.round(-dragDistance / itemWidth) + this.dragStartIndex;
      if (estimatedIndex !== this.currentIndex && 
          estimatedIndex >= 0 && 
          estimatedIndex < this._buttons.length) {
        this.currentIndex = estimatedIndex;
        this._updateActiveStates();
      }

      this.lastDragX = this.currentX;
    });
  }

  _stopDragging() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    const velocity = this.currentX - this.lastDragX;
    const direction = Math.sign(velocity);
    const speed = Math.abs(velocity);
    
    // Add momentum if the speed is significant
    if (speed > 5) {
      this._snap(this.currentIndex - direction);
    } else {
      this._snap(this.currentIndex);
    }
  }

  _snap(index) {
    if (this.isSnapping) return;
    
    const targetIndex = Math.max(0, Math.min(index, this._buttons.length - 1));
    if (targetIndex !== this.currentIndex) {
      this.isSnapping = true;
      this.currentIndex = targetIndex;
      this._updateCarousel(true);
      
      setTimeout(() => {
        this.isSnapping = false;
      }, this.snapDebounceTime);
    } else {
      this._updateCarousel(true);
    }
      
    const target = this._buttons[targetIndex].dataset.target;
    CoreEvent.dispatchEvent('menu-switched', {target});
  }

  _updateActiveStates() {
    this._buttons.forEach((button, index) => {
      const distance = Math.abs(index - this.currentIndex);
      button.classList.toggle('nearby', distance === 1);
      button.classList.toggle('active', index === this.currentIndex);
    });
  }

  _handleUIModeChange(e) {
    // Escape 'list' menu when switching to desktop mode
    if(!e.detail.isMobile && MenuState.coreMenuList[this.currentIndex] === 'list') {
      this._animateToIndex(MenuState.coreMenuList.indexOf('graph'), -1);
    }
    // Update carousel
    this._updateCarousel();
    this._removeButtonListeners();
    this._setupButtonListeners();
  }
}

customElements.define('menu-carousel', MenuCarousel);
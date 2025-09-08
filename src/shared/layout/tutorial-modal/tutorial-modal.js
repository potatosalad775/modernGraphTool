import StringLoader from "../../../model/util/string-loader.js";
import { tutorialModalStyles } from "./tutorial-modal.styles.js";

class TutorialModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.isMobile = window.innerWidth < 1000;
    this.os = this.detectOS();
    this.currentStep = 0;
    this.tutorialSteps = [];
    this.tutorialShownKey = "modernGraphToolTutorialShown";
  }

  connectedCallback() {
    const tutorialShown =
      localStorage.getItem(this.tutorialShownKey) === "true";
    if (!tutorialShown) {
      this.updateTutorialSteps();
      this.render();
      StringLoader.addObserver(this.updateLanguage.bind(this));
      // Delay showing the first step slightly to ensure the target element is rendered
      requestAnimationFrame(() => {
        // Double check target element exists before showing
        const firstStepElement = document.querySelector(
          this.tutorialSteps[1].selector // Skips Intro page modal
        );
        if (firstStepElement) {
          this.showStep(this.currentStep);
        } else {
          console.warn(
            "TutorialModal: Could not find element for the first step:",
            this.tutorialSteps[1].selector // Again, skips intro page modal
          );
          // Optionally skip the tutorial or try again later
          this.finishTutorial(false); // Mark as not shown if first element fails
        }
      });
    }
  }

  render() {
    const style = document.createElement("style");
    style.textContent = tutorialModalStyles;
    this.shadowRoot.innerHTML = `
      <div class="overlay-part overlay-top"></div>
      <div class="overlay-part overlay-bottom"></div>
      <div class="overlay-part overlay-left"></div>
      <div class="overlay-part overlay-right"></div>
      <div class="tooltip-modal">
        <div class="tooltip"></div>
        <div class="navigation">
          <button class="prev-btn" disabled>Previous</button>
          <span class="step-indicator"></span>
          <button class="next-btn">Next</button>
          <button class="skip-btn">Skip</button>
        </div>
      </div>
      <div class="page-modal" style="display: none;">
        <div class="page-modal-container">
          <h3 class="page-modal-title"></h3>
          <p class="page-modal-content"></p>
          <button class="page-modal-close-btn"></button>
        </div>
      </div>
    `;
    this.shadowRoot.appendChild(style);

    // Get references to the overlay parts
    this.overlayParts = this.shadowRoot.querySelectorAll(".overlay-part");
    this.overlayTop = this.shadowRoot.querySelector(".overlay-top");
    this.overlayBottom = this.shadowRoot.querySelector(".overlay-bottom");
    this.overlayLeft = this.shadowRoot.querySelector(".overlay-left");
    this.overlayRight = this.shadowRoot.querySelector(".overlay-right");

    this.tooltipModal = this.shadowRoot.querySelector(".tooltip-modal");
    this.tooltipElement = this.shadowRoot.querySelector(".tooltip");
    this.prevBtn = this.shadowRoot.querySelector(".prev-btn");
    this.nextBtn = this.shadowRoot.querySelector(".next-btn");
    this.skipBtn = this.shadowRoot.querySelector(".skip-btn");
    this.stepIndicator = this.shadowRoot.querySelector(".step-indicator");
    this.pageModal = this.shadowRoot.querySelector(".page-modal");
    this.pageTitle = this.shadowRoot.querySelector(".page-modal-title");
    this.pageContent = this.shadowRoot.querySelector(".page-modal-content");
    this.pageCloseBtn = this.shadowRoot.querySelector(".page-modal-close-btn");

    this.prevBtn.addEventListener("click", () => this.prevStep());
    this.nextBtn.addEventListener("click", () => this.nextStep());
    this.skipBtn.addEventListener("click", () => this.finishTutorial(true));
    this.pageCloseBtn.addEventListener("click", () => this.closePageModal());
    // Add click listener to all overlay parts to advance/skip
    this.overlayParts.forEach(part => {
        part.addEventListener('click', () => this.nextStep());
    });
  }

  updateTutorialSteps() {
    this.tutorialSteps = [
      {
        type: "page",
        title: StringLoader.getString("tutorial-modal.intro-title", "Welcome to modernGraphTool"),
        text: StringLoader.getString("tutorial-modal.intro-content",
          "A completely re-engineered, graph-sniffing experience."),
        btnText: StringLoader.getString("tutorial-modal.intro-close-btn", "Next"),
      },
      {
        selector: "menu-carousel",
        text: StringLoader.getString("tutorial-modal.menu-content", 
          "You can slide the menu to the left or right to access the variety of tools."),
        position: "top", // Suggest tooltip position
      },
      {
        selector: ".y-scaler-handle circle", // Target the circle within the handle group
        text: StringLoader.getString("tutorial-modal.graph-handle-content", 
          "You can drag this handle to shift graph vertically. Double click to reset position."),
        position: "left",
      },
    ];
    // Append new step based on UI mode
    if(this.isMobile) {
      if(this.os === "iOS" || this.os === "Android") {
        this.tutorialSteps.push({
          type: "page", // Special step type for the PWA modal
          title: StringLoader.getString("tutorial-modal.pwa-title", "Use as App (PWA)"),
          text: this.getPWAInstruction(),
          btnText: StringLoader.getString("tutorial-modal.pwa-close-btn", "Got It!"),
        });
      }
    } else {
      this.tutorialSteps.push({
        selector: "drag-divider",
        text: StringLoader.getString("tutorial-modal.divider-content", 
          "You can drag this divider to change the size of the graph."),
        position: "left", // Suggest tooltip position
      });
    }
  }

  showStep(index) {
    // Hide page modal if switching back
    this.pageModal.style.display = "none";
    this.tooltipModal.style.display = "flex"; // Ensure main modal is visible
    // Make overlay parts visible
    this.overlayParts.forEach(part => part.style.display = 'block');

    const step = this.tutorialSteps[index];

    if (step.type === "page") {
      this.overlayParts.forEach(part => part.style.display = 'none'); // Hide parts for page modal
      this.showPageModal(step);
      return; // Stop processing normal steps
    }

    const targetElement = document.querySelector(step.selector);

    if (!targetElement) {
      console.warn(
        `TutorialModal: Element not found for step ${index}: ${step.selector}`
      );
      // Skip this step and try the next one
      if (index < this.tutorialSteps.length - 1) {
        this.currentStep++;
        this.showStep(this.currentStep);
      } else {
        this.finishTutorial(true); // Finish if last step element not found
      }
      return;
    }

    targetElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });

    const targetRect = targetElement.getBoundingClientRect();

    // --- Position the four overlay parts ---
    this.overlayTop.style.height = `${targetRect.top}px`;

    this.overlayBottom.style.top = `${targetRect.bottom}px`;
    this.overlayBottom.style.height = `calc(100vh - ${targetRect.bottom}px)`;

    this.overlayLeft.style.top = `${targetRect.top}px`;
    this.overlayLeft.style.height = `${targetRect.height}px`;
    this.overlayLeft.style.width = `${targetRect.left}px`;

    this.overlayRight.style.top = `${targetRect.top}px`;
    this.overlayRight.style.height = `${targetRect.height}px`;
    this.overlayRight.style.left = `${targetRect.right}px`;
    this.overlayRight.style.width = `calc(100vw - ${targetRect.right}px)`;
    // --- End overlay positioning ---

    // Position tooltip (no changes needed here)
    this.tooltipElement.textContent = step.text;
    const modalRect = this.tooltipModal.getBoundingClientRect();

    // Basic positioning logic (can be improved)
    let top, left;
    const offset = 20; // Space between element and tooltip

    switch (step.position) {
      case "top":
        top = targetRect.top - modalRect.height - offset;
        left = targetRect.left + targetRect.width / 2 - modalRect.width / 2;
        break;
      case "bottom":
        top = targetRect.bottom + offset;
        left = targetRect.left + targetRect.width / 2 - modalRect.width / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - modalRect.height / 2;
        left = targetRect.left - modalRect.width - offset;
        break;
      case "right":
      default: // Default to right if not specified or invalid
        top = targetRect.top + targetRect.height / 2 - modalRect.height / 2;
        left = targetRect.right + offset;
        break;
    }

    // Clamp position to viewport
    top = Math.max(
      offset,
      Math.min(top, window.innerHeight - modalRect.height - offset)
    );
    left = Math.max(
      offset,
      Math.min(left, window.innerWidth - modalRect.width - offset)
    );

    this.tooltipModal.style.top = `${top}px`;
    this.tooltipModal.style.left = `${left}px`;

    // Update navigation buttons (no changes needed here)
    this.prevBtn.disabled = index === 0;
    this.nextBtn.textContent =
      index === this.tutorialSteps.length - 1 
      ? StringLoader.getString("tutorial-modal.btn-done", "Done") 
      : StringLoader.getString("tutorial-modal.btn-next", "Next");
    this.stepIndicator.textContent = `${index + 1} / ${
      this.tutorialSteps.length
    }`;
  }

  nextStep() {
    if (this.currentStep < this.tutorialSteps.length - 1) {
      this.currentStep++;
      this.showStep(this.currentStep);
    } else {
      this.finishTutorial(true); // Mark as shown when finishing
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep(this.currentStep);
    }
  }

  finishTutorial(markAsShown) {
    // Hide overlay parts if they exist
    if (this.overlayParts) {
        this.overlayParts.forEach(part => part.style.display = 'none');
    }
    this.shadowRoot.innerHTML = ""; // Clear the modal content

    if (markAsShown) {
      localStorage.setItem(this.tutorialShownKey, "true");
    }
  }

  showPageModal(step) {
    // Hide main tutorial tooltip/nav if it was visible
    this.tooltipModal.style.display = "none";
    this.overlayParts.forEach(part => part.style.display = 'none');

    this.pageTitle.innerText = step.title;
    this.pageContent.innerText = step.text;
    this.pageCloseBtn.innerText = step.btnText;

    this.pageModal.style.display = "flex"; // Show the PWA modal
  }

  closePageModal() {
    this.pageModal.style.display = "none";
    // Decide what happens after closing PWA modal
    // Option 1: Continue tutorial if PWA was a step within it
    if (this.currentStep < this.tutorialSteps.length - 1) {
      this.nextStep();
    } else {
      // Option 2: Finish tutorial if PWA was the last step
      this.finishTutorial(true); // Also mark main tutorial as shown
    }
  }

  getPWAInstruction() {
    const os = this.detectOS();
    let instructions = StringLoader.getString("tutorial-modal.pwa-content", 
      "modernGraphTool is built as a progressive web app (PWA). You can install it to your device for better experience.");
    
    if (os === "iOS") {
      instructions += "\n\n" + StringLoader.getString("tutorial-modal.pwa-inst-ios", 
        "On Safari: Tap the Share button, then select 'Add to Home Screen'.");
    } else if (os === "Android") {
      instructions += "\n\n" + StringLoader.getString("tutorial-modal.pwa-inst-android",
        "On Chrome: Tap the menu button (three dots), then select 'Install app' or 'Add to Home screen'.");
    } else {
      //instructions += "\n\nCheck your browser's menu for an 'Install' or 'Add to Home Screen' option.";
    }

    return instructions;
  }

  updateLanguage() {
    // Update Tutorial Steps
    this.updateTutorialSteps();
    // Update Button innerText
    if(this.prevBtn) this.prevBtn.innerText = StringLoader.getString("tutorial-modal.btn-prev", "Previous");
    if(this.nextBtn) this.nextBtn.innerText = StringLoader.getString("tutorial-modal.btn-next", "Next");
    if(this.skipBtn) this.skipBtn.innerText = StringLoader.getString("tutorial-modal.btn-skip", "Skip");
    if(this.pageCloseBtn) this.pageCloseBtn.innerText = StringLoader.getString("tutorial-modal.intro-close-btn", "Next");
  }

  detectOS() {
    const userAgent = window.navigator.userAgent;
    const platform = window.navigator.platform; // Deprecated but fallback
    const macosPlatforms = ["Macintosh", "MacIntel", "MacPPC", "Mac68K"];
    const windowsPlatforms = ["Win32", "Win64", "Windows", "WinCE"];
    const iosPlatforms = ["iPhone", "iPad", "iPod"];

    if (
      iosPlatforms.indexOf(platform) !== -1 ||
      (userAgent.includes("Mac") && "ontouchend" in document)
    ) {
      // Check for iPad on newer iOS
      return "iOS";
    }
    if (macosPlatforms.indexOf(platform) !== -1) {
      return "MacOS"; // Not typically PWA install target, but good to know
    }
    if (windowsPlatforms.indexOf(platform) !== -1) {
      return "Windows"; // Not typically PWA install target
    }
    if (/Android/.test(userAgent)) {
      return "Android";
    }
    // Add more specific checks if needed (e.g., Linux)
    return "Other";
  }
}

customElements.define("tutorial-modal", TutorialModal);

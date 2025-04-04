import { IconProvider } from "../../styles/icon-provider.js";

class MiscPanel extends HTMLElement {
  constructor() {
    super();

    const displayLangSelector = window.GRAPHTOOL_CONFIG?.LANGUAGE?.ENABLE_I18N;

    this.innerHTML = `
    <div class="menu-panel" id="misc-panel" data-target="misc-panel">
      <div class="misc-row">
        <gt-button class="dark-mode-toggle" title="Toggle dark mode" 
          onclick="document.documentElement.setAttribute(
            'data-theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
          )"
        >
          ${document.documentElement.getAttribute('data-theme') === 'dark' 
            ? IconProvider.Icon('moon', "width: 1.25rem; height: 1.25rem") 
            : IconProvider.Icon('sun', "width: 1.25rem; height: 1.25rem")}
        </gt-button>
        ${displayLangSelector 
          ? `<gt-divider></gt-divider>
            ${IconProvider.Icon('globe', "width: 1.5rem; height: 1.5rem")}
            <language-selector></language-selector>` 
          : ""}
      </div>
      <gt-divider horizontal style="margin: 1rem 0 0.8rem 0;"></gt-divider>
      <div class="misc-info">
        <div class="misc-info-title">
          <h2>modernGraphTool</h2>
          <h4>beta</h4>
        </div>
        <p style="margin-bottom: 0.2rem;">
          Open-source project under the MIT license
        </p>
        <div class="misc-info-button-row">
          <button name="github-button" title="Go to Github Repository"
            onclick="window.open('https://github.com/potatosalad775/modernGraphTool', '_blank')"
          >
            ${IconProvider.Icon('github', "width: 1.5rem; height: 1.5rem")}
          </button>
        </div>
      </div>
    </div>

    <style>
      .misc-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
      }
      .misc-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        margin: 0;
        h4, p {
            margin: 0;
        }
      }
      .misc-info-title {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        h2, h4 {
          margin: 0;
        }
      }
      .misc-info-button-row {
        display: flex;
        button {
          padding: 0;
          border-radius: 2rem;
        }
      }
    </style>
    `;
  }
}

customElements.define("misc-panel", MiscPanel);
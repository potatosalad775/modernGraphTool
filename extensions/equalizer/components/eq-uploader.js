import { StringLoader, DataProvider, FRParser } from "../../../core.min.js";
import { equalizerIcon } from "../equalizer.styles.js";

class EQUploader extends HTMLElement {
  constructor(config = {}) {
    super();

    this.innerHTML = `
      <div class="eq-uploader extra-upload">
        <gt-button class="eu-upload-fr-btn" variant="outlined">
          ${equalizerIcon.getSVG('import', 'width: 1rem; height: 1rem;')}
          ${StringLoader.getString('extension.equalizer.upload.fr', 'Upload FR')}
        </gt-button>
        <gt-button class="eu-upload-target-btn" variant="outlined">
          ${equalizerIcon.getSVG('import', 'width: 1rem; height: 1rem;')}
          ${StringLoader.getString('extension.equalizer.upload.target', 'Upload Target')}
        </gt-button>
      </div>
    `;

    // Create hidden file inputs
    this._createFileInput('phone');
    this._createFileInput('target');
    
    // Add event listeners
    this.querySelector('.eu-upload-fr-btn').addEventListener('click', () => {
      this._handleUpload('phone');
    });
    this.querySelector('.eu-upload-target-btn').addEventListener('click', () => {
      this._handleUpload('target');
    });
    StringLoader.addObserver(this._handleLanguageChange.bind(this));
  }

  _createFileInput(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.hidden = true;
    input.dataset.sourceType = type;
    input.addEventListener('change', (e) => this._parseAndInsertData(e));
    this.appendChild(input);
  }
  
  _handleUpload(sourceType) {
    const input = this.querySelector(`input[data-source-type="${sourceType}"]`);
    input.click();
  }

  async _parseAndInsertData(event) {
    const file = event.target.files[0];
    const sourceType = event.target.dataset.sourceType;
    
    if (!file) return;

    try {
      const rawData = await file.text();
      
      // Parse the FR data using FRParser
      const parsedData = await FRParser.parseFRData(rawData);
      
      // Structure the data based on sourceType
      const channelData = { AVG: parsedData }; // Single channel

      // Insert the parsed data using DataProvider
      await DataProvider.insertRawFRData(
        sourceType,
        file.name.split('.')[0], // Use filename as identifier
        channelData,
        { 
          dispSuffix: 'Uploaded',
          dispChannel: ['AVG']
        }
      );

    } catch (error) {
      console.error('Error processing file:', error);
      alert('Invalid file format. Please check the file structure.');
    } finally {
      event.target.value = ''; // Reset input
    }
  }

  _handleLanguageChange() {
    this.querySelector('.eu-upload-fr-btn').textContent = StringLoader.getString('extension.equalizer.upload.fr', 'Upload FR');
    this.querySelector('.eu-upload-target-btn').textContent = StringLoader.getString('extension.equalizer.upload.target', 'Upload Target');
  }
}

customElements.define('eq-uploader', EQUploader);
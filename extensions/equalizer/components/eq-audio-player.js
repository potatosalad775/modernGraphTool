import { StringLoader } from "../../../core.min.js";
import { equalizerIcon } from "../equalizer.styles.js";

class EQAudioPlayer extends HTMLElement {
  constructor() {
    super();
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.noiseNode = null;
    this.sourceNode = null;
    this.oscillatorNode = null;
    this.filterNodes = [];

    this.isPlaying = false;
    this.isSeeking = false;
    this.seekTimeout = null;
    this.startTime = 0;
    this.pausedAt = 0;
    this.currentTime = 0;

    this.innerHTML = `
      <div class="audio-player">
        <select class="ap-audio-source">
          <option value="">${StringLoader.getString('extension.equalizer.player.option-init', 'Select Audio Source')}</option>
          <option value="white">${StringLoader.getString('extension.equalizer.player.option-white', 'White Noise')}</option>
          <option value="pink">${StringLoader.getString('extension.equalizer.player.option-pink', 'Pink Noise')}</option>
          <option value="tone">${StringLoader.getString('extension.equalizer.player.option-tone', 'Tone Generator')}</option>
          <option value="file">${StringLoader.getString('extension.equalizer.player.option-file', 'Upload Audio File')}</option>
        </select>
        <input type="file" class="ap-file-input" accept="audio/*" style="display: none;">
        <div class="ap-tone-controls" style="display: none;">
          <div class="ap-tone-row">
            <label class="ap-tone-freq-label">${StringLoader.getString('extension.equalizer.player.tone-freq-label', 'Frequency: ')}</label>
            <label><span class="ap-freq-value">1000</span> Hz</label>
          </div>
          <input type="range" class="ap-freq-slider" min="0" max="1000" step="1" value="699">
        </div>
        <div class="ap-file-info" style="display: none;">
          <span class="ap-file-name"></span>
          <div class="ap-time-slider">
            <input type="range" class="ap-position-slider" min="0" max="100" step="0.1" value="0">
          </div>
          <span class="ap-time-info">
            <span class="ap-current-time">0:00</span>
            <span class="ap-total-time">0:00</span>
          </span>
        </div>
        <div class="ap-control">
          <div class="ap-playback-controls">
            <button class="ap-prev-button">${equalizerIcon.getSVG('previous')}</button>
            <button class="ap-play-button">${equalizerIcon.getSVG('play')}</button>
          </div>
          <gt-divider style="width: 2px; margin: 0.1rem 0.5rem"></gt-divider>
          <div class="ap-volume-control">
            <label class="ap-volume-slider-icon">${equalizerIcon.getSVG('volumeFull', 'width: 1rem; height: 1rem;')}</label>
            <input type="range" class="ap-volume-slider" min="0" max="1" step="0.01" value="0.1">
          </div>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this._handleAudioSourceChange = this._handleAudioSourceChange.bind(this);
    this._handleFileInputChange = this._handleFileInputChange.bind(this);
    this._handlePrevBtnClick = this._handlePrevBtnClick.bind(this);
    this._handlePlayBtnClick = this._handlePlayBtnClick.bind(this);
    this._handleFreqSliderChange = this._handleFreqSliderChange.bind(this);
    this._handlePositionSliderMouseDown = this._handlePositionSliderMouseDown.bind(this);
    this._handlePositionSliderMouseUp = this._handlePositionSliderMouseUp.bind(this);
    this._handlePositionSliderInput = this._handlePositionSliderInput.bind(this);
    this._handleVolumeSliderInput = this._handleVolumeSliderInput.bind(this);
    this.querySelector('.ap-audio-source').addEventListener('change', this._handleAudioSourceChange);
    this.querySelector('.ap-file-input').addEventListener('change', this._handleFileInputChange);
    this.querySelector('.ap-prev-button').addEventListener('click', this._handlePrevBtnClick);
    this.querySelector('.ap-play-button').addEventListener('click', this._handlePlayBtnClick);
    this.querySelector('.ap-freq-slider').addEventListener('input', this._handleFreqSliderChange);
    this.querySelector('.ap-position-slider').addEventListener('mousedown', this._handlePositionSliderMouseDown);
    this.querySelector('.ap-position-slider').addEventListener('mouseup', this._handlePositionSliderMouseUp);
    this.querySelector('.ap-position-slider').addEventListener('input', this._handlePositionSliderInput);
    this.querySelector('.ap-volume-slider').addEventListener('input', this._handleVolumeSliderInput);
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  disconnectedCallback() {
    this.stopAudio();
    this.querySelector('.ap-audio-source').removeEventListener('change', this._handleAudioSourceChange);
    this.querySelector('.ap-file-input').removeEventListener('change', this._handleFileInputChange);
    this.querySelector('.ap-prev-button').removeEventListener('click', this._handlePrevBtnClick);
    this.querySelector('.ap-play-button').removeEventListener('click', this._handlePlayBtnClick);
    this.querySelector('.ap-freq-slider').removeEventListener('input', this._handleFreqSliderChange);
    this.querySelector('.ap-position-slider').removeEventListener('mousedown', this._handlePositionSliderMouseDown);
    this.querySelector('.ap-position-slider').removeEventListener('mouseup', this._handlePositionSliderMouseUp);
    this.querySelector('.ap-position-slider').removeEventListener('input', this._handlePositionSliderInput);
    this.querySelector('.ap-volume-slider').removeEventListener('input', this._handleVolumeSliderInput);
    StringLoader.removeObserver(this._updateLanguage.bind(this));
  }

  _handleAudioSourceChange(e) {
    if (this.isPlaying) this.stopAudio();
      this.querySelector('.ap-tone-controls').style.display = 
        e.target.value === 'tone' ? 'flex' : 'none';
      
      if (e.target.value === 'file') {
        this.querySelector('.ap-file-input').click();
      }
  }

  _handleFileInputChange(e) {
    const file = e.target.files[0];
    if (file) {
      this._loadAudioFile(file);
    }
  }

  _handlePrevBtnClick() {
    this.resetAudio();
  }

  _handlePlayBtnClick() {
    if (this.isPlaying) {
      this.pauseAudio();
    } else {
      this.playAudio();
    }
  }

  _handleFreqSliderChange(e) {
    // Convert slider value (0-1000) to frequency (20-20000Hz) using logarithmic scale
    const minFreq = Math.log10(20);
    const maxFreq = Math.log10(20000);
    const scale = (maxFreq - minFreq) / 1000;
    const freq = Math.round(Math.pow(10, minFreq + (e.target.value * scale)));
    
    this.querySelector('.ap-freq-value').textContent = freq;
    if (this.oscillatorNode && this.isPlaying) {
      this.oscillatorNode.frequency.setValueAtTime(freq, this.audioContext.currentTime);
    }
  }

  _handlePositionSliderMouseDown() {
    this.isSeeking = true;
  }

  _handlePositionSliderMouseUp(e) {
    if (!this.audioBuffer) return;
      
    const newTime = (e.target.value / 100) * this.audioBuffer.duration;
    this.seekTo(newTime);
    
    clearTimeout(this.seekTimeout);
    this.seekTimeout = setTimeout(() => {
      this.isSeeking = false;
    }, 200);
  }

  _handlePositionSliderInput(e) {
    if (!this.audioBuffer) return;

    const newTime = (e.target.value / 100) * this.audioBuffer.duration;
    // Only update visual display during sliding
    this.pausedAt = newTime;
    this._updateTimeDisplay();
  }

  _handleVolumeSliderInput(e) {
    this._updateVolume(e.target.value);
    // Update Volume Icon
    if(e.target.value === '0') {
      this.querySelector('.ap-volume-slider-icon').innerHTML = equalizerIcon.getSVG('volumeMute', 'width: 1rem; height: 1rem;');
    } else {
      this.querySelector('.ap-volume-slider-icon').innerHTML = equalizerIcon.getSVG('volumeFull', 'width: 1rem; height: 1rem;');
    }
  }

  _loadAudioFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        this.audioBuffer = await this.audioContext.decodeAudioData(e.target.result);
        
        // Update UI with file info
        this.querySelector('.ap-file-info').style.display = 'flex';
        this.querySelector('.ap-file-name').textContent = file.name;
        this.querySelector('.ap-total-time').textContent = this._formatTime(this.audioBuffer.duration);
        this.pausedAt = 0;
        this._updateTimeDisplay();
      } catch (err) {
        console.error('Error loading audio file:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  _createAndStartAudioSource(startFrom = this.pausedAt) {
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.start(0, startFrom);

    // Maintain existing filter chain
    if (this.filterNodes.length > 0) {
      this.sourceNode.connect(this.filterNodes[0]);
    } else {
      this.sourceNode.connect(this.gainNode);
    }

    this.sourceNode.onended = () => {
      // Only handle end of audio if we're not seeking and actually playing
      if (this.isPlaying && !this.isSeeking) {
        this.pausedAt = 0;
        this.isPlaying = false;
        this.querySelector('.ap-play-button').innerHTML = equalizerIcon.getSVG('play');
        this._updateTimeDisplay();
      }
    };
  }

  _createNoiseNode(type) {
    const bufferSize = 2 * this.audioContext.sampleRate;
    const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }
    }

    const noiseNode = this.audioContext.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    return noiseNode;
  }

  _createToneGenerator() {
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    
    // Convert initial slider value to frequency
    const minFreq = Math.log10(20);
    const maxFreq = Math.log10(20000);
    const scale = (maxFreq - minFreq) / 1000;
    const sliderValue = this.querySelector('.ap-freq-slider').value;
    const freq = Math.round(Math.pow(10, minFreq + (sliderValue * scale)));
    
    oscillator.frequency.value = freq;
    return oscillator;
  }

  updateFilters(filters) {
    // Remove existing filters
    this.filterNodes.forEach(node => node.disconnect());
    this.filterNodes = [];

    if (!this.sourceNode) return;

    let lastNode = this.sourceNode;

    // Create preamp gain node
    const preampNode = this.audioContext.createGain();
    preampNode.gain.value = Math.pow(10, filters.preamp / 20); // Convert dB to linear gain
    lastNode.connect(preampNode);
    lastNode = preampNode;
    this.filterNodes.push(preampNode);

    // Create and connect new filters
    filters.filters.forEach(filter => {
      const filterNode = this.audioContext.createBiquadFilter();
      
      switch (filter.type) {
        case 'PK':
          filterNode.type = 'peaking';
          break;
        case 'LSQ':
          filterNode.type = 'lowshelf';
          break;
        case 'HSQ':
          filterNode.type = 'highshelf';
          break;
      }

      filterNode.frequency.value = filter.freq;
      filterNode.Q.value = filter.q;
      filterNode.gain.value = filter.gain;

      lastNode.connect(filterNode);
      lastNode = filterNode;
      this.filterNodes.push(filterNode);
    });

    // Connect the last node to the destination
    lastNode.connect(this.gainNode);
  }

  playAudio() {
    const sourceType = this.querySelector('.ap-audio-source').value;
    if (!sourceType) return;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.oscillatorNode) {
      this.oscillatorNode.disconnect();
      this.oscillatorNode = null;
    }

    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.querySelector('.ap-volume-slider').value;
    }

    if (sourceType === 'white' || sourceType === 'pink') {
      this.sourceNode = this._createNoiseNode(sourceType);
      this.sourceNode.start();
    } else if (sourceType === 'tone') {
      this.oscillatorNode = this._createToneGenerator();
      if (this.filterNodes.length > 0) {
        this.oscillatorNode.connect(this.filterNodes[0]);
      } else {
        this.oscillatorNode.connect(this.gainNode);
      }
      this.oscillatorNode.start();
    } else if (sourceType === 'file' && this.audioBuffer) {
      this._createAndStartAudioSource();
    } else {
      return;
    }

    this.startTime = this.audioContext.currentTime;
    this.isPlaying = true;
    this.querySelector('.ap-play-button').innerHTML = equalizerIcon.getSVG('pause');
    
    if (sourceType === 'file') {
      this._updateTimeDisplay();
    }
  }

  resetAudio() {
    if (this.isPlaying) {
      this.stopAudio();
    }
    this.pausedAt = 0;
    this._updateTimeDisplay();
    this.playAudio();
  }

  pauseAudio() {
    if (!this.isPlaying) return;

    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode.disconnect();
    }
    if (this.oscillatorNode) {
      this.oscillatorNode.stop();
      this.oscillatorNode.disconnect();
    }

    this.pausedAt += this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;
    this.querySelector('.ap-play-button').innerHTML = equalizerIcon.getSVG('play');
  }

  stopAudio() {
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.oscillatorNode) {
      this.oscillatorNode.stop();
      this.oscillatorNode.disconnect();
      this.oscillatorNode = null;
    }
    this.isPlaying = false;
    this.querySelector('.ap-play-button').innerHTML = equalizerIcon.getSVG('play');
  }

  seekTo(newTime) {
    if (!this.audioBuffer) return;
    
    if (this.isPlaying) {
      this.sourceNode.stop();
      this._createAndStartAudioSource(newTime);
      this.startTime = this.audioContext.currentTime;
      this.pausedAt = newTime;
      this.querySelector('.ap-play-button').innerHTML = equalizerIcon.getSVG('pause');
    } else {
      this.pausedAt = newTime;
      this._updateTimeDisplay();
    }
  }

  _updateVolume(value) {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  _formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  _updateTimeDisplay() {
    if (!this.audioBuffer) return;
    
    let currentTime;
    if (this.isPlaying) {
      currentTime = Math.min(
        this.audioContext.currentTime - this.startTime + this.pausedAt,
        this.audioBuffer.duration
      );
    } else {
      currentTime = this.pausedAt;
    }
    
    this.querySelector('.ap-current-time').textContent = this._formatTime(currentTime);
    this.querySelector('.ap-position-slider').value = (currentTime / this.audioBuffer.duration) * 100;

    if (this.isPlaying) {
      requestAnimationFrame(() => this._updateTimeDisplay());
    }
  }

  _updateLanguage() {
    this.querySelector('.ap-audio-source > option[value=""]').innerHTML = StringLoader.getString('extension.equalizer.player.option-init', 'Select Audio Source')
    this.querySelector('.ap-audio-source > option[value="white"]').innerHTML = StringLoader.getString('extension.equalizer.player.option-white', 'White Noise')
    this.querySelector('.ap-audio-source > option[value="pink"]').innerHTML = StringLoader.getString('extension.equalizer.player.option-pink', 'Pink Noise')
    this.querySelector('.ap-audio-source > option[value="tone"]').innerHTML = StringLoader.getString('extension.equalizer.player.option-tone', 'Tone Generator')
    this.querySelector('.ap-audio-source > option[value="file"]').innerHTML = StringLoader.getString('extension.equalizer.player.option-file', 'Upload Audio File')
    this.querySelector('.ap-tone-freq-label').innerHTML = StringLoader.getString('extension.equalizer.player.tone-freq-label', 'Frequency: ');
  }
}

customElements.define('eq-audio-player', EQAudioPlayer);
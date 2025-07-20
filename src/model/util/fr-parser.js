import ConfigGetter from "./config-getter.js";

/**
 * @typedef {import('../../types/data-types.js').FRDataType} FRDataType
 * @typedef {import('../../types/data-types.js').FRDataPoint} FRDataPoint
 * @typedef {import('../../types/data-types.js').ChannelData} ChannelData
 * @typedef {import('../../types/data-types.js').ParsedFRData} ParsedFRData
 * @typedef {import('../../types/data-types.js').PhoneFileReference} PhoneFileReference
 * @typedef {import('../../types/data-types.js').PhoneMetadata} PhoneMetadata
 * @typedef {import('../../types/data-types.js').TargetMetadata} TargetMetadata
 * @typedef {import('../../types/data-types.js').ValidationResult} ValidationResult
 */

/**
 * Frequency Response Parser
 * Handles parsing and processing of frequency response measurement files
 */
const FRParser = {
  _standardFrequencies: (function() {
    const frequencies = [20];
    const step = Math.pow(2, 1/48); // 1/48 octave steps
    while (frequencies[frequencies.length-1] < 20000) {
      frequencies.push(frequencies[frequencies.length-1] * step);
    }
    return frequencies;
  })(),

  /**
   * Get frequency response data in structured array format
   * @param {FRDataType} sourceType - Type of source (phone or target)
   * @param {PhoneFileReference|string} files - File name or object containing file names
   * @returns {Promise<ParsedFRData>} Structured FR data with metadata
   */
  async getFRDataFromFile(sourceType, files) {
    const isPhoneData = sourceType === 'phone';
    const channels = isPhoneData ? ["L", "R"] : ["AVG"];

    /** @type {ParsedFRData} */
    const parsedChannels = {};
    
    // Process each channel
    await Promise.all(
      channels.map(async (channel) => {
        let filename;
        if (isPhoneData) {
          const phoneFiles = /** @type {PhoneFileReference} */(files);
          filename = channel === 'L' ? phoneFiles.L : phoneFiles.R;
        } else {
          filename = /** @type {string} */(files);
        }
        
        try {
          const rawData = await this._fetchFRTextData(
            isPhoneData ? "phone" : "target",
            filename,
          );
          if(rawData) {
            parsedChannels[channel] = await this.parseFRData(rawData);
          }
        } catch (error) {
          console.error(`Failed to process ${filename} ${channel} channel:`, error);
          //parsedChannels[channel] = null;
        }
      })
    );

    // Add AVG channel for phone data if both L/R are available
    if (isPhoneData && parsedChannels.L && parsedChannels.R) {
      const leftData = parsedChannels.L.data;
      const rightData = parsedChannels.R.data;
      
      parsedChannels.AVG = {
        data: leftData.map(([freq, lDb], index) => [
          freq,
          (lDb + rightData[index][1]) / 2
        ]),
        metadata: { ...parsedChannels.L.metadata }
      };
    }

    // Return structure matching input type
    return parsedChannels;
  },

  /**
   * Get frequency response data in structured array format
   * @param {FRDataType} sourceType - Type of source (phone or target)
   * @param {PhoneMetadata|TargetMetadata|undefined} metaData - metadata of FR Data
   * @param {string?} suffix - suffix of (possibly phone) FR Data
   * @returns {Promise<ParsedFRData>} Structured FR data with metadata
   */
  async getFRDataFromMetadata(sourceType, metaData, suffix = "") {
    try {
      // Return first variant if suffix is not specified
      if (suffix === "") {
        const phoneMetaData = /** @type {PhoneMetadata} */(metaData);
        return await FRParser.getFRDataFromFile(sourceType, phoneMetaData.files[0].files);
      } 
      // Return specific variant if suffix is specified
      else {
        const phoneMetaData = /** @type {PhoneMetadata} */(metaData);
        const matchingFile = phoneMetaData.files.find(file => file.suffix === suffix);
        if (!matchingFile) {
          throw new Error(`No file found with suffix: ${suffix}`);
        }
        return await FRParser.getFRDataFromFile(sourceType, matchingFile.files);
      }
    } catch (e) {
      throw new Error(`Invalid FR file type: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /**
   * Convert raw frequency response text data to structured format
   * @param {string} rawData - Raw content from FR measurement file
   * @returns {Promise<ChannelData>} Structured FR data with metadata
   */
  async parseFRData(rawData) {
    const lines = rawData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    // Improved data extraction with header detection
    const parsed = lines.reduce(
      (acc, line, idx) => {
        const parts = line.split(/[\s,]+/).filter((p) => p !== "");

        // Skip lines with insufficient data or non-numeric values
        if (parts.length < 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
          //console.warn(`Skipping invalid line ${idx + 1}: ${line}`);
          return acc;
        }

        const freq = this._parseFrequency(parts[0]);
        const db = parseFloat(parts[1]);
        const weight = parts[2] ? parseFloat(parts[2]) : null;

        if (this._isValidDataPoint(freq, db)) {
          acc.data.push([freq, db]);
          if (weight !== null) acc.metadata.weights.push(weight);
        }
        return acc;
      },
      /** @type {ChannelData} */({
        data: [],
        metadata: {
          weights: [],
          minFreq: Infinity,
          maxFreq: -Infinity,
        },
      })
    );

    if(parsed.data.length !== 0) {
      // Sort data by frequency
      parsed.data.sort((a, b) => a[0] - b[0]);
  
      // Interpolate to standard frequencies (1/48oct)
      parsed.data = this._interpolateToStandard(parsed.data);
  
      // Update metadata with standard frequency range
      parsed.metadata.minFreq = this._standardFrequencies[0];
      parsed.metadata.maxFreq = this._standardFrequencies[this._standardFrequencies.length - 1];
    }

    return parsed;
  },

  /**
   * Fetch raw frequency response text data from a file
   * @param {FRDataType} sourceType - Type of source (phone or target)
   * @param {string} fileName - Name of the file
   * @returns {Promise<string|null>} Raw content from FR measurement file
   */
  async _fetchFRTextData(sourceType, fileName) {
    const basePath =
      sourceType === "phone"
        ? `${ConfigGetter.get('PATH.PHONE_MEASUREMENT')}` +
          `${ConfigGetter.get('PATH.PHONE_MEASUREMENT').endsWith('/') ? '' : '/'}` +
          `${fileName}`
        : `${ConfigGetter.get('PATH.TARGET_MEASUREMENT')}` +
          `${ConfigGetter.get('PATH.TARGET_MEASUREMENT').endsWith('/') ? '' : '/'}` +
          `${fileName}`;

    try {
      const response = await fetch(basePath);
      if (!response.ok) {
        //console.error(`Failed to load ${sourceType}: ${response.status}`);
        return null;
      }
      return await response.text();
    } catch (error) {
      console.error(`Failed to load ${sourceType}: ${fileName}`, error);
      return null;
    }
  },

  /**
   * Improved frequency parsing with unit detection
   * @param {string} value - Frequency value string
   * @returns {number} Parsed frequency in Hz
   */
  _parseFrequency(value) {
    const num = parseFloat(value);
    if (value.toLowerCase().includes("k")) return num * 1000;
    return num;
  },

  /**
   * Add interpolation helper
   * @param {FRDataPoint[]} rawData - Raw frequency response data
   * @returns {FRDataPoint[]} Interpolated data points
   */
  _interpolateToStandard(rawData) {
    return this._standardFrequencies.map(targetFreq => {
      // Find surrounding points in raw data
      const index = rawData.findIndex(([freq]) => freq > targetFreq);
      
      if (index === -1) {
        // If beyond last point, return last value
        const lastPoint = rawData[rawData.length - 1];
        return /** @type {FRDataPoint} */([targetFreq, lastPoint[1]]);
      } else if (index === 0) {
        // If before first point, return first value
        const firstPoint = rawData[0];
        return /** @type {FRDataPoint} */([targetFreq, firstPoint[1]]);
      } else {
        // Interpolate between points
        const [freq1, db1] = rawData[index - 1];
        const [freq2, db2] = rawData[index];
        const ratio = (targetFreq - freq1) / (freq2 - freq1);
        const interpolatedDb = db1 + (db2 - db1) * ratio;
        return /** @type {FRDataPoint} */([targetFreq, interpolatedDb]);
      }
    });
  },

  /**
   * Enhanced validation with frequency range checks
   * @param {number} freq - Frequency value
   * @param {number} db - Amplitude value
   * @returns {boolean} Whether the data point is valid
   */
  _isValidDataPoint(freq, db) {
    return (
      Number.isFinite(freq) &&
      Number.isFinite(db) &&
      freq >= 20 &&
      freq <= 20000 &&
      db >= -40 &&
      db <= 120
    );
  },
};

export default FRParser;

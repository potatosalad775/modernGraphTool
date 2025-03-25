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
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string | Object} file - File name or object containing file names
   * @returns {Promise<Array>} Structured FR data with metadata
   */
  async getFRDataFromFile(sourceType, files) {
    const isPhoneData = sourceType === 'phone';
    const channels = isPhoneData ? ["L", "R"] : ["AVG"];

    const parsedChannels = {};
    
    // Process each channel
    await Promise.all(
      channels.map(async (channel) => {
        const filename = isPhoneData ? files[channel] : files;
        try {
          const rawData = await this._fetchFRTextData(
            isPhoneData ? "phone" : "target",
            filename,
          );
          if(rawData) {
            parsedChannels[channel] = await this._parseFRData(rawData);
          }
        } catch (error) {
          console.error(`Failed to process ${filename} ${channel} channel:`, error);
          //parsedChannels[channel] = null;
        }
      })
    );

    // Add AVG channel for phone data if both L/R are available
    if (isPhoneData && parsedChannels.L && parsedChannels.R) {
      parsedChannels.AVG = {
        data: parsedChannels.L.data.map(([freq, lDb], index) => [
          freq,
          (lDb + parsedChannels.R.data[index][1]) / 2
        ]),
        metadata: { ...parsedChannels.L.metadata }
      };
    }

    // Return structure matching input type
    return parsedChannels;
  },

  /**
   * Get frequency response data in structured array format
   * @param {string} sourceType - Type of source (phone or target)
   * @param {Object} metaData - metadata of FR Data
   * @param {string} suffix - suffix of (possibly phone) FR Data
   * @returns {Promise<Array>} Structured FR data with metadata
   */
  async getFRDataFromMetadata(sourceType, metaData, suffix = "") {
    try {
      // Return first variant if suffix is not specified
      if (suffix === "") {
        return await FRParser.getFRDataFromFile(sourceType, metaData.files[0].fileName);
      } 
      // Return specific variant if suffix is specified
      else {
        const matchingFile = metaData.files.find(file => file.suffix === suffix);
        if (!matchingFile) {
          throw new Error(`No file found with suffix: ${suffix}`);
        }
        return await FRParser.getFRDataFromFile(sourceType, matchingFile.fileName);
      }
    } catch (e) {
      throw new Error("Invalid FR file type: ", e);
    }
  },

  /**
   * Convert raw frequency response text data to structured format
   * @param {string} rawData - Raw content from FR measurement file
   * @returns {Promise<Object>} Structured FR data with metadata
   */
  async _parseFRData(rawData) {
    const lines = rawData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    // Improved data extraction with header detection
    const parsed = lines.reduce(
      (acc, line, idx) => {
        const parts = line.split(/[\s,]+/).filter((p) => p !== "");

        // Skip lines with insufficient data or non-numeric values
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
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
      {
        data: [],
        metadata: {
          weights: [],
          minFreq: Infinity,
          maxFreq: -Infinity,
        },
      }
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
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string} fileName - Name of the file
   * @returns {Promise<string>} Raw content from FR measurement file
   */
  async _fetchFRTextData(sourceType, fileName) {
    const basePath =
      sourceType === "phone"
        ? `${window.GRAPHTOOL_CONFIG.PATH.PHONE_MEASUREMENT}` +
          `${window.GRAPHTOOL_CONFIG.PATH.PHONE_MEASUREMENT.endsWith('/') ? '' : '/'}` +
          `${fileName}`
        : `${window.GRAPHTOOL_CONFIG.PATH.TARGET_MEASUREMENT}` +
          `${window.GRAPHTOOL_CONFIG.PATH.TARGET_MEASUREMENT.endsWith('/') ? '' : '/'}` +
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

  /** Improved frequency parsing with unit detection */
  _parseFrequency(value) {
    const num = parseFloat(value);
    if (value.toLowerCase().includes("k")) return num * 1000;
    return num;
  },

  // Add interpolation helper
  _interpolateToStandard(rawData) {
    return this._standardFrequencies.map(targetFreq => {
      // Find surrounding points in raw data
      const index = rawData.findIndex(([freq]) => freq > targetFreq);
      
      if (index === -1) {
        // If beyond last point, return last value
        return [targetFreq, rawData[rawData.length - 1][1]];
      } else if (index === 0) {
        // If before first point, return first value
        return [targetFreq, rawData[0][1]];
      } else {
        // Interpolate between points
        const [freq1, db1] = rawData[index - 1];
        const [freq2, db2] = rawData[index];
        const ratio = (targetFreq - freq1) / (freq2 - freq1);
        const interpolatedDb = db1 + (db2 - db1) * ratio;
        return [targetFreq, interpolatedDb];
      }
    });
  },

  /** Enhanced validation with frequency range checks */
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

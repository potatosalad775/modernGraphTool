import CoreEvent from "../../core-event.js";
import ConfigGetter from "./config-getter.js";

/**
 * @typedef {import('../../types/data-types.js').ChannelData} ChannelData
 * @typedef {import('../../types/data-types.js').ParsedFRData} ParsedFRData
 * @typedef {import('../../types/data-types.js').FRDataPoint} FRDataPoint
 */

/**
 * Frequency Response Normalizer
 * Handles normalization of frequency response data based on configuration settings
 */
class FRNormalizer {
  constructor() {
    /** @type {string[]} */
    this.typeList = ["Hz", "Avg"];
    /** @type {string} */
    this.type = ConfigGetter.get('NORMALIZATION.TYPE') || "Hz";
    /** @type {number} */
    this.Hzvalue = ConfigGetter.get('NORMALIZATION.HZ_VALUE') || 500;
  }

  /** Initialize FRNormalizer
   * @param {import('../data-provider.js').default} dataProvider - Data provider instance to use for normalization
   */
  init(dataProvider) {
    this.dataProvider = dataProvider;
  }

  /**
   * Normalize FR data with safety checks and error recovery
   * @param {ChannelData} channelData - Parsed FR data from FRParser
   * @returns {ChannelData} Normalized copy of FR data
   */
  normalize(channelData) {
    if (!channelData?.data?.length) {
      console.error("Invalid FR data:", channelData);
      throw new Error("Cannot normalize - invalid data structure");
    }

    // Ensure channelData is a deep copy to avoid modifying original data
    const normalized = this._deepCopyChannelData(channelData);

    try {
      return this.type === "Hz"
        ? this._normalizeByHz(normalized, this.Hzvalue)
        : this._normalizeByAvg(normalized, 0);
    } catch (e) {
      console.error("Normalization failed:", e);
      return channelData; // Return original on failure
    }
  }

  /**
   * Re-normalize all FR data with current normalization settings
   * @returns {Promise<void>}
   */
  async updateNormalization() {
    const newMap = new Map();
    if (!this.dataProvider || !this.dataProvider.getFRDataMap) {
      console.error("DataProvider not initialized or missing getFRDataMap method");
      return;
    }
    const entries = this.dataProvider.getFRDataMap();
    const updatedEntries = await Promise.all(
      Array.from(entries || []).map(async ([uuid, frObject]) => {
        try {
          // Use current data instead of fresh file data
          const normalizedData = this.normalizeChannels(frObject.channels);

          return [
            uuid,
            {
              ...frObject,
              channels:
                frObject.type === "target"
                  ? {
                      ...(normalizedData["AVG"] && {
                        AVG: normalizedData["AVG"],
                      }),
                    }
                  : {
                      ...(normalizedData["L"] && { L: normalizedData["L"] }),
                      ...(normalizedData["R"] && { R: normalizedData["R"] }),
                      ...(normalizedData["AVG"] && {
                        AVG: normalizedData["AVG"],
                      }),
                    },
              dispChannel: [...frObject.dispChannel],
            },
          ];
        } catch (error) {
          console.error("Failed to re-normalize", uuid, error);
          return [uuid, frObject];
        }
      })
    );

    updatedEntries.forEach(([uuid, data]) => newMap.set(uuid, data));
    this.dataProvider.frDataMap = newMap;
    CoreEvent.dispatchEvent("fr-normalized");
  }

  /**
   * Get normalized data based on rawData
   * @param {ParsedFRData} rawData - Parsed FR data from FRParser
   * @returns {ParsedFRData} Normalized FR data with channels
   */
  normalizeChannels(rawData) {
    // Process each channel
    const normalizedData = {};
    for (const channel of ["L", "R", "AVG"]) {
      if (rawData[channel] && rawData[channel].data && rawData[channel].data.length) {
        normalizedData[channel] = this.normalize(rawData[channel]);
      }
    }
    return normalizedData;
  }

  /**
   * Update Normalization Type
   * @param {string} type
   * @returns
   */
  updateNormalizationType(type) {
    if (this.typeList.includes(type)) {
      this.type = type;
      return;
    } else {
      throw Error("Wrong Type");
    }
  }

  /**
   * Update Normalization Value
   * @param {string} type
   * @param {string | number} value
   * @returns
   */
  updateNormalizationValue(type, value) {
    if (!this.typeList.includes(type)) {
      throw Error("Wrong Type");
    }
    this.Hzvalue = Math.max(20, Math.min(20000, Number(value)));
  }

  /** Hz normalization with interpolation
   * @param {ChannelData} data - Parsed FR data
   * @param {number} targetHz - Target frequency in Hz
   * @return {ChannelData} Normalized FR data
   * @private
  */
  _normalizeByHz(data, targetHz) {
    const targetFreq = Math.max(20, Math.min(20000, Number(targetHz)));
    const reference = this._findNearestFrequency(data.data, targetFreq);

    if (!reference) {
      throw new Error(`No data near ${targetHz}Hz`);
    }

    const delta = -reference[1];
    data.data.forEach((point) => {
      point[1] = this._clampDB(point[1] + delta);
    });
    return data;
  }

  /** Midrange Average Normalization
   * @param {ChannelData} data - Parsed FR data
   * @param {number} targetDB - Target dB level for normalization
   * @return {ChannelData} Normalized FR data
   * @private
   */
  _normalizeByAvg(data, targetDB) {
    const midLow = 300;
    const midHigh = 3000;
    const midrange = data.data.filter((p) => p[0] >= midLow && p[0] <= midHigh);

    if (midrange.length < 3) {
      throw new Error("Insufficient midrange data for normalization");
    }

    const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
    const delta = targetDB - avg;

    data.data.forEach((point) => {
      point[1] = this._clampDB(point[1] + delta);
    });
    return data;
  }

  /** Safer deep copy implementation 
   * @param {ChannelData} channelData - Object to deep copy
   * @returns {ChannelData} Deep copied object
   * @private
  */
  _deepCopyChannelData(channelData) {
    return JSON.parse(JSON.stringify(channelData));
  }

  /** Clamp dB values to safe range
   * @param {number} value - dB value to clamp
   * @returns {number} Clamped dB value
   * @private
  */
  _clampDB(value) {
    return Math.max(-40, Math.min(120, Number(value.toFixed(2))));
  }

  /** Calculate average dB with outlier protection
   * @param {FRDataPoint[]} points - Array of data points
   * @returns {number} Average dB value
   * @private
  */
  _calculateAverageDB(points) {
    const values = points.map((p) => p[1]).sort((a, b) => a - b);
    // Trim 10% from both ends to remove outliers
    const trimCount = Math.floor(values.length * 0.1);
    const trimmed = values.slice(trimCount, -trimCount);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }

  /** Improved frequency search with logarithmic interpolation
   * @param {FRDataPoint[]} points - Array of data points
   * @param {number} targetHz - Target frequency in Hz
   * @returns {FRDataPoint} Nearest frequency point
   * @private
  */
  _findNearestFrequency(points, targetHz) {
    const index = points.findIndex((p) => p[0] >= targetHz);
    if (index === -1) return points[points.length - 1];
    if (index === 0) return points[0];

    // Logarithmic interpolation for better accuracy
    const [f0, db0] = points[index - 1];
    const [f1, db1] = points[index];
    const t =
      (Math.log(targetHz) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
    return [targetHz, db0 + t * (db1 - db0)];
  }

  /**
   * Get the singleton instance of FRNormalizer
   * @returns {FRNormalizer} Singleton instance of FRNormalizer
   */
  static getInstance() {
    if(!FRNormalizer._instance) {
      FRNormalizer._instance = new FRNormalizer();
    }
    return FRNormalizer._instance;
  }
}

/** @type {FRNormalizer|null} */
FRNormalizer._instance = null;

export default FRNormalizer.getInstance();

import CoreEvent from "../../core-event.js";
import ConfigGetter from "./config-getter.js";

class FRNormalizer {
  constructor() {
    this.typeList = ["Hz", "Avg"];
    this.type = ConfigGetter.get('NORMALIZATION.TYPE') || "Hz";
    this.Hzvalue = ConfigGetter.get('NORMALIZATION.HZ_VALUE') || 500;
  }

  init(dataProvider) {
    this.dataProvider = dataProvider;
  }

  /**
   * Normalize FR data with safety checks and error recovery
   * @param {Object} frData - Parsed FR data from FRParser
   * @returns {Object} Normalized copy of FR data
   */
  normalize(frData) {
    if (!frData?.data?.length) {
      console.error("Invalid FR data:", frData);
      throw new Error("Cannot normalize - invalid data structure");
    }

    const normalized = this._deepCopy(frData);

    try {
      return this.type === "Hz"
        ? this._normalizeByHz(normalized, this.Hzvalue)
        : this._normalizeByAvg(normalized, 0);
    } catch (e) {
      console.error("Normalization failed:", e);
      return frData; // Return original on failure
    }
  }

  /**
   * Re-normalize all FR data with current normalization settings
   * @returns {Promise<void>}
   */
  async updateNormalization() {
    const newMap = new Map();

    const entries = Array.from(this.dataProvider.getFRDataMap());
    const updatedEntries = await Promise.all(
      entries.map(async ([uuid, frObject]) => {
        try {
          // Use current data instead of fresh file data
          const normalizedData = this.getNormalizedData(frObject.channels);

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
   * @param {Object} rawData - Parsed FR data from FRParser
   * @returns
   */
  getNormalizedData(rawData) {
    // Process each channel
    const normalizedData = {};
    for (const channel of ["L", "R", "AVG"]) {
      if (rawData[channel]) {
        const normalized = this.normalize(rawData[channel]);
        normalizedData[channel] = normalized;
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

    if (type === "dB") {
      FRNormalizer.dBvalue = Math.max(0, Math.min(100, value));
    } else {
      FRNormalizer.Hzvalue = Math.max(20, Math.min(20000, value));
    }
  }

  /** Improved dB normalization with range clamping */
  _normalizeByDB(data, targetDB) {
    const validTarget = Math.max(-40, Math.min(120, targetDB));
    const delta = validTarget - this._calculateAverageDB(data.data);

    data.data.forEach((point) => {
      point[1] = this._clampDB(point[1] + delta);
    });
    data.metadata.normalizedToDB = validTarget;
    return data;
  }

  /** Enhanced Hz normalization with interpolation */
  _normalizeByHz(data, targetHz) {
    const targetFreq = Math.max(20, Math.min(20000, targetHz));
    const reference = this._findNearestFrequency(data.data, targetFreq);

    if (!reference) {
      throw new Error(`No data near ${targetHz}Hz`);
    }

    const delta = -reference[1];
    data.data.forEach((point) => {
      point[1] = this._clampDB(point[1] + delta);
    });
    data.metadata.normalizedToHz = targetFreq;
    return data;
  }

  /* Midrange Average Normalization */
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

    data.metadata.normalizedToDB = targetDB;
    return data;
  }

  /** Safer deep copy implementation */
  _deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Clamp dB values to safe range */
  _clampDB(value) {
    return Math.max(-40, Math.min(120, Number(value.toFixed(2))));
  }

  /** Calculate average dB with outlier protection */
  _calculateAverageDB(points) {
    const values = points.map((p) => p[1]).sort((a, b) => a - b);
    // Trim 10% from both ends to remove outliers
    const trimCount = Math.floor(values.length * 0.1);
    const trimmed = values.slice(trimCount, -trimCount);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }

  /** Improved frequency search with logarithmic interpolation */
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

  static getInstance() {
    if(!FRNormalizer.instance) {
      FRNormalizer.instance = new FRNormalizer();
    }
    return FRNormalizer.instance;
  }
}

export default FRNormalizer.getInstance();

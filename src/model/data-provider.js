import FRParser from "./util/fr-parser.js";
import RenderEngine from "../ui/visualization/render-engine.js";
import MetadataParser from "./util/metadata-parser.js";
import FRNormalizer from "./util/fr-normalizer.js";
import FRSmoother from "./util/fr-smoother.js";
import ConfigGetter from "./util/config-getter.js";

class DataProvider {
  constructor() {
    this.frDataMap = new Map();
    this.baseHue = null; // base Hue value for color generation
  };
  
  init(coreEvent) {
    this.coreEvent = coreEvent;
    FRNormalizer.init(this);

    this.addEventListeners();
  };

  addEventListeners() {
    window.addEventListener("core:fr-phone-added", this.updateChannels.bind(this));
    window.addEventListener("core:fr-target-added", this.updateChannels.bind(this));
    window.addEventListener("core:fr-unknown-inserted", this.updateChannels.bind(this));
  }

  /**
   * Add Frequency Response Data Object to frDataMap
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string} identifier - Identifier of the source (phone or target name)
   * @param {object?} inputMetadata - custom metadata attribute of the phone source
   * @returns {Promise<void>}
   */
  async addFRData(sourceType, identifier, inputMetadata = {}) {
    if (this.isFRDataLoaded(identifier, inputMetadata?.dispSuffix || null)) {
      //throw new Error("FR data already loaded");
      return;
    }

    // Get FR Metadata
    const metaData = await MetadataParser.getFRMetadata(sourceType, identifier);
    // Get FR Data in structured format
    const rawData = await FRParser.getFRDataFromMetadata(
      sourceType,
      metaData,
      inputMetadata?.dispSuffix
    );
    // Apply Smoothing
    const smoothedData = FRSmoother.smoothChannels(rawData);
    // Normalize each channel
    const normalizedData = FRNormalizer.normalizeChannels(smoothedData);

    // Create FR Object
    const frObject = {
      uuid: crypto.randomUUID(),
      type: sourceType,
      identifier: metaData?.identifier,
      channels:
        sourceType === "phone"
          ? {
              ...(normalizedData["L"] && { L: normalizedData["L"] }),
              ...(normalizedData["R"] && { R: normalizedData["R"] }),
              ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
            }
          : {
              ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
            },
      dispChannel: this._getChannelValue(sourceType, Object.keys(normalizedData)),
      dispSuffix:
        metaData.files.length > 1
          ? inputMetadata?.dispSuffix
            ? inputMetadata?.dispSuffix
            : metaData.files[0]?.suffix
          : "",
      colors: this._getColorWithType(sourceType),
      dash: this._getDashWithType(sourceType, metaData?.identifier),
      meta: metaData,
    };

    // Add FR Object to frDataMap
    this.frDataMap.set(frObject.uuid, frObject);

    // Dispatch 'FR Added' Event
    this.coreEvent.dispatchEvent(`fr-${sourceType}-added`, {
      uuid: frObject.uuid,
      identifier: metaData?.identifier,
    });
  };

  /**
   * Remove Frequency Response Data Object from frDataMap
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string} identifier - Identifier of the phone
   * @returns {void}
   */
  removeFRData(sourceType, identifier) {
    const targetEntry = Array.from(this.frDataMap).find(
      ([, c]) => c.identifier === identifier
    );
    if (targetEntry) {
      const [uuid] = targetEntry;
      this.frDataMap.delete(uuid);

      const eventType = ["phone", "target"].includes(sourceType)
        ? `fr-${sourceType}-removed`
        : "fr-unknown-removed";

      this.coreEvent.dispatchEvent(eventType, {
        uuid: uuid,
        identifier: targetEntry[1].identifier,
      });
    }
  };

  /**
   * Insert Processed Raw Data to frDataMap
   * @param {string} sourceType - Type of data (phone or target)
   * @param {string} identifier - Identifier of the data (phone or target name)
   * @param {Array} rawData - processed rawData to be inserted
   * @param {object?} inputMetadata - custom metadata attribute of the phone source
   * @returns {Promise<void>}
   */
  async insertRawFRData(sourceType, identifier, rawData, inputMetadata = {}) {
    try {
      // Apply Smoothing
      const smoothedData = FRSmoother.smoothChannels(rawData);
      // Normalize each channel from rawData
      const normalizedData = FRNormalizer.normalizeChannels(smoothedData);

      // Create FR Object
      const frObject = {
        uuid: crypto.randomUUID(),
        type: `inserted-${sourceType}`,
        identifier: identifier,
        channels:
          Object.keys(normalizedData).length > 1
            ? {
                ...(normalizedData["L"] && { L: normalizedData["L"] }),
                ...(normalizedData["R"] && { R: normalizedData["R"] }),
                ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
              }
            : {
                ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
              },
        dispChannel: inputMetadata?.dispChannel
          ? inputMetadata?.dispChannel
          : this._getChannelValue(sourceType, Object.keys(normalizedData)),
        dispSuffix: inputMetadata?.dispSuffix
          ? inputMetadata?.dispSuffix
          : "(Inserted)",
        colors: this._getColorWithType(sourceType),
        dash: this._getDashWithType(sourceType, identifier),
        //meta: inputMetadata,
      };

      // Add FR Object to frDataMap
      this.frDataMap.set(frObject.uuid, frObject);

      // Dispatch 'FR Added' Event
      this.coreEvent.dispatchEvent(`fr-unknown-inserted`, {
        uuid: frObject.uuid,
        identifier: identifier,
      });
    } catch (e) {
      throw new Error("An Error Occurred while adding FR Data");
    }
  };

  /**
   * Remove Frequency Response Data Object from frDataMap with UUID
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string} uuid - UUID of the phone
   * @returns {void}
   */
  removeFRDataWithUUID(sourceType, uuid) {
    const targetEntry = Array.from(this.frDataMap).find(([u]) => u === uuid);
    if (targetEntry) {
      this.frDataMap.delete(uuid);

      const eventType = ["phone", "target"].includes(sourceType)
        ? `fr-${sourceType}-removed`
        : "fr-unknown-removed";

      this.coreEvent.dispatchEvent(eventType, {
        uuid: uuid,
        identifier: targetEntry[1].identifier,
      });
    }
    return;
  };

  /**
   * Get FR Data from frDataMap
   * @param {string} uuid - UUID of the FR data
   * @returns {object|null} FR data object or null if not found
   */
  getFRData(uuid) {
    if (!this.frDataMap.has(uuid)) {
      return null;
    }
    return structuredClone(this.frDataMap.get(uuid));
  };

  /**
   * Get FR Data from frDataMap
   * @returns {object|null} FR Data Map Object
   */
  getFRDataMap() {
    return structuredClone(this.frDataMap);
  };

  /**
   * Check if Frequency Response Data Object exists in frDataMap
   * @param {string} identifier - Identifier of the phone
   * @param {string?} suffix - Suffix of the phone source
   * @returns {boolean}
   */
  isFRDataLoaded(identifier, suffix = "") {
    if (suffix === "") {
      return Array.from(this.frDataMap).some(
        ([, c]) => c.identifier === identifier
      );
    } else {
      return Array.from(this.frDataMap).some(
        ([, c]) => c.identifier === identifier && c.dispSuffix === suffix
      );
    }
  };

  /**
   * Get UUID from Identifier
   * @param {string} identifier - Identifier of the phone
   * @returns {string}
   */
  getUUIDwithIdentifier(identifier) {
    const targetEntry = Array.from(this.frDataMap).find(
      ([, c]) => c.identifier === identifier
    );
    if (targetEntry) {
      const [uuid] = targetEntry;
      return uuid;
    }
    return "";
  };

  /**
   * Get Array of Frequency Response Identifiers existing in frDataMap
   * @param {string} sourceType - Type of source (phone or target)
   * @returns {boolean}
   */
  getLoadedFRIdentifierBySource(sourceType) {
    return Array.from(this.frDataMap)
      .filter(([, c]) => c.type === sourceType)
      .map(([_, c]) => c.identifier);
  };

  /**
   * Toggle Frequency Response Data Object in frDataMap
   * @param {string} sourceType - Type of source (phone or target)
   * @param {string} identifier - Identifier of the source (phone or target name)
   * @param {boolean} enabled - Whether to enable or disable the FR data
   * @returns {Promise<void>}
   */
  async toggleFRData(sourceType, identifier, enabled) {
    try {
      if (enabled) {
        await this.addFRData(sourceType, identifier);
      } else {
        this.removeFRData(sourceType, identifier);
      }
    } catch (e) {
      throw new Error("An Error Occurred while toggling FR Data");
    }
  };

  /**
   * Update FR Data with Given Suffix Variant
   * @param {string} uuid - UUID of the phone
   * @param {string?} dispSuffix - dispSuffix of the phone
   * @returns {Promise<void>}
   */
  async updateVariant(uuid, dispSuffix) {
    const phoneData = this.getFRData(uuid);
    if (!phoneData) {
      throw new Error("No data found for UUID:", uuid);
    }

    try {
      // Get FR Data in structured format
      const rawData = await FRParser.getFRDataFromMetadata('phone', phoneData.meta, dispSuffix);
      // Apply Smoothing
      const smoothedData = FRSmoother.smoothChannels(rawData);
      // Normalize each channel from rawData
      const normalizedData = FRNormalizer.normalizeChannels(smoothedData);

      this.frDataMap.set(uuid, {
        ...phoneData,
        channels: {
          ...(normalizedData["L"] && { L: normalizedData["L"] }),
          ...(normalizedData["R"] && { R: normalizedData["R"] }),
          ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
        },
        dispSuffix: dispSuffix,
        dispChannel: phoneData.dispChannel.every(channel => Object.keys(normalizedData).includes(channel)) 
          ? phoneData.dispChannel 
          : [Object.keys(normalizedData)[0]] // Replace dispChannel if the new variant does not have current channels.
      });

      // Dispatch 'Variant Updated' Event
      this.coreEvent.dispatchEvent('fr-variant-updated', {
        uuid: uuid,
      });
    } catch (e) {
      throw new Error("An Error Occurred while updating FR Data");
    }
  };

  /**
   * Toggle Frequency Response Data Object in frDataMap
   * @param {string} uuid - UUID of target (phone or target)
   * @param {Array} rawData - processed rawData to be inserted
   * @param {string?} identifier - New Identifier of the source (phone or target name)
   * @param {string?} dispSuffix - New dispSuffix of the source (phone or target name)
   * @param {object?} meta - New meta of the source (phone or target name)
   * @returns {void}
   */
  updateFRDataWithRawData(uuid, rawData, { identifier = null, dispSuffix = null, meta = null } = {}) {
    if (!this.frDataMap.has(uuid)) {
      throw new Error("No data found for UUID:", uuid);
    }
    const originalPhoneData = this.getFRData(uuid);

    try {
      // Apply Smoothing
      const smoothedData = FRSmoother.smoothChannels(rawData);
      // Normalize each channel from rawData
      const normalizedData = FRNormalizer.normalizeChannels(smoothedData);

      this.frDataMap.set(uuid, {
        ...originalPhoneData,
        channels:
          originalPhoneData.type === "target"
            ? {
                ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
              }
            : {
                ...(normalizedData["L"] && { L: normalizedData["L"] }),
                ...(normalizedData["R"] && { R: normalizedData["R"] }),
                ...(normalizedData["AVG"] && { AVG: normalizedData["AVG"] }),
              },
        ...(identifier !== null && { identifier }),
        ...(dispSuffix !== null && { dispSuffix }),
        ...(meta !== null && { meta }),
      });

      // Update Target Graph
      RenderEngine.drawFRCurve(uuid);
    } catch (e) {
      console.error("Error updating EQ curve:", e);
    }
  };

  /**
   * Update changeable Metadata of Frequency Response Data Object in frDataMap
   * @param {string} keyType - Type of key for locating frDataMap (uuid or identifier)
   * @param {string} keyValue - Value of key for locating frDataMap (uuid or identifier)
   * @param {string} inputType - Type of input (dispChannel {Array | string} / colors {Object | string})
   * @param {string} inputValue - Value of input
   * @returns {Promise<void>}
   */
  updateMetadata(keyType, keyValue, inputType, inputValue) {
    if (!["uuid", "identifier"].includes(keyType)) {
      throw new Error("Wrong keyType was given");
    }
    if (!["dispChannel", "colors", "dash"].includes(inputType)) {
      throw new Error("Wrong inputType was given");
    }

    // Update keyValue as UUID with Identifier
    if (keyType !== "uuid") {
      keyValue = DataProvider.getUUIDwithIdentifier(keyValue);
    }

    // Get the data object directly from the Map
    const dataObj = this.getFRData(keyValue);
    if (!dataObj) {
      throw new Error("No data found for UUID:", keyValue);
    }

    // Update Display channel attribute
    if (inputType === "dispChannel") {
      if (Array.isArray(inputValue)) {
        dataObj.dispChannel = inputValue;
        this.frDataMap.set(keyValue, dataObj);
      } else if (
        inputValue === "L" ||
        inputValue === "R" ||
        inputValue === "AVG"
      ) {
        dataObj.dispChannel = [inputValue];
        this.frDataMap.set(keyValue, dataObj);
      } else {
        throw Error("Wrong Channel Data was given");
      }
      // Fire Event
      this.coreEvent.dispatchEvent("fr-channel-updated", {
        uuid: keyValue,
        type: dataObj.type,
      });
    } else if (inputType === "colors") {
      dataObj.colors.L = inputValue.L || "";
      dataObj.colors.R = inputValue.R || "";
      dataObj.colors.AVG = inputValue.AVG || "";
      this.frDataMap.set(keyValue, dataObj);
      // Fire Event
      this.coreEvent.dispatchEvent("fr-color-updated", { uuid: keyValue });
    } else if (inputType === "dash") {
      dataObj.dash = inputValue;
      this.frDataMap.set(keyValue, dataObj);
      // Fire Event
      this.coreEvent.dispatchEvent("fr-dash-updated", { uuid: keyValue });
    }
  };

  /**
   * Update channel display for all phones based on current selection
   * @returns {void}
   */
  updateChannels() {
    const numberOfSelections = this.frDataMap.size;
    console.log(`Updating Channels for ${numberOfSelections} selections...`);
    if (numberOfSelections > 1) {
      // If multiple phones are selected, use AVG channel for all if possible
      this.frDataMap.forEach((dataObj) => {
        if (dataObj.type === "phone") {
          if (Object.keys(dataObj.channels).includes("AVG")) {
            dataObj.dispChannel = ["AVG"];
          } else {
            dataObj.dispChannel = Object.keys(dataObj.channels)[0];
          }
          this.frDataMap.set(dataObj.uuid, dataObj);
          // Fire Event
          this.coreEvent.dispatchEvent("fr-channel-updated", {
            uuid: dataObj.uuid,
            type: dataObj.type,
          });
        }
      });
    } else if (numberOfSelections === 1) {
      // If only one phone is selected, use Left and Right channels if available
      const singlePhone = Array.from(this.frDataMap.values())[0];
      if (singlePhone.type === "phone") {
        if (Object.keys(singlePhone.channels).includes("L") && 
            Object.keys(singlePhone.channels).includes("R")) {
          singlePhone.dispChannel = ["L", "R"];
        } else if (Object.keys(singlePhone.channels).includes("AVG")) {
          singlePhone.dispChannel = ["AVG"];
        } else {
          singlePhone.dispChannel = [Object.keys(singlePhone.channels)[0]];
        }
        this.frDataMap.set(singlePhone.uuid, singlePhone);
        // Fire Event
        this.coreEvent.dispatchEvent("fr-channel-updated", {
          uuid: singlePhone.uuid,
          type: singlePhone.type,
        });
      }
    }
  }

  _getChannelValue(sourceType, availableChannels) {
    const phoneEntries = Array.from(this.frDataMap.values()).filter(
      (e) => e.type === "phone"
    );
    if (sourceType === "phone") {
      if (phoneEntries.length < 1) {
        // First phone: return L+R
        return availableChannels.filter((channel) => channel !== "AVG");
      } else {
        // Return AVG if it exists
        if (availableChannels.includes("AVG")) {
          return ["AVG"];
        } else {
          return [`${availableChannels[0]}`];
        }
      }
    } else {
      return ["AVG"];
    }
  };

  _getColorWithType(sourceType) {
    if(this.baseHue === null) {
      // Generate random base color hue
      this.baseHue = parseInt((Math.random() * 360).toFixed(0));
    } else {
      // Increment base color hue for subsequent phones
      this.baseHue = (this.baseHue + 100) % 360;
    }
    const baseSaturation = parseInt((Math.random() * 50).toFixed(0));
    const baseLightness = parseInt((Math.random() * 20).toFixed(0));
    if (sourceType === "target") {
      return { AVG: `hsl(${this.baseHue}, 0%, 45%)` };
    } else {
      return {
        L: `hsl(${(this.baseHue - 10) % 360}, ${50 + baseSaturation}%, ${30 + baseLightness}%)`,
        R: `hsl(${(this.baseHue + 10) % 360}, ${50 + baseSaturation}%, ${30 + baseLightness}%)`,
        AVG: `hsl(${this.baseHue}, ${50 + baseSaturation}%, ${30 + baseLightness}%)`
      };
    }
  };

  _getDashWithType(sourceType, identifier = null) {
    if (sourceType === "target") {
      if (identifier === null) {
        return this._getRandomDashForTarget();
      }

      // If identifier is given, search for the custom dash style from config
      return ConfigGetter.get('TRACE_STYLING.TARGET_TRACE_DASH')?.find(o => (
        o.name.endsWith(' Target') ? o.name : o.name + ' Target') === identifier
      )?.dash || this._getRandomDashForTarget();
    } else {
      return "1 0";
    }
  }

  _getRandomDashForTarget() {
    // Generate 1-3 dash-space pairs randomly
    const numPairs = 1 + Math.floor(Math.random() * 3);
    const pairs = [];
    
    // Generate space length between 2-4
    const spaceLength = 5 + Math.floor(Math.random() * 3);

    // Generate random dash length between 2-6
    for (let i = 0; i < numPairs; i++) {
      // Alternate long dash and short dash for distinctive variation
      if(i % 2 === 0) {
        const dashLength = 5 + Math.floor(Math.random() * 5);
        pairs.push(`${dashLength} ${spaceLength}`);
      } else {
        pairs.push(`2 ${spaceLength}`);
      }
    }

    return pairs.join(' ');
  }

  static getInstance() {
    if(!DataProvider.instance) {
      DataProvider.instance = new DataProvider();
    }
    return DataProvider.instance;
  };
};

export default DataProvider.getInstance();

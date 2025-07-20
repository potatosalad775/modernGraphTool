import ConfigGetter from "./config-getter.js";

/**
 * @typedef {import('../../types/data-types.js').FRDataType} FRDataType
 * @typedef {import('../../types/data-types.js').PhoneMetadata} PhoneMetadata
 * @typedef {import('../../types/data-types.js').BrandMetadata} BrandMetadata
 * @typedef {import('../../types/data-types.js').TargetMetadata} TargetMetadata
 * @typedef {import('../../types/data-types.js').TargetManifestEntry} TargetManifestEntry
 * @typedef {import('../../types/data-types.js').PhoneFileVariant} PhoneFileVariant
 * @typedef {import('../../types/data-types.js').RawBrandData} RawBrandData
 * @typedef {import('../../types/data-types.js').RawPhoneData} RawPhoneData
 */

/**
 * Metadata Parser for phone and target data
 * Handles parsing and management of device metadata from phone_book.json and config files
 */
const MetadataParser = {
  /** @type {BrandMetadata[]|null} */
  phoneMetadata: null,
  
  /** @type {TargetManifestEntry[]|null} */
  targetMetadata: null,

  /** @type {import('../../core-event.js').default|null} */
  coreEvent: null,

  /**
   * Initialize metadata parser and load data
   * @param {import('../../core-event.js').default} coreEvent - Core event system
   * @returns {Promise<void>}
   */
  async init(coreEvent) {
    this.coreEvent = coreEvent;
    // Fetch Phone Book Data
    if (!this.phoneMetadata) {
      this.phoneMetadata = await this._fetchBookObject();
    }
    // Fetch Target Data
    if (!this.targetMetadata) {
      this.targetMetadata = this._fetchTargetObject();
    }
    // Dispatch Event
    this.coreEvent.dispatchEvent('metadata-loaded');
    return;
  },

  /**
   * Check if Phone object is included in phoneMetadata (phone_book.json).
   * Does not check if the file is valid.
   * @param {string} identifier 
   * @returns {boolean}
   */
  isPhoneAvailable(identifier) {
    if (!this.phoneMetadata) return false;
    
    return this.phoneMetadata.some((brand) =>
      brand.phones.some((phone) => phone.identifier === identifier)
    ) 
    || // Try Full-Name search if it doesn't exist
    this.phoneMetadata.some((brand) =>
      brand.phones.some((phone) => {
        // Handle both array and single file cases
        return phone.files.some(file => {
          // If it's an object with fullName property
          if (file.fullName) return file.fullName === identifier;
          // If it's a string, construct the full name
          const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
          const fullName = brand.brand + ' ' + baseName + ' ' + file.suffix;
          return fullName === identifier;
        });
      })
    );
  },

  /**
   * Check if Target object is included in targetMetadata (config.js).
   * Does not check if the file is valid.
   * @param {string} identifier 
   * @returns {boolean}
   */
  isTargetAvailable(identifier) {
    if (!this.targetMetadata) return false;
    
    return this.targetMetadata.some((obj) => 
      obj.files.some((file) => (file.includes(' Target') ? file : `${file} Target`) 
        === (identifier.includes(' Target') ? identifier : `${identifier} Target`) 
      )
    );
  },

  /**
   * Get Frequency Response Metadata from phone_book.json if available. 
   * @param {FRDataType} sourceType - sourceType of searching phone or target
   * @param {string} identifier - identifier of searching phone or target
   * @returns {PhoneMetadata|TargetMetadata}
   */
  getFRMetadata(sourceType, identifier) {
    if (sourceType === "phone") {
      if (!this.phoneMetadata) {
        throw new Error("Phone metadata not loaded");
      }
      
      // Find matching phone in transformed metadata
      for (const brand of this.phoneMetadata) {
        const phone = brand.phones.find((p) => p.identifier === identifier);
        if (phone) {
          return phone;
        }
      }
      // If it fails, try searching fullName
      return this.searchFRInfoWithFullName(identifier);
    } else if (sourceType === "target") {
      return {
        identifier: identifier,
        files: [{
          files: `${identifier}.txt`,
        }] 
      };
    } else {
      /** @type {TargetMetadata} */
      const fallback = { 
        identifier: identifier,
        files: [{ files: `${identifier}.txt` }]
      };
      return fallback;
    }
  },

  /**
   * Search Frequency Response Metadata from phone_book.json with fullName.
   * @param {string} inputStr - search string (possibly full name with suffix)
   * @returns {PhoneMetadata}
   */
  searchFRInfoWithFullName(inputStr) {
    if (!this.phoneMetadata) {
      throw new Error("Phone metadata not loaded");
    }
    
    // Search through all brands and phones
    for (const brand of this.phoneMetadata) {
      for (const phone of brand.phones) {
        // Check all file variations
        for (const file of phone.files) {
          if (file.fullName.toLowerCase() === inputStr.toLowerCase() || 
          file.fileName.toLowerCase() === inputStr.toLowerCase() || 
          file.fileName.replace(' ', '_').toLowerCase() === inputStr.toLowerCase()) {
            return {
              ...phone,
              dispSuffix: file.suffix || '', // Return matching suffix as well
            };
          }
        }
        // Check identifier if fullName does not match
        if(phone.identifier.toLowerCase() === inputStr.toLowerCase()) {
          return {
            ...phone,
            dispSuffix: phone.files[0].suffix
          };
        }
      }
    }
    // Fallback for unknown devices (moved outside of the loops)
    throw new Error(`No such data found: ${inputStr}`);
  },

  /**
   * Fetch phone_book metadata from (phone_book.json).
   * @returns {Promise<BrandMetadata[]>}
   */
  async _fetchBookObject() {
    /** @type {RawBrandData[]} */
    const rawData = await fetch(
      ConfigGetter.get('PATH.PHONE_BOOK') || '../../../data/phone_book.json'
    ).then(r => r.json());

    return rawData.map((brand) => { 
      const brandName = [brand.name, brand.suffix].filter(Boolean).join(' ');

      return {
        brand: brandName,
        phones: brand.phones.map((phone) => {
          // Common properties for all phone types
          const basePhone = {
            brand: brandName,
            ...(typeof phone === 'object' && phone.reviewScore && { reviewScore: phone.reviewScore }),
            ...(typeof phone === 'object' && phone.reviewLink && { reviewLink: phone.reviewLink }),
            ...(typeof phone === 'object' && phone.shopLink && { shopLink: phone.shopLink }),
            ...(typeof phone === 'object' && phone.price && { price: phone.price }),
          };
          
          // If phone is a string, it's a single phone
          if (typeof phone === 'string') {
            return {
              ...basePhone,
              name: phone,
              identifier: brandName + ' ' + phone,
              files: [{
                suffix: this._getSuffix(phone, 0),
                fullName: (brandName + ' ' + phone + ' ' + this._getSuffix(phone, 0)).trim(),
                files: {L: phone + ' L.txt', R: phone + ' R.txt'},
                fileName: phone
              }],
            };
          }
          
          // If phone is an object, it has multiple phones
          const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
          return {
            ...basePhone,
            name: baseName,
            identifier: brandName + ' ' + baseName,
            files: Array.isArray(phone.file) ? phone.file.map((file, index) => 
            ({
              suffix: this._getSuffix(phone, index),
              fullName: (brandName + ' ' + baseName + ' ' + this._getSuffix(phone, index)).trim(),
              files: {L: `${file} L.txt`, R: `${file} R.txt`},
              fileName: file
            })) : [{
              suffix: this._getSuffix(phone, 0),
              fullName: (brandName + ' ' + baseName + ' ' + this._getSuffix(phone, 0)).trim(),
              files: {L: `${phone.file} L.txt`, R: `${phone.file} R.txt`},
              fileName: phone.file || baseName
            }],
          };
        })
      };
    });
  },

  /**
   * Fetch target_manifest metadata from (config.js).
   * @returns {TargetManifestEntry[]}
   */
  _fetchTargetObject() {
    /** @type {TargetManifestEntry[]} */
    const manifest = ConfigGetter.getDefault('TARGET_MANIFEST') || [];
    return manifest.map((obj) => {
      return {
        type: obj.type,
        files: obj.files.map((identifier) => {
          return identifier.includes(' Target') ? identifier : `${identifier} Target`;
        })
      };
    });
  },

  /**
   * Get suffix for phone variants
   * @param {RawPhoneData|string} phone - Phone data object or string
   * @param {number|null} index - Index for array variants
   * @returns {string} Suffix string
   */
  _getSuffix(phone, index = null) {
    if (typeof phone === 'string') {
      return '';
    }
    
    if (Array.isArray(phone.file)) {
      // Handle array cases
      if (Array.isArray(phone.suffix) && index !== null) {
        return phone.suffix[index]?.trim() || String(index);
      } else if (typeof phone.suffix === 'string') {
        return phone.suffix.trim() || String(index);
      } else if (Array.isArray(phone.prefix) && index !== null) {
        return phone.file[index]?.replace(new RegExp(phone.prefix[index], 'i'), '').trim() || '';
      } else if (typeof phone.prefix === 'string' && index !== null) {
        return phone.file[index]?.replace(new RegExp(phone.prefix, 'i'), '').trim() || '';
      } else {
        return '';
      }
    } else {
      // Handle string cases
      if (typeof phone.suffix === 'string') {
        return phone.suffix.trim() || phone.file?.trim() || '';
      } else if (typeof phone.prefix === 'string' && phone.file) {
        return phone.file.replace(new RegExp(phone.prefix, 'i'), '').trim();
      } else {
        return '';
      }
    }
  }
}

export default MetadataParser;
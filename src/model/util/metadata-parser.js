import ConfigGetter from "./config-getter.js";

const MetadataParser = {
  phoneMetadata: null,
  targetMetadata: null,

  async init(coreEvent) {
    this.coreEvent = coreEvent;
    // Fetch Phone Book Data
    if (!this.phoneMetadata) {
      this.phoneMetadata = await this._fetchBookObject();
    }
    // Fetch Target Data
    if (!this.targetMetadata) {
      this.targetMetadata = ConfigGetter.getDefault('TARGET_MANIFEST') || [];
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
          const fullName = brand.name + ' ' + baseName + ' ' + 
            (phone.prefix ? file.replace(phone.prefix, '').trim() : '');
          return fullName === identifier;
        });
      })
    );
  },

  /**
   * Check if Phone object is included in targetMetadata (config.js).
   * Does not check if the file is valid.
   * @param {string} identifier 
   * @returns {boolean}
   */
  isTargetAvailable(identifier) {
    return this.targetMetadata.some((obj) => 
      obj.files.some((file) => (file.includes(' Target') ? file : `${file} Target`) 
        === (identifier.includes(' Target') ? identifier : `${identifier} Target`) 
      )
    );
  },

  /** Get Frequency Response Metadata from phone_book.json if available. 
   * @param {string} type - sourceType of searching phone or target
   * @param {string} identifier - identifier of searching phone or target
   * @returns {Object}
  */
  getFRMetadata(sourceType, identifier) {
    if (sourceType === "phone") {
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
          fileName: `${identifier}.txt`,
        }] 
      };
    } else {
      return { identifier: identifier }
    }
  },

  /** Search Frequency Response Metadata from phone_book.json with fullName.
   * @param {string} inputStr - search string (possibly full name with suffix)
   * @returns {Object}
  */
  searchFRInfoWithFullName(inputStr) {
    // Search through all brands and phones
    for (const brand of this.phoneMetadata) {
      for (const phone of brand.phones) {
        // Check all file variations
        for (const file of phone.files) {
          if (file.fullName === inputStr) {
            return {
              ...phone,
              dispSuffix: file.suffix || '', // Return matching suffix as well
            };
          }
        }
        // Check identifier if fullName does not match
        if(phone.identifier === inputStr) {
          return {
            ...phone,
            dispSuffix: phone.files[0].suffix
          }
        }
      }
    }
    // Fallback for unknown devices (moved outside of the loops)
    throw new Error(`No such data found: ${inputStr}`);
  },

  /**
   * Fetch phone_book metadata from (phone_book.json).
   * @returns {Promise<object>}
   */
  async _fetchBookObject() {
    const rawData = await fetch(
      window.GRAPHTOOL_CONFIG.PATH.PHONE_BOOK || '../../../data/phone_book.json'
    ).then(r => r.json());

    return rawData.map(brand => { 
      const brandName = [brand.name, brand.suffix].filter(Boolean).join(' ');

      return {
        brand: brandName,
        phones: brand.phones.map(phone => {
          // Common properties for all phone types
          const basePhone = {
            brand: brandName,
            ...(phone.reviewScore && { reviewScore: phone.reviewScore }),
            ...(phone.reviewLink && { reviewLink: phone.reviewLink }),
            ...(phone.shopLink && { shopLink: phone.shopLink }),
            ...(phone.price && { price: phone.price }),
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
                fileName: {L: phone + ' L.txt', R: phone + ' R.txt'}
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
              fileName: {L: `${file} L.txt`, R: `${file} R.txt`}
            })) : [{
              suffix: this._getSuffix(phone, 0),
              fullName: (brandName + ' ' + baseName + ' ' + this._getSuffix(phone, 0)).trim(),
              fileName: {L: `${phone.file} L.txt`, R: `${phone.file} R.txt`}
            }],
          };
        })
      };
    });
  },

  _getSuffix(phone, index = null) {
    if (Array.isArray(phone.file)) {
      // Handle array cases
      if (Array.isArray(phone.suffix)) {
        return phone.suffix[index].trim() || index;
      } else if (typeof phone.suffix === 'string') {
        return phone.suffix.trim() || index;
      } else if (Array.isArray(phone.prefix)) {
        return phone.file[index].replace(new RegExp(phone.prefix[index], 'i'), '').trim();
      } else if (typeof phone.prefix === 'string') {
        return phone.file[index].replace(new RegExp(phone.prefix, 'i'), '').trim();
      } else {
        return '';
      }
    } else {
      // Handle string cases
      if (typeof phone.suffix === 'string') {
        return phone.suffix.trim() || phone.file.trim();
      } else if (typeof phone.prefix === 'string') {
        return phone.file.replace(new RegExp(phone.prefix, 'i'), '').trim();
      } else {
        return '';
      }
    }
  }
}

export default MetadataParser;
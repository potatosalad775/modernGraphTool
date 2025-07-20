const Base62 = {
  charset: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",

  /**
   * Encode a string to Base62
   * @param {string} str - String to encode
   * @returns {string} Base62 encoded string
   */
  encode(str) {
    const bytes = new TextEncoder().encode(str);
    let value = BigInt(0);

    for (let i = 0; i < bytes.length; i++) {
      value = value * BigInt(256) + BigInt(bytes[i]);
    }

    let result = "";
    while (value > 0) {
      result = this.charset[Number(value % BigInt(62))] + result;
      value = value / BigInt(62);
    }

    return result || "0";
  },

  /**
   * Decode a Base62 string back to original string
   * @param {string} str - Base62 encoded string
   * @returns {string} Decoded original string
   */
  decode(str) {
    let value = BigInt(0);

    for (let i = 0; i < str.length; i++) {
      value = value * BigInt(62) + BigInt(this.charset.indexOf(str[i]));
    }

    const bytes = [];
    while (value > 0) {
      bytes.unshift(Number(value % BigInt(256)));
      value = value / BigInt(256);
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
  },
};

export default Base62;

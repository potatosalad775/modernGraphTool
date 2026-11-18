const Base62 = {
	charset: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',

	encode(str: string): string {
		const bytes = new TextEncoder().encode(str);
		let value = BigInt(0);

		for (const byte of bytes) {
			value = value * BigInt(256) + BigInt(byte);
		}

		let result = '';
		while (value > 0) {
			result = this.charset[Number(value % BigInt(62))] + result;
			value = value / BigInt(62);
		}

		return result || '0';
	},

	decode(str: string): string {
		let value = BigInt(0);

		for (const char of str) {
			value = value * BigInt(62) + BigInt(this.charset.indexOf(char));
		}

		const bytes: number[] = [];
		while (value > 0) {
			bytes.unshift(Number(value % BigInt(256)));
			value = value / BigInt(256);
		}

		return new TextDecoder().decode(new Uint8Array(bytes));
	}
};

export default Base62;

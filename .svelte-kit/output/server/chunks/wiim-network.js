//#region src/lib/device-peq/utils/filter-type-maps.ts
function createFilterTypeMap(mapping, fallbackType = "PK") {
	const reverse = /* @__PURE__ */ new Map();
	for (const [type, code] of Object.entries(mapping)) reverse.set(code, type);
	const fallbackCode = mapping[fallbackType];
	return {
		toCode: (ft) => mapping[ft] ?? fallbackCode,
		fromCode: (c) => reverse.get(c) ?? fallbackType
	};
}
createFilterTypeMap({
	PK: 0,
	LSQ: 1,
	HSQ: 2
});
createFilterTypeMap({
	PK: 2,
	LSQ: 1,
	HSQ: 3
});
createFilterTypeMap({
	PK: 0,
	LSQ: 3,
	HSQ: 4
});
createFilterTypeMap({
	PK: 13,
	LSQ: 10,
	HSQ: 11
});
/** WiiM Network: PK=1, LSQ=0, HSQ=2 */
var WIIM_FILTER_MAP = createFilterTypeMap({
	PK: 1,
	LSQ: 0,
	HSQ: 2
});
//#endregion
//#region src/lib/device-peq/handlers/wiim-network.ts
var PLUGIN_URI = "http://moddevices.com/plugins/caps/EqNp";
var SOURCE_NAME = "wifi";
/** Convert our DeviceFilterType to WiiM mode number: LSQ=0, PK=1, HSQ=2, Off=-1 */
function convertToWiimMode(filterType, disabled) {
	if (disabled) return -1;
	return WIIM_FILTER_MAP.toCode(filterType);
}
/** Convert WiiM mode number to our DeviceFilterType: 0=LSQ, 1=PK, 2=HSQ */
var convertFromWiimMode = WIIM_FILTER_MAP.fromCode;
async function sendHttpCommand(ip, command) {
	const url = `https://${ip}/httpapi.asp?command=${command}`;
	console.log("WiiM: Sending HTTP command:", url);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`WiiM: HTTP error ${response.status}: ${response.statusText}`);
	const text = await response.text();
	console.log("WiiM: Received response:", text);
	return text;
}
async function sendHttpCommandJson(ip, command, payload) {
	const fullCommand = `${command}:${JSON.stringify(payload)}`;
	return sendHttpCommand(ip, encodeURIComponent(fullCommand));
}
function filtersToWiimBands(filters) {
	const bands = [];
	for (const filter of filters) bands.push({
		mode: convertToWiimMode(filter.type, filter.disabled ?? false),
		freq: filter.freq,
		q: filter.q,
		gain: filter.disabled ? 0 : filter.gain
	});
	return bands;
}
function wiimBandsToFilters(bands) {
	const filters = [];
	for (const band of bands) {
		const disabled = band.mode === -1;
		const type = disabled ? "PK" : convertFromWiimMode(band.mode);
		filters.push({
			type,
			freq: band.freq,
			q: band.q,
			gain: band.gain,
			disabled
		});
	}
	return filters;
}
var wiimNetworkHandler = {
	async getCurrentSlot(_deviceDetails) {
		return 0;
	},
	async pullFromDevice(deviceDetails, _slot) {
		const ip = deviceDetails.ip;
		const responseText = await sendHttpCommandJson(ip, "EQGetLV2SourceBandEx", {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		});
		let responseData;
		try {
			responseData = JSON.parse(responseText);
		} catch {
			console.warn("WiiM: Failed to parse pull response:", responseText);
			return {
				filters: [],
				globalGain: 0
			};
		}
		return {
			filters: wiimBandsToFilters(responseData.EQBand ?? []),
			globalGain: 0
		};
	},
	async pushToDevice(deviceDetails, _slot, _preamp, filters) {
		const ip = deviceDetails.ip;
		await sendHttpCommandJson(ip, "EQSetLV2SourceBand", {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME,
			EQBand: filtersToWiimBands(filters)
		});
		await sendHttpCommandJson(ip, "EQSourceSave", {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		});
		console.log("WiiM: PEQ filters pushed and saved successfully.");
		return deviceDetails.modelConfig.disconnectOnSave;
	},
	async enablePEQ(deviceDetails, enabled, _slotId) {
		const ip = deviceDetails.ip;
		if (enabled) await sendHttpCommandJson(ip, "EQChangeSourceFX", {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		});
		else await sendHttpCommandJson(ip, "EQSourceOff", {
			PluginUri: PLUGIN_URI,
			SourceName: SOURCE_NAME
		});
	}
};
var networkRegistration = {
	deviceType: "WiiM",
	manufacturer: "WiiM",
	handler: wiimNetworkHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 12,
		maxFilters: 10,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: false,
		availableSlots: [{
			id: 0,
			name: "Default"
		}]
	}
};
//#endregion
export { networkRegistration, wiimNetworkHandler };

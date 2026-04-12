let _hidConfig = null;
let _serialConfig = null;
let _bleConfig = null;
let _networkHandlers = null;
function resolveHandlerRefs(configs, handlerMap) {
  for (const config of configs) {
    for (const [, deviceEntry] of Object.entries(config.devices)) {
      if (deviceEntry.handlerRef && !deviceEntry.handler) {
        const resolved = handlerMap[deviceEntry.handlerRef];
        if (resolved) {
          deviceEntry.handler = resolved;
        } else {
          console.warn(`Device PEQ Registry: unresolved handlerRef "${deviceEntry.handlerRef}"`);
        }
      }
    }
  }
}
async function getHidConfig() {
  if (_hidConfig) return _hidConfig;
  const [fiioHid, walkplay, moondrop, ktmicro, oldFashioned, fosiAudio] = await Promise.all([
    Promise.resolve().then(() => fiioUsbHid),
    Promise.resolve().then(() => walkplayHid),
    Promise.resolve().then(() => moondropUsbHid),
    Promise.resolve().then(() => ktmicroUsbHid),
    Promise.resolve().then(() => moondropOldFashionedHid),
    Promise.resolve().then(() => fosiAudioUsbHid)
  ]);
  const handlerMap = {
    "fiio-usb-hid": fiioHid.fiioUsbHidHandler,
    "walkplay-hid": walkplay.walkplayHidHandler,
    "moondrop-usb-hid": moondrop.moondropUsbHidHandler,
    "ktmicro-usb-hid": ktmicro.ktmicroUsbHidHandler,
    "moondrop-old-fashioned-hid": oldFashioned.moondropOldFashionedHidHandler
  };
  _hidConfig = [
    fiioHid.registration,
    walkplay.registration,
    ktmicro.registration,
    fosiAudio.registration
  ];
  resolveHandlerRefs(_hidConfig, handlerMap);
  return _hidConfig;
}
async function getSerialConfig() {
  if (_serialConfig) return _serialConfig;
  const [jdsLabs, nothing, fiioSerial, fiioSpp, rita, earfun, edifier, moondropEdge, airoha] = await Promise.all([
    Promise.resolve().then(() => jdsLabsUsbSerial),
    Promise.resolve().then(() => nothingUsbSerial),
    Promise.resolve().then(() => fiioUsbSerial),
    Promise.resolve().then(() => fiioSppSerial),
    Promise.resolve().then(() => ritaUsbSerial),
    Promise.resolve().then(() => earfunUsbSerial),
    Promise.resolve().then(() => edifierUsbSerial),
    Promise.resolve().then(() => moondropEdgeUsbSerial),
    Promise.resolve().then(() => airohaUsbSerial)
  ]);
  _serialConfig = [
    jdsLabs.registration,
    nothing.registration,
    fiioSerial.registration,
    fiioSpp.registration,
    rita.registration,
    earfun.registration,
    edifier.registration,
    moondropEdge.registration,
    airoha.registration
  ];
  return _serialConfig;
}
async function getBleConfig() {
  if (_bleConfig) return _bleConfig;
  const [fiioBle$1, airohaBle$1] = await Promise.all([
    Promise.resolve().then(() => fiioBle),
    Promise.resolve().then(() => airohaBle)
  ]);
  _bleConfig = [fiioBle$1.registration, airohaBle$1.registration];
  return _bleConfig;
}
async function getNetworkHandlers() {
  if (_networkHandlers) return _networkHandlers;
  const [wiim, luxsin] = await Promise.all([
    Promise.resolve().then(() => wiimNetwork),
    Promise.resolve().then(() => luxsinNetwork)
  ]);
  _networkHandlers = {
    [wiim.networkRegistration.deviceType]: {
      handler: wiim.networkRegistration.handler,
      defaultModelConfig: wiim.networkRegistration.defaultModelConfig
    },
    [luxsin.networkRegistration.deviceType]: {
      handler: luxsin.networkRegistration.handler,
      defaultModelConfig: luxsin.networkRegistration.defaultModelConfig
    }
  };
  return _networkHandlers;
}
function createFilterTypeMap(mapping, fallbackType = "PK") {
  const reverse = /* @__PURE__ */ new Map();
  for (const [type, code] of Object.entries(mapping)) {
    reverse.set(code, type);
  }
  const fallbackCode = mapping[fallbackType];
  return {
    toCode: (ft) => mapping[ft] ?? fallbackCode,
    fromCode: (c) => reverse.get(c) ?? fallbackType
  };
}
const FIIO_FILTER_MAP = createFilterTypeMap({ PK: 0, LSQ: 1, HSQ: 2 });
const WALKPLAY_FILTER_MAP = createFilterTypeMap({ PK: 2, LSQ: 1, HSQ: 3 });
const KTMICRO_FILTER_MAP = createFilterTypeMap({ PK: 0, LSQ: 3, HSQ: 4 });
createFilterTypeMap({ PK: 13, LSQ: 10, HSQ: 11 });
const WIIM_FILTER_MAP = createFilterTypeMap({ PK: 1, LSQ: 0, HSQ: 2 });
const PEQ_FILTER_PARAMS = 21;
const PEQ_PRESET_SWITCH = 22;
const PEQ_GLOBAL_GAIN = 23;
const PEQ_FILTER_COUNT = 24;
const PEQ_SAVE_TO_DEVICE = 25;
const SET_HEADER1 = 170;
const SET_HEADER2 = 10;
const GET_HEADER1 = 187;
const GET_HEADER2 = 11;
const END_HEADERS = 238;
function toBytePair(value) {
  return [value & 255, (value & 65280) >> 8];
}
function splitUnsignedValue(value) {
  return [value >> 8 & 255, value & 255];
}
function combineBytes(lowByte, highByte) {
  return lowByte << 8 | highByte;
}
function fiioGainBytesFromValue(e) {
  let t = e * 10;
  if (t < 0) {
    t = (Math.abs(t) ^ 65535) + 1;
  }
  const r = t >> 8 & 255;
  const n = t & 255;
  return [r, n];
}
function handleGain(lowByte, highByte) {
  let r = combineBytes(lowByte, highByte);
  const gain = r & 32768 ? (r = (r ^ 65535) + 1, -r / 10) : r / 10;
  return gain;
}
const convertFromFilterType$5 = FIIO_FILTER_MAP.toCode;
const convertToFilterType$5 = FIIO_FILTER_MAP.fromCode;
function getFiioReportId(deviceDetails) {
  if (deviceDetails && deviceDetails.modelConfig && deviceDetails.modelConfig.reportId !== void 0) {
    console.log(
      `Using reportId ${deviceDetails.modelConfig.reportId} from modelConfig for ${deviceDetails.model || "unknown device"}`
    );
    return deviceDetails.modelConfig.reportId;
  }
  console.log(`Using default reportId 7 for ${deviceDetails.model || "unknown device"}`);
  return 7;
}
async function setPeqParams(device, filterIndex, fc, gain, q, filterType, reportId) {
  const [frequencyLow, frequencyHigh] = splitUnsignedValue(fc);
  const [gainLow, gainHigh] = fiioGainBytesFromValue(gain);
  const qFactorValue = Math.round(q * 100);
  const [qFactorLow, qFactorHigh] = splitUnsignedValue(qFactorValue);
  const packet = [
    SET_HEADER1,
    SET_HEADER2,
    0,
    0,
    PEQ_FILTER_PARAMS,
    8,
    filterIndex,
    gainLow,
    gainHigh,
    frequencyLow,
    frequencyHigh,
    qFactorLow,
    qFactorHigh,
    filterType,
    0,
    END_HEADERS
  ];
  const data = new Uint8Array(packet);
  console.log(
    `USB Device PEQ: setPeqParams() sending filter ${filterIndex} - Freq: ${fc}Hz, Gain: ${gain}dB, Q: ${q}, Type: ${filterType}`,
    data
  );
  await device.sendReport(reportId, data);
}
async function setPresetPeq(device, presetId, reportId) {
  const packet = [SET_HEADER1, SET_HEADER2, 0, 0, PEQ_PRESET_SWITCH, 1, presetId, 0, END_HEADERS];
  const data = new Uint8Array(packet);
  console.log(`USB Device PEQ: setPresetPeq() switching to preset ${presetId}`, data);
  await device.sendReport(reportId, data);
}
async function setGlobalGain(device, gain, reportId) {
  const globalGain = Math.round(gain * 10);
  const gainBytes = toBytePair(globalGain);
  const packet = [
    SET_HEADER1,
    SET_HEADER2,
    0,
    0,
    PEQ_GLOBAL_GAIN,
    2,
    gainBytes[1],
    gainBytes[0],
    0,
    END_HEADERS
  ];
  const data = new Uint8Array(packet);
  console.log(`USB Device PEQ: setGlobalGain() setting global gain to ${gain}dB`, data);
  await device.sendReport(reportId, data);
}
async function setPeqCounter(device, counter, reportId) {
  const packet = [
    SET_HEADER1,
    SET_HEADER2,
    0,
    0,
    PEQ_FILTER_COUNT,
    1,
    counter,
    0,
    END_HEADERS
  ];
  const data = new Uint8Array(packet);
  console.log(`USB Device PEQ: setPeqCounter() setting filter count to ${counter}`, data);
  await device.sendReport(reportId, data);
}
function saveToDevice(device, slotId, reportId) {
  const packet = [
    SET_HEADER1,
    SET_HEADER2,
    0,
    0,
    PEQ_SAVE_TO_DEVICE,
    1,
    slotId,
    0,
    END_HEADERS
  ];
  const data = new Uint8Array(packet);
  console.log(
    `USB Device PEQ: saveToDevice() using reportId ${reportId} for slot ${slotId}`,
    data
  );
  device.sendReport(reportId, data);
}
function getGlobalGain(device, reportId) {
  const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_GLOBAL_GAIN, 0, 0, END_HEADERS];
  const data = new Uint8Array(packet);
  console.log("getGlobalGain() Send data:", data);
  device.sendReport(reportId, data);
}
function getPeqCounter(device, reportId) {
  const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_FILTER_COUNT, 0, 0, END_HEADERS];
  const data = new Uint8Array(packet);
  console.log("getPeqCounter() Send data:", data);
  device.sendReport(reportId, data);
}
function getPeqParams(device, filterIndex, reportId) {
  const packet = [
    GET_HEADER1,
    GET_HEADER2,
    0,
    0,
    PEQ_FILTER_PARAMS,
    1,
    filterIndex,
    0,
    END_HEADERS
  ];
  const data = new Uint8Array(packet);
  console.log("getPeqParams() Send data:", data);
  device.sendReport(reportId, data);
}
function getPresetPeq(device, reportId) {
  const packet = [GET_HEADER1, GET_HEADER2, 0, 0, PEQ_PRESET_SWITCH, 0, 0, END_HEADERS];
  const data = new Uint8Array(packet);
  console.log("getPresetPeq() Send data:", data);
  device.sendReport(reportId, data);
}
function handlePeqCounter(data, device, reportId) {
  const peqCount = data[6];
  console.log("***********oninputreport peq counter=", peqCount);
  if (peqCount > 0) {
    processPeqCount(device, peqCount, reportId);
  }
  return peqCount;
}
function processPeqCount(device, peqCount, reportId) {
  console.log("PEQ Counter:", peqCount);
  for (let i = 0; i < peqCount; i++) {
    getPeqParams(device, i, reportId);
  }
}
function handlePeqParams(data, device, filters) {
  const filter = data[6];
  const gain = handleGain(data[7], data[8]);
  const frequency = combineBytes(data[9], data[10]);
  const qFactor = combineBytes(data[11], data[12]) / 100 || 1;
  const filterType = convertToFilterType$5(data[13]);
  console.log(
    `Filter ${filter}: Gain=${gain}, Frequency=${frequency}, Q=${qFactor}, Type=${filterType}`
  );
  filters[filter] = {
    type: filterType,
    freq: frequency,
    q: qFactor,
    gain,
    disabled: false
  };
}
function handleEqPreset(data, deviceDetails) {
  const presetId = data[6];
  console.log("EQ Preset ID:", presetId);
  if (presetId === deviceDetails.modelConfig.disabledPresetId) {
    return -1;
  }
  return presetId;
}
function savedEQ(data, device) {
  const slotId = data[6];
  console.log("EQ Slot ID:", slotId);
}
function waitForFilters$1(condition, device, timeout, callback) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!condition()) {
        console.warn("Timeout reached before data returned?");
        reject(callback(device));
      } else {
        resolve(callback(device));
      }
    }, timeout);
    const interval = setInterval(() => {
      if (condition()) {
        clearTimeout(timer);
        clearInterval(interval);
        resolve(callback(device));
      }
    }, 100);
  });
}
const fiioUsbHidHandler = {
  async getCurrentSlot(deviceDetails) {
    const device = deviceDetails.rawDevice;
    const reportId = getFiioReportId(deviceDetails);
    try {
      let currentSlot = -99;
      device.oninputreport = async (event) => {
        const data = new Uint8Array(event.data.buffer);
        console.log(
          `USB Device PEQ: getCurrentSlot() onInputReport received data:`,
          data
        );
        if (data[0] === GET_HEADER1 && data[1] === GET_HEADER2) {
          switch (data[4]) {
            case PEQ_PRESET_SWITCH:
              currentSlot = handleEqPreset(data, deviceDetails);
              break;
            default:
              console.log("USB Device PEQ: Unhandled data type:", data[4], data);
          }
        }
      };
      getPresetPeq(device, reportId);
      const result = await waitForFilters$1(
        () => {
          return currentSlot > -99;
        },
        device,
        1e4,
        () => currentSlot
      );
      return result;
    } catch (error) {
      console.error("Failed to pull data from FiiO Device:", error);
      throw error;
    }
  },
  async pushToDevice(deviceDetails, slot, preamp_gain, filters) {
    try {
      const device = deviceDetails.rawDevice;
      const reportId = getFiioReportId(deviceDetails);
      await setGlobalGain(device, deviceDetails.modelConfig.maxGain + preamp_gain, reportId);
      const maxFilters = deviceDetails.modelConfig.maxFilters;
      const maxFiltersToUse = Math.min(filters.length, maxFilters);
      await setPeqCounter(device, maxFiltersToUse, reportId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (let filterIdx = 0; filterIdx < maxFiltersToUse; filterIdx++) {
        const filter = filters[filterIdx];
        let gain = 0;
        if (!filter.disabled) {
          gain = filter.gain;
        }
        await setPeqParams(
          device,
          filterIdx,
          filter.freq,
          gain,
          filter.q,
          convertFromFilterType$5(filter.type),
          reportId
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      saveToDevice(device, slot, reportId);
      console.log("PEQ filters pushed successfully.");
      if (deviceDetails.modelConfig.disconnectOnSave) {
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to push data to FiiO Device:", error);
      throw error;
    }
  },
  async pullFromDevice(deviceDetails, slot) {
    try {
      const filters = [];
      let peqCount = 0;
      let globalGain = 0;
      let currentSlot = 0;
      const device = deviceDetails.rawDevice;
      const reportId = getFiioReportId(deviceDetails);
      device.oninputreport = async (event) => {
        const data = new Uint8Array(event.data.buffer);
        console.log(
          `USB Device PEQ: pullFromDevice() onInputReport received data:`,
          data
        );
        if (data[0] === GET_HEADER1 && data[1] === GET_HEADER2) {
          switch (data[4]) {
            case PEQ_FILTER_COUNT:
              peqCount = handlePeqCounter(data, device, reportId);
              break;
            case PEQ_FILTER_PARAMS:
              handlePeqParams(data, device, filters);
              break;
            case PEQ_GLOBAL_GAIN:
              globalGain = handleGain(data[6], data[7]);
              console.log(`USB Device PEQ: Global gain received: ${globalGain}dB`);
              break;
            case PEQ_PRESET_SWITCH:
              currentSlot = handleEqPreset(data, deviceDetails);
              break;
            case PEQ_SAVE_TO_DEVICE:
              savedEQ(data, device);
              break;
            default:
              console.log("USB Device PEQ: Unhandled data type:", data[4], data);
          }
        }
      };
      getPresetPeq(device, reportId);
      getPeqCounter(device, reportId);
      getGlobalGain(device, reportId);
      const result = await waitForFilters$1(
        () => {
          return filters.length === peqCount;
        },
        device,
        1e4,
        () => ({
          filters,
          globalGain
        })
      );
      return result;
    } catch (error) {
      console.error("Failed to pull data from FiiO Device:", error);
      throw error;
    }
  },
  async enablePEQ(deviceDetails, enable, slotId) {
    const device = deviceDetails.rawDevice;
    const reportId = getFiioReportId(deviceDetails);
    if (enable) {
      await setPresetPeq(device, slotId, reportId);
    } else {
      await setPresetPeq(device, deviceDetails.modelConfig.maxFilters, reportId);
    }
  }
};
const FIIO_DEFAULT_SLOTS = [
  { id: 0, name: "Jazz" },
  { id: 1, name: "Pop" },
  { id: 2, name: "Rock" },
  { id: 3, name: "Dance" },
  { id: 4, name: "R&B" },
  { id: 5, name: "Classic" },
  { id: 6, name: "Hip-hop" },
  { id: 7, name: "Monitor" },
  { id: 160, name: "USER1" },
  { id: 161, name: "USER2" },
  { id: 162, name: "USER3" },
  { id: 163, name: "USER4" },
  { id: 164, name: "USER5" },
  { id: 165, name: "USER6" },
  { id: 166, name: "USER7" },
  { id: 167, name: "USER8" },
  { id: 168, name: "USER9" },
  { id: 169, name: "USER10" }
];
const FIIO_KA17_SLOTS = [
  { id: 0, name: "Jazz" },
  { id: 1, name: "Pop" },
  { id: 2, name: "Rock" },
  { id: 3, name: "Dance" },
  { id: 5, name: "R&B" },
  { id: 6, name: "Classic" },
  { id: 7, name: "Hip-hop" },
  { id: 4, name: "USER1" },
  { id: 8, name: "USER2" },
  { id: 9, name: "USER3" }
];
const registration$e = {
  vendorIds: [10610, 2578],
  manufacturer: "FiiO",
  handler: fiioUsbHidHandler,
  defaultModelConfig: {
    minGain: -12,
    maxGain: 12,
    maxFilters: 5,
    firstWritableEQSlot: -1,
    maxWritableEQSlots: 0,
    disconnectOnSave: true,
    disabledPresetId: -1,
    experimental: true,
    supportsLSHSFilters: true,
    supportsPregain: true,
    defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: "PK" }],
    reportId: 7,
    availableSlots: FIIO_DEFAULT_SLOTS
  },
  devices: {
    "FIIO QX13": { modelConfig: { maxFilters: 10, experimental: false, disconnectOnSave: false } },
    "SNOWSKY Melody": { manufacturer: "FiiO", handler: fiioUsbHidHandler, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: true } },
    "JadeAudio JIEZI": { manufacturer: "FiiO", handler: fiioUsbHidHandler, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 4, experimental: false, reportId: 2 } },
    "JadeAudio JA11": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 4, experimental: false, reportId: 2, availableSlots: [{ id: 0, name: "Vocal" }, { id: 1, name: "Classic" }, { id: 2, name: "Bass" }, { id: 3, name: "USER1" }] } },
    "FIIO KA17": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
    "FIIO Q7": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
    "FIIO KA17 (MQA HID)": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
    "FIIO BT11 (UAC1.0)": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
    "FIIO Air Link": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
    "FIIO BTR13": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 12, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 7, name: "USER1" }, { id: 8, name: "USER2" }, { id: 9, name: "USER3" }] } },
    "BTR17": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false } },
    "FIIO KA15": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 7, name: "USER1" }, { id: 8, name: "USER2" }, { id: 9, name: "USER3" }] } },
    "LS-TC2": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 11, experimental: true, availableSlots: [{ id: 0, name: "Vocal" }, { id: 1, name: "Classic" }, { id: 2, name: "Bass" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 160, name: "USER1" }] } },
    "FIIO K13 R2R": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 160, maxWritableEQSlots: 10, disconnectOnSave: false, disabledPresetId: 240, experimental: false, reportId: 1, availableSlots: [{ id: 240, name: "BYPASS" }, { id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 8, name: "Retro" }, { id: 9, name: "sDamp-1" }, { id: 10, name: "sDamp-2" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 163, name: "USER4" }, { id: 164, name: "USER5" }, { id: 165, name: "USER6" }, { id: 166, name: "USER7" }, { id: 167, name: "USER8" }, { id: 168, name: "USER9" }, { id: 169, name: "USER10" }] } },
    "FIIO BR15 R2R": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 160, maxWritableEQSlots: 10, disconnectOnSave: false, disabledPresetId: 240, experimental: false, availableSlots: [{ id: 240, name: "BYPASS" }, { id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 8, name: "Retro" }, { id: 9, name: "sDamp-1" }, { id: 10, name: "sDamp-2" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 163, name: "USER4" }, { id: 164, name: "USER5" }, { id: 165, name: "USER6" }, { id: 166, name: "USER7" }, { id: 167, name: "USER8" }, { id: 168, name: "USER9" }, { id: 169, name: "USER10" }] } },
    "FIIO FP3": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 160, maxWritableEQSlots: 1, disconnectOnSave: false, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 160, name: "USER1" }] } },
    "FIIO FG3": { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 160, maxWritableEQSlots: 10, disconnectOnSave: false, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 12, name: "Cinema" }, { id: 13, name: "FPS" }, { id: 14, name: "MOBA" }, { id: 15, name: "ACT" }, { id: 16, name: "MUG" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 163, name: "USER4" }, { id: 164, name: "USER5" }, { id: 165, name: "USER6" }, { id: 166, name: "USER7" }, { id: 167, name: "USER8" }, { id: 168, name: "USER9" }, { id: 169, name: "USER10" }] } },
    "SNOWSKY TINY A": { manufacturer: "FiiO", handler: fiioUsbHidHandler, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 160, maxWritableEQSlots: 3, disconnectOnSave: true, disabledPresetId: 240, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 240, name: "Close EQ" }] } },
    "SNOWSKY TINY B": { manufacturer: "FiiO", handler: fiioUsbHidHandler, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 160, maxWritableEQSlots: 3, disconnectOnSave: true, disabledPresetId: 240, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 240, name: "Close EQ" }] } }
  }
};
const fiioUsbHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fiioUsbHidHandler,
  registration: registration$e
}, Symbol.toStringTag, { value: "Module" }));
const QUANTIZATION_FACTOR = 1073741824;
const SAMPLE_RATE = 96e3;
const TWO_PI = 2 * Math.PI;
function computeWalkplayBiquad(freq, gain, q) {
  const sqrt = Math.sqrt(Math.pow(10, gain / 20));
  const d3 = freq * TWO_PI / SAMPLE_RATE;
  const sin = Math.sin(d3) / (2 * q);
  const d4 = sin * sqrt;
  const d5 = sin / sqrt;
  const d6 = d5 + 1;
  const a = [1, Math.cos(d3) * -2 / d6, (1 - d5) / d6];
  const b = [(d4 + 1) / d6, Math.cos(d3) * -2 / d6, (1 - d4) / d6];
  return [
    Math.round(b[0] * QUANTIZATION_FACTOR),
    Math.round(b[1] * QUANTIZATION_FACTOR),
    Math.round(b[2] * QUANTIZATION_FACTOR),
    Math.round(-a[1] * QUANTIZATION_FACTOR),
    Math.round(-a[2] * QUANTIZATION_FACTOR)
  ];
}
function computeMoondropBiquad(freq, gain, q) {
  const A = Math.pow(10, gain / 40);
  const w0 = TWO_PI * freq / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const norm = 1 + alpha / A;
  const b0 = (1 + alpha * A) / norm;
  const b1 = -2 * cosW0 / norm;
  const b2 = (1 - alpha * A) / norm;
  const a1 = -b1;
  const a2 = (1 - alpha / A) / norm;
  return [b0, b1, b2, a1, -a2].map((c) => Math.round(c * QUANTIZATION_FACTOR));
}
function biquadCoeffsToBytes(coeffs) {
  const arr = new Uint8Array(20);
  for (let i = 0; i < coeffs.length; i++) {
    const val = coeffs[i];
    arr[i * 4] = val & 255;
    arr[i * 4 + 1] = val >> 8 & 255;
    arr[i * 4 + 2] = val >> 16 & 255;
    arr[i * 4 + 3] = val >> 24 & 255;
  }
  return arr;
}
const convertToFilterType$4 = WALKPLAY_FILTER_MAP.fromCode;
const convertFromFilterType$4 = WALKPLAY_FILTER_MAP.toCode;
const REPORT_ID$4 = 75;
const READ = 128;
const WRITE = 1;
const END = 0;
const CMD$2 = {
  PEQ_VALUES: 9,
  VERSION: 12,
  TEMP_WRITE: 10,
  FLASH_EQ: 1,
  GLOBAL_GAIN: 3
};
async function sendReport(hidDevice, reportId, packet) {
  if (!hidDevice) throw new Error("Device not connected.");
  const data = new Uint8Array(packet);
  console.log(`USB Device PEQ: Walkplay sending report (ID: ${reportId}):`, data);
  await hidDevice.sendReport(reportId, data);
}
async function waitForResponse(hidDevice, timeout = 2e3) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.log(`USB Device PEQ: Walkplay timeout waiting for response after ${timeout}ms`);
      reject(new Error("Timeout waiting for HID response"));
    }, timeout);
    hidDevice.oninputreport = (event) => {
      clearTimeout(timer);
      const response = new Uint8Array(event.data.buffer);
      console.log("USB Device PEQ: Walkplay received response:", response);
      resolve(response);
    };
  });
}
async function readGlobalGain(hidDevice) {
  return new Promise((resolve, reject) => {
    const request = new Uint8Array([READ, CMD$2.GLOBAL_GAIN, 0]);
    const timeout = setTimeout(() => {
      hidDevice.removeEventListener("inputreport", onReport);
      reject(new Error("Timeout reading global gain"));
    }, 100);
    const onReport = (event) => {
      const data = new Uint8Array(event.data.buffer);
      console.log("USB Device PEQ: Walkplay onInputReport received global gain data:", data);
      clearTimeout(timeout);
      hidDevice.removeEventListener("inputreport", onReport);
      if (data[0] !== READ || data[1] !== CMD$2.GLOBAL_GAIN) return;
      const int8 = new Int8Array([data[4]])[0];
      console.log(`USB Device PEQ: Walkplay global gain value: ${int8}`);
      resolve(int8);
    };
    hidDevice.addEventListener("inputreport", onReport);
    console.log("USB Device PEQ: Walkplay sending readGlobalGain command:", request);
    hidDevice.sendReport(REPORT_ID$4, request);
  });
}
async function writeGlobalGain(hidDevice, value) {
  const gainValue = Math.round(value);
  const request = new Uint8Array([WRITE, CMD$2.GLOBAL_GAIN, 2, 0, gainValue]);
  console.log("USB Device PEQ: Walkplay sending writeGlobalGain command:", request);
  await hidDevice.sendReport(REPORT_ID$4, request);
}
function parseFilterPacket(packet) {
  if (packet.length < 32) {
    throw new Error("Packet too short to contain filter data.");
  }
  const filterIndex = packet[4];
  const freq = packet[27] | packet[28] << 8;
  const qRaw = packet[29] | packet[30] << 8;
  const q = Math.round(qRaw / 256 * 10) / 10;
  let gainRaw = packet[31] | packet[32] << 8;
  if (gainRaw > 32767) gainRaw -= 65536;
  const gain = Math.round(gainRaw / 256 * 10) / 10;
  const type = convertToFilterType$4(packet[33]);
  return {
    filterIndex,
    freq,
    q,
    gain,
    type,
    disabled: !(freq || q || gain)
  };
}
function convertToByteArray(value, length) {
  const arr = [];
  for (let i = 0; i < length; i++) {
    arr.push(value >> 8 * i & 255);
  }
  return arr;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function waitForFilters(condition, hidDevice, timeout, callback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearInterval(interval);
      if (!condition()) {
        console.warn("Timeout: Filters not fully received.");
        const result = callback();
        result.complete = false;
        result.receivedCount = result.filters.filter((f) => f !== void 0).length;
        resolve(result);
      } else {
        const result = callback();
        result.complete = true;
        resolve(result);
      }
    }, timeout);
    const interval = setInterval(() => {
      if (condition()) {
        clearTimeout(timer);
        clearInterval(interval);
        const result = callback();
        result.complete = true;
        resolve(result);
      }
    }, 100);
  });
}
async function getCurrentSlot$5(device) {
  const hidDevice = device.rawDevice;
  if (!hidDevice) throw new Error("Device not connected.");
  await sendReport(hidDevice, REPORT_ID$4, [READ, CMD$2.VERSION, END]);
  let response = await waitForResponse(hidDevice);
  const versionBytes = response.slice(3, 6);
  const version = String.fromCharCode(...versionBytes);
  console.log("USB Device PEQ: Walkplay firmware version:", version);
  const versionNumber = parseFloat(version);
  if (isNaN(versionNumber)) {
    console.warn("Could not parse firmware version:", versionNumber);
    device.version = null;
    return -1;
  }
  device.version = versionNumber;
  console.log("Fetching current EQ slot...");
  await sendReport(hidDevice, REPORT_ID$4, [READ, CMD$2.PEQ_VALUES, END]);
  response = await waitForResponse(hidDevice);
  const slot = response ? response[35] : -1;
  console.log("Walkplay current EQ slot:", slot);
  return slot;
}
async function pushToDevice$5(device, slot, preamp, filters) {
  const hidDevice = device.rawDevice;
  if (!hidDevice) throw new Error("Device not connected.");
  console.log("Pushing PEQ settings...");
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const coeffs = computeWalkplayBiquad(filter.freq, filter.gain, filter.q);
    const bArr = [...biquadCoeffsToBytes(coeffs)];
    const packet = [
      WRITE,
      CMD$2.PEQ_VALUES,
      24,
      0,
      i,
      0,
      0,
      ...bArr,
      ...convertToByteArray(filter.freq, 2),
      ...convertToByteArray(Math.round(filter.q * 256), 2),
      ...convertToByteArray(Math.round(filter.gain * 256), 2),
      convertFromFilterType$4(filter.type),
      0,
      device.modelConfig?.defaultIndex !== void 0 ? device.modelConfig.defaultIndex : slot,
      END
    ];
    await sendReport(hidDevice, REPORT_ID$4, packet);
  }
  await writeGlobalGain(hidDevice, preamp);
  console.log(`USB Device PEQ: Walkplay set global gain to ${preamp}`);
  await sendReport(hidDevice, REPORT_ID$4, [WRITE, CMD$2.TEMP_WRITE, 4, 0, 0, 255, 255, END]);
  await sendReport(hidDevice, REPORT_ID$4, [WRITE, CMD$2.FLASH_EQ, 1, END]);
  console.log("PEQ filters successfully pushed to Walkplay device.");
  return true;
}
async function pullFromDevice$5(device, slot) {
  const hidDevice = device.rawDevice;
  if (!hidDevice) throw new Error("Device not connected.");
  const filters = [];
  let currentSlot = -1;
  hidDevice.oninputreport = (event) => {
    const data = new Uint8Array(event.data.buffer);
    console.log("USB Device PEQ: Walkplay pullFromDevice onInputReport received data:", data);
    if (data.length >= 32) {
      const filter = parseFilterPacket(data);
      console.log(`USB Device PEQ: Walkplay parsed filter ${filter.filterIndex}:`, filter);
      filters[filter.filterIndex] = filter;
    }
    if (data.length >= 37) {
      currentSlot = data[35];
      console.log(`USB Device PEQ: Walkplay parsed current slot: ${currentSlot}`);
    }
  };
  const maxFilters = device.modelConfig.maxFilters;
  for (let i = 0; i < maxFilters; i++) {
    await sendReport(hidDevice, REPORT_ID$4, [READ, CMD$2.PEQ_VALUES, 0, 0, i, END]);
    await delay(50);
  }
  await delay(100);
  await waitForFilters(
    () => filters.filter((f) => f !== void 0).length === maxFilters,
    hidDevice,
    1e4,
    () => ({
      filters,
      globalGain: 0,
      currentSlot,
      complete: false
    })
  );
  hidDevice.oninputreport = null;
  let globalGain = 0;
  try {
    globalGain = await readGlobalGain(hidDevice);
    console.log(`USB Device PEQ: Walkplay read global gain: ${globalGain}dB`);
  } catch (error) {
    console.warn(`USB Device PEQ: Walkplay failed to read global gain: ${error}`);
  }
  const deviceFilters = [];
  for (let i = 0; i < maxFilters; i++) {
    const f = filters[i];
    if (f) {
      deviceFilters.push({
        type: f.type,
        freq: f.freq,
        q: f.q,
        gain: f.gain,
        disabled: f.disabled
      });
    } else {
      deviceFilters.push({ type: "PK", freq: 0, q: 0, gain: 0, disabled: true });
    }
  }
  console.log("Pulled PEQ filters from Walkplay:", deviceFilters);
  return { filters: deviceFilters, globalGain };
}
async function enablePEQ$4(device, enabled, slotId) {
  const hidDevice = device.rawDevice;
  if (!enabled) {
    slotId = 0;
  }
  const packet = [WRITE, CMD$2.FLASH_EQ, enabled ? 1 : 0, slotId, END];
  await sendReport(hidDevice, REPORT_ID$4, packet);
}
const walkplayHidHandler = {
  getCurrentSlot: getCurrentSlot$5,
  pushToDevice: pushToDevice$5,
  pullFromDevice: pullFromDevice$5,
  enablePEQ: enablePEQ$4
};
const registration$d = {
  vendorIds: [13058, 1890, 13784, 12230, 260, 46149, 1633, 1638, 3468],
  manufacturer: "WalkPlay",
  handler: walkplayHidHandler,
  defaultModelConfig: {
    minGain: -12,
    maxGain: 6,
    maxFilters: 8,
    schemeNo: 10,
    firstWritableEQSlot: -1,
    maxWritableEQSlots: 0,
    disconnectOnSave: false,
    disabledPresetId: -1,
    supportsPregain: true,
    supportsLSHSFilters: false,
    experimental: false,
    defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: "PK" }],
    availableSlots: [{ id: 101, name: "Custom" }]
  },
  devices: {
    "Old Fashioned": { manufacturer: "Moondrop", handlerRef: "moondrop-old-fashioned-hid", modelConfig: { minGain: -12, maxGain: 3, maxFilters: 5, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: false, disabledPresetId: -1, experimental: false, supportsLSHSFilters: false, supportsPregain: false, defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: "PK" }], availableSlots: [{ id: 0, name: "Custom" }] } },
    "FIIO FX17 ": { manufacturer: "FiiO", handlerRef: "fiio-usb-hid", modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, availableSlots: [{ id: 0, name: "Jazz" }, { id: 1, name: "Pop" }, { id: 2, name: "Rock" }, { id: 3, name: "Dance" }, { id: 4, name: "R&B" }, { id: 5, name: "Classic" }, { id: 6, name: "Hip-hop" }, { id: 7, name: "Monitor" }, { id: 160, name: "USER1" }, { id: 161, name: "USER2" }, { id: 162, name: "USER3" }, { id: 163, name: "USER4" }, { id: 164, name: "USER5" }, { id: 165, name: "USER6" }, { id: 166, name: "USER7" }, { id: 167, name: "USER8" }, { id: 168, name: "USER9" }, { id: 169, name: "USER10" }] } },
    "Rays": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid", supportsLSHSFilters: true, supportsPregain: true },
    "EPZ TP13 AI ENC audio": { manufacturer: "EPZ", modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
    "Marigold": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid", modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
    "FreeDSP Pro": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid", supportsLSHSFilters: true, supportsPregain: true },
    "FreeDSP Mini": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid", supportsLSHSFilters: true, supportsPregain: true },
    "MOONRIVER 3": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid", supportsLSHSFilters: true, supportsPregain: false },
    "ddHiFi DSP IEM - Memory": { manufacturer: "Moondrop", handlerRef: "moondrop-usb-hid" },
    "Quark2": { manufacturer: "Moondrop" },
    "ECHO-A": { manufacturer: "Moondrop" },
    "Truthear KEYX": { manufacturer: "Truthear", handler: walkplayHidHandler, modelConfig: { minGain: -12, maxGain: 6, maxFilters: 8, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: false, disabledPresetId: -1, supportsPregain: true, supportsLSHSFilters: false, experimental: false, defaultIndex: 23, availableSlots: [{ id: 101, name: "Custom" }] } },
    "Hi-MAX": { modelConfig: { experimental: false } },
    "BGVP MX1": { modelConfig: { schemeNo: 15, experimental: true } },
    "DT04": { manufacturer: "LETSHUOER", modelConfig: { schemeNo: 15, experimental: true } },
    "MD-QT-042": { manufacturer: "Moondrop", modelConfig: { schemeNo: 15, experimental: true } },
    "MOONDROP HiFi with PD": { manufacturer: "Moondrop", modelConfig: { schemeNo: 15, experimental: true } },
    "DAWN PRO 2": { manufacturer: "Moondrop", modelConfig: { schemeNo: 15, experimental: false } },
    "CS431XX": { modelConfig: { schemeNo: 15, experimental: true } },
    "ES9039 ": { modelConfig: { schemeNo: 15, experimental: true } },
    "TANCHJIM-STARGATE II": { manufacturer: "Tanchim", modelConfig: { schemeNo: 15, supportsLSHSFilters: false } },
    "didiHiFi DSP Cable - Memory": { manufacturer: "ddHifi", modelConfig: { schemeNo: 15, experimental: true } },
    "Dual CS43198": { modelConfig: { schemeNo: 15, experimental: true } },
    "ES9039 HiFi DSP Audio": { modelConfig: { schemeNo: 15, experimental: true } },
    "AE6": { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
    "KM_HA03": { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
    "TP35 Pro": { modelConfig: { schemeNo: 16, maxFilters: 10 } },
    "DA5": { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
    "G303": { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
    "HiFi DSP Audio with PD": { manufacturer: "ddHifi", modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
    "Protocol Max": { manufacturer: "CrinEar", modelConfig: { schemeNo: 16, maxFilters: 10, minGain: -10, maxGain: 10, autoGlobalGain: true, supportsLSHSFilters: true, supportsPregain: true, experimental: false } },
    "CS43198 HiFi DSP Audio": { modelConfig: { schemeNo: 11, maxFilters: 8, minGain: -10, maxGain: 10, autoGlobalGain: true, supportsLSHSFilters: true, supportsPregain: true, experimental: false } }
  },
  deviceGroups: {
    SchemeNo11: {
      productIds: [5076, 39104, 37841, 5079, 4800, 4708, 17361, 4710, 20928, 5057, 5075, 4689, 4706, 4705, 4801, 39125],
      modelConfig: {
        supportsLSHSFilters: false,
        supportsPregain: true
      }
    },
    SchemeNo16: {
      productIds: [17280, 17334, 17377, 17367, 17368, 17380, 39124, 17344, 17384, 63496, 60944, 17234, 60960, 17349, 17382, 17233, 17374, 17240, 17241, 17371, 17242, 17237, 17244, 17245, 17246, 17391, 17388, 17249, 17251, 17254, 17252, 17248, 17282, 17283, 17286, 17350, 17351, 285, 17352, 17370, 17353, 17354, 17356, 17357, 17359, 17329, 17346, 17335, 17336, 14787],
      modelConfig: {
        schemeNo: 16,
        maxFilters: 10,
        minGain: -10,
        maxGain: 10,
        autoGlobalGain: false,
        supportsLSHSFilters: true,
        supportsPregain: true
      }
    }
  }
};
const walkplayHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  registration: registration$d,
  walkplayHidHandler
}, Symbol.toStringTag, { value: "Module" }));
const convertToFilterType$3 = WALKPLAY_FILTER_MAP.fromCode;
const convertFromFilterType$3 = WALKPLAY_FILTER_MAP.toCode;
const REPORT_ID$3 = 75;
const COMMAND_WRITE$1 = 1;
const COMMAND_READ$1 = 128;
const COMMAND_UPDATE_EQ = 9;
const COMMAND_UPDATE_EQ_COEFF_TO_REG = 10;
const COMMAND_SAVE_EQ_TO_FLASH = 1;
const COMMAND_SET_DAC_OFFSET = 3;
function buildReadPacket$1(filterIndex) {
  return new Uint8Array([COMMAND_READ$1, COMMAND_UPDATE_EQ, 24, 0, filterIndex, 0]);
}
function decodeFilterResponse(data) {
  const e = new Int8Array(data.buffer);
  const rawFreq = e[27] & 255 | (e[28] & 255) << 8;
  const freq = rawFreq;
  const q = (e[30] & 255) + (e[29] & 255) / 256;
  const rawGain = e[32] + (e[31] & 255) / 256;
  const gain = Math.floor(rawGain * 10) / 10;
  const filterType = convertToFilterType$3(e[33]);
  const valid = freq > 10 && freq < 24e3 && !isNaN(gain) && !isNaN(q);
  return {
    type: filterType,
    freq: valid ? freq : 0,
    q: valid ? q : 1,
    gain: valid ? gain : 0,
    disabled: !valid
  };
}
async function getCurrentSlot$4(deviceDetails) {
  const device = deviceDetails.rawDevice;
  const request = new Uint8Array([128, 15, 0]);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      device.removeEventListener("inputreport", onReport);
      reject(new Error("Timeout reading current slot"));
    }, 1e3);
    const onReport = (event) => {
      const data = new Uint8Array(event.data.buffer);
      if (data[0] !== 128 || data[1] !== 15) return;
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onReport);
      resolve(data[3]);
    };
    device.addEventListener("inputreport", onReport);
    device.sendReport(REPORT_ID$3, request);
  });
}
async function readFullFilter$1(device, filterIndex) {
  const packet = buildReadPacket$1(filterIndex);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      device.removeEventListener("inputreport", onReport);
      reject(new Error("Timeout reading filter"));
    }, 1e3);
    const onReport = (event) => {
      const data = new Uint8Array(event.data.buffer);
      if (data[0] !== COMMAND_READ$1 || data[1] !== COMMAND_UPDATE_EQ) return;
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onReport);
      resolve(decodeFilterResponse(data));
    };
    device.addEventListener("inputreport", onReport);
    device.sendReport(REPORT_ID$3, packet);
  });
}
async function readPregain$1(device) {
  const request = new Uint8Array([COMMAND_READ$1, COMMAND_SET_DAC_OFFSET]);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      device.removeEventListener("inputreport", onReport);
      reject(new Error("Timeout reading pregain"));
    }, 1e3);
    const onReport = (event) => {
      const data = new Uint8Array(event.data.buffer);
      if (data[0] !== COMMAND_READ$1 || data[1] !== COMMAND_SET_DAC_OFFSET) return;
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onReport);
      resolve(data[4]);
    };
    device.addEventListener("inputreport", onReport);
    device.sendReport(REPORT_ID$3, request);
  });
}
async function writePregain$1(device, value) {
  const request = new Uint8Array([COMMAND_WRITE$1, COMMAND_SET_DAC_OFFSET, 2, 0, value]);
  await device.sendReport(REPORT_ID$3, request);
}
function buildWritePacket(filterIndex, filter) {
  const { freq, gain, q, type } = filter;
  const packet = new Uint8Array(63);
  packet[0] = COMMAND_WRITE$1;
  packet[1] = COMMAND_UPDATE_EQ;
  packet[2] = 24;
  packet[3] = 0;
  packet[4] = filterIndex;
  packet[5] = 0;
  packet[6] = 0;
  const coeffs = biquadCoeffsToBytes(computeMoondropBiquad(freq, gain, q));
  packet.set(coeffs, 7);
  packet[27] = freq & 255;
  packet[28] = freq >> 8 & 255;
  packet[29] = Math.round(q % 1 * 256);
  packet[30] = Math.floor(q);
  packet[31] = Math.round(gain % 1 * 256);
  packet[32] = Math.floor(gain);
  packet[33] = convertFromFilterType$3(type);
  packet[34] = 0;
  packet[35] = 7;
  return packet;
}
function buildEnablePacket(filterIndex) {
  const packet = new Uint8Array(63);
  packet[0] = COMMAND_WRITE$1;
  packet[1] = COMMAND_UPDATE_EQ_COEFF_TO_REG;
  packet[2] = filterIndex;
  packet[3] = 0;
  packet[4] = 255;
  packet[5] = 255;
  packet[6] = 255;
  return packet;
}
function buildSavePacket() {
  return new Uint8Array([COMMAND_WRITE$1, COMMAND_SAVE_EQ_TO_FLASH]);
}
async function pullFromDevice$4(deviceDetails, _slot) {
  const device = deviceDetails.rawDevice;
  const filters = [];
  for (let i = 0; i < deviceDetails.modelConfig.maxFilters; i++) {
    const filter = await readFullFilter$1(device, i);
    filters.push(filter);
  }
  const globalGain = await readPregain$1(device);
  return { filters, globalGain };
}
async function pushToDevice$4(deviceDetails, _slot, globalGain, filters) {
  const device = deviceDetails.rawDevice;
  for (let i = 0; i < filters.length && i < deviceDetails.modelConfig.maxFilters; i++) {
    const writeFilter = buildWritePacket(i, filters[i]);
    await device.sendReport(REPORT_ID$3, writeFilter);
    const enable = buildEnablePacket(i);
    await device.sendReport(REPORT_ID$3, enable);
  }
  await writePregain$1(device, globalGain);
  const save = buildSavePacket();
  await device.sendReport(REPORT_ID$3, save);
  return false;
}
const moondropUsbHidHandler = {
  getCurrentSlot: getCurrentSlot$4,
  pullFromDevice: pullFromDevice$4,
  pushToDevice: pushToDevice$4,
  enablePEQ: async (_device, _enabled, _slotId) => {
  }
};
const moondropUsbHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  moondropUsbHidHandler
}, Symbol.toStringTag, { value: "Module" }));
const REPORT_ID$2 = 75;
const COMMAND_READ = 82;
const COMMAND_WRITE = 87;
const COMMAND_COMMIT = 83;
function buildReadPacket(fieldId) {
  return new Uint8Array([fieldId, 0, 0, 0, COMMAND_READ, 0, 0, 0, 0]);
}
function buildEnableEQPacket(slotId) {
  return new Uint8Array([36, 0, 0, 0, COMMAND_WRITE, 0, slotId, 0, 0, 0]);
}
function buildReadEQPacket() {
  return new Uint8Array([36, 0, 0, 0, COMMAND_READ, 0, 3, 0, 0, 0]);
}
function buildWriteGlobalPacket(value) {
  const signedByte = value < 0 ? value + 256 : value;
  return new Uint8Array([102, 0, 0, 0, COMMAND_WRITE, 0, signedByte, 0, 0, 0]);
}
function buildReadGlobalPacket() {
  return new Uint8Array([102, 0, 0, 0, COMMAND_READ, 0, 0, 0, 0]);
}
function buildWriteGainFreqPacket(filterIndex, gain, freq, compensate2X) {
  const fieldId = 38 + filterIndex * 2;
  const adjustedFreq = compensate2X ? Math.round(freq / 2) : freq;
  const gainRaw = Math.round(gain * 10);
  const gainSigned = gainRaw < 0 ? gainRaw + 65536 : gainRaw;
  const gainLow = gainSigned & 255;
  const gainHigh = gainSigned >> 8 & 255;
  const freqLow = adjustedFreq & 255;
  const freqHigh = adjustedFreq >> 8 & 255;
  return new Uint8Array([
    fieldId,
    0,
    0,
    0,
    COMMAND_WRITE,
    0,
    gainLow,
    gainHigh,
    freqLow,
    freqHigh
  ]);
}
function buildWriteQPacket(filterIndex, q, filterType) {
  const fieldId = 38 + filterIndex * 2 + 1;
  const qRaw = Math.round(q * 1e3);
  const qLow = qRaw & 255;
  const qHigh = qRaw >> 8 & 255;
  const typeCode = convertFromFilterType$2(filterType);
  return new Uint8Array([
    fieldId,
    0,
    0,
    0,
    COMMAND_WRITE,
    0,
    qLow,
    qHigh,
    typeCode,
    0
  ]);
}
function buildCommitPacket() {
  return new Uint8Array([0, 0, 0, 0, COMMAND_COMMIT, 0, 0, 0, 0]);
}
function decodeGainFreqResponse(data, compensate2X) {
  const gainRaw = data[6] | data[7] << 8;
  const gain = gainRaw > 32767 ? (gainRaw - 65536) / 10 : gainRaw / 10;
  let freq = data[8] | data[9] << 8;
  if (compensate2X) {
    freq = freq * 2;
  }
  return { gain, freq };
}
function decodeQResponse(data) {
  const qRaw = data[6] | data[7] << 8;
  const q = qRaw / 1e3;
  const typeCode = data[8];
  const type = convertToFilterType$2(typeCode);
  return { q, type };
}
const convertToFilterType$2 = KTMICRO_FILTER_MAP.fromCode;
const convertFromFilterType$2 = KTMICRO_FILTER_MAP.toCode;
function waitForReport(device, matchFieldId, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      device.removeEventListener("inputreport", onReport);
      reject(new Error(`Timeout waiting for response to field 0x${matchFieldId.toString(16)}`));
    }, timeout);
    const onReport = (event) => {
      const data = new Uint8Array(event.data.buffer);
      if (data[0] === matchFieldId) {
        clearTimeout(timer);
        device.removeEventListener("inputreport", onReport);
        resolve(data);
      }
    };
    device.addEventListener("inputreport", onReport);
  });
}
async function readFullFilter(device, filterIndex, compensate2X) {
  const gainFreqFieldId = 38 + filterIndex * 2;
  const qFieldId = gainFreqFieldId + 1;
  const gainFreqPromise = waitForReport(device, gainFreqFieldId, 5e3);
  const qPromise = waitForReport(device, qFieldId, 5e3);
  const gainFreqPacket = buildReadPacket(gainFreqFieldId);
  const qPacket = buildReadPacket(qFieldId);
  await device.sendReport(REPORT_ID$2, gainFreqPacket);
  await device.sendReport(REPORT_ID$2, qPacket);
  const [gainFreqData, qData] = await Promise.all([gainFreqPromise, qPromise]);
  const { gain, freq } = decodeGainFreqResponse(gainFreqData, compensate2X);
  const { q, type } = decodeQResponse(qData);
  return {
    type,
    freq,
    q,
    gain,
    disabled: gain === 0 && freq === 0
  };
}
async function readPregain(device) {
  const promise = waitForReport(device, 102, 5e3);
  const packet = buildReadGlobalPacket();
  await device.sendReport(REPORT_ID$2, packet);
  const data = await promise;
  const raw = data[6];
  return raw > 127 ? raw - 256 : raw;
}
async function writePregain(device, value) {
  const packet = buildWriteGlobalPacket(value);
  await device.sendReport(REPORT_ID$2, packet);
}
const ktmicroUsbHidHandler = {
  async getCurrentSlot(deviceDetails) {
    const device = deviceDetails.rawDevice;
    const promise = waitForReport(device, 36, 5e3);
    const packet = buildReadEQPacket();
    await device.sendReport(REPORT_ID$2, packet);
    const data = await promise;
    return data[6];
  },
  async pullFromDevice(deviceDetails, _slot) {
    const device = deviceDetails.rawDevice;
    const compensate2X = deviceDetails.modelConfig.compensate2X ?? false;
    const maxFilters = deviceDetails.modelConfig.maxFilters;
    const filters = [];
    for (let i = 0; i < maxFilters; i++) {
      const filter = await readFullFilter(device, i, compensate2X);
      filters.push(filter);
    }
    let globalGain = 0;
    if (deviceDetails.modelConfig.supportsPregain) {
      globalGain = await readPregain(device);
    }
    return { filters, globalGain };
  },
  async pushToDevice(deviceDetails, slot, preamp, filters) {
    const device = deviceDetails.rawDevice;
    const compensate2X = deviceDetails.modelConfig.compensate2X ?? false;
    const maxFilters = deviceDetails.modelConfig.maxFilters;
    const currentSlot = await ktmicroUsbHidHandler.getCurrentSlot(deviceDetails);
    if (currentSlot === deviceDetails.modelConfig.disabledPresetId) {
      await ktmicroUsbHidHandler.enablePEQ(deviceDetails, true, slot);
    }
    const filtersToWrite = Math.min(filters.length, maxFilters);
    for (let i = 0; i < filtersToWrite; i++) {
      const filter = filters[i];
      const gain = filter.disabled ? 0 : filter.gain;
      const gainFreqPacket = buildWriteGainFreqPacket(i, gain, filter.freq, compensate2X);
      await device.sendReport(REPORT_ID$2, gainFreqPacket);
      const qPacket = buildWriteQPacket(i, filter.q, filter.type);
      await device.sendReport(REPORT_ID$2, qPacket);
    }
    if (deviceDetails.modelConfig.supportsPregain) {
      await writePregain(device, preamp);
    }
    const commitPacket = buildCommitPacket();
    await device.sendReport(REPORT_ID$2, commitPacket);
    console.log("KTMicro: PEQ filters pushed successfully.");
    return deviceDetails.modelConfig.disconnectOnSave;
  },
  async enablePEQ(deviceDetails, enabled, slotId) {
    const device = deviceDetails.rawDevice;
    const targetSlot = enabled ? slotId : deviceDetails.modelConfig.disabledPresetId;
    const packet = buildEnableEQPacket(targetSlot);
    await device.sendReport(REPORT_ID$2, packet);
  }
};
const registration$c = {
  vendorIds: [12722],
  manufacturer: "KT Micro",
  handler: ktmicroUsbHidHandler,
  defaultModelConfig: {
    minGain: -12,
    maxGain: 12,
    maxFilters: 5,
    firstWritableEQSlot: -1,
    maxWritableEQSlots: 0,
    compensate2X: true,
    disconnectOnSave: true,
    disabledPresetId: 2,
    experimental: false,
    supportsPregain: false,
    supportsLSHSFilters: true,
    defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: "PK" }],
    availableSlots: [{ id: 3, name: "Custom" }]
  },
  devices: {
    "Kiwi Ears-Allegro PRO": { manufacturer: "Kiwi Ears", modelConfig: { supportsLSHSFilters: false, disconnectOnSave: true } },
    "KT02H20 HIFI Audio": { manufacturer: "JCally", modelConfig: { supportsLSHSFilters: false } },
    "TANCHJIM BUNNY DSP": { manufacturer: "TANCHJIM", modelConfig: { compensate2X: false, supportsPregain: true } },
    "TANCHJIM FISSION": { manufacturer: "TANCHJIM", modelConfig: { compensate2X: false, supportsPregain: true } },
    "CDSP": { manufacturer: "Moondrop", modelConfig: { compensate2X: false } },
    "Chu2 DSP": { manufacturer: "Moondrop", modelConfig: { compensate2X: false } }
  }
};
const ktmicroUsbHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ktmicroUsbHidHandler,
  registration: registration$c
}, Symbol.toStringTag, { value: "Module" }));
const REPORT_ID$1 = 75;
const EQ_REG_BASE = 38;
const WRITE_REG = 87;
const SAVE_REG = 83;
const READ_REG = 82;
const PACKET_LEN = 10;
const SCALE_GAIN = 10;
const SCALE_Q = 1e3;
const DELAY_MS = 100;
const ADDR = 0;
const CMD$1 = 4;
const DATA_SLOT_GAIN = 6;
const DATA_SLOT_Q = 6;
const DATA_SLOT_FREQUENCY = 8;
function sleep(ms = DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getFilterRegAddr(filterIndex) {
  return EQ_REG_BASE + filterIndex * 2;
}
function createPacket$1(builder) {
  const buffer = new ArrayBuffer(PACKET_LEN);
  const view = new DataView(buffer);
  builder(view);
  return new Uint8Array(buffer);
}
async function readRegister(device, addr) {
  const packet = createPacket$1((view) => {
    view.setUint8(ADDR, addr);
    view.setUint8(CMD$1, READ_REG);
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      device.removeEventListener("inputreport", onReport);
      reject(new Error("Timeout reading register"));
    }, 1e3);
    const onReport = (event) => {
      const data = new DataView(event.data.buffer);
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onReport);
      resolve(data);
    };
    device.addEventListener("inputreport", onReport);
    device.sendReport(REPORT_ID$1, packet);
  });
}
async function writeRegister(device, addr, dataBuilder) {
  const packet = createPacket$1((view) => {
    view.setUint8(ADDR, addr);
    view.setUint8(CMD$1, WRITE_REG);
    dataBuilder(view);
  });
  await device.sendReport(REPORT_ID$1, packet);
}
async function readSingleFilter(device, filterIndex) {
  const regAddr = getFilterRegAddr(filterIndex);
  const data1 = await readRegister(device, regAddr);
  const freq = data1.getUint16(DATA_SLOT_FREQUENCY, true);
  const gainRaw = data1.getInt8(DATA_SLOT_GAIN);
  const gain = Math.max(-12.8, Math.min(12.7, gainRaw / SCALE_GAIN));
  await sleep();
  const data2 = await readRegister(device, regAddr + 1);
  const q = data2.getInt16(DATA_SLOT_Q, true) / SCALE_Q;
  return { freq, gain, q, type: "PK" };
}
async function writeSingleFilter(device, filterIndex, filter) {
  const regAddr = getFilterRegAddr(filterIndex);
  await writeRegister(device, regAddr, (view) => {
    const gainVal = Math.round(filter.gain * SCALE_GAIN);
    const clampedGain = Math.max(-128, Math.min(127, gainVal));
    view.setInt8(DATA_SLOT_GAIN, clampedGain);
    view.setUint16(DATA_SLOT_FREQUENCY, filter.freq, true);
  });
  await sleep();
  await writeRegister(device, regAddr + 1, (view) => {
    const qVal = Math.round(filter.q * SCALE_Q);
    view.setInt16(DATA_SLOT_Q, qVal, true);
  });
  await sleep();
}
async function saveToFlash(device) {
  const packet = createPacket$1((view) => {
    view.setUint8(CMD$1, SAVE_REG);
  });
  await device.sendReport(REPORT_ID$1, packet);
}
const moondropOldFashionedHidHandler = {
  async getCurrentSlot(_device) {
    return 0;
  },
  async pullFromDevice(deviceDetails) {
    const device = deviceDetails.rawDevice;
    const filters = [];
    const filterCount = deviceDetails.modelConfig.maxFilters || 5;
    for (let i = 0; i < filterCount; i++) {
      const filter = await readSingleFilter(device, i);
      filters.push(filter);
      await sleep();
    }
    return { filters, globalGain: 0 };
  },
  async pushToDevice(deviceDetails, _slot, _preamp, filters) {
    const device = deviceDetails.rawDevice;
    const filterCount = deviceDetails.modelConfig.maxFilters || 5;
    for (let i = 0; i < filters.length && i < filterCount; i++) {
      await writeSingleFilter(device, i, filters[i]);
    }
    await saveToFlash(device);
    console.log(`USB Device PEQ: Old Fashioned pushed ${filters.length} filters`);
    return false;
  },
  async enablePEQ() {
  }
};
const moondropOldFashionedHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  moondropOldFashionedHidHandler
}, Symbol.toStringTag, { value: "Module" }));
const HEADER = 119;
const CMD = {
  SET_EQ_MODE: 138,
  GET_EQ_MODE: 139,
  SET_EQ_PARAMS: 141,
  GET_EQ_PARAMS: 142,
  RESET_EQ_PARAMS: 144,
  GET_EQ_MODE_COUNT: 145,
  SET_AND_SAVE_EQ_MODE: 146,
  SET_EQ_ENABLE: 157,
  GET_EQ_ENABLE: 158,
  SET_VOLUME: 147,
  GET_VOLUME: 148,
  GET_FIRMWARE_VERSION: 166
};
const REPORT_ID = 1;
const PACKET_SIZE = 63;
function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function makePacket(cmd, index = 0) {
  const packet = new Uint8Array(PACKET_SIZE);
  packet[0] = HEADER;
  packet[1] = cmd;
  packet[2] = index;
  return packet;
}
function convertFromFilterType$1(filterType) {
  const mapping = { PK: 2, LSQ: 1, HSQ: 3 };
  return mapping[filterType] ?? 2;
}
function convertToFilterType$1(value) {
  switch (value) {
    case 1:
      return "LSQ";
    case 3:
      return "HSQ";
    default:
      return "PK";
  }
}
function encodeBandParams(presetId, bandIndex, filter) {
  const packet = new Uint8Array(PACKET_SIZE);
  const view = new DataView(packet.buffer);
  packet[0] = HEADER;
  packet[1] = CMD.SET_EQ_PARAMS;
  packet[2] = presetId;
  packet[3] = bandIndex;
  packet[4] = convertFromFilterType$1(filter.type || "PK");
  view.setFloat32(5, filter.freq || 1e3, true);
  view.setFloat32(9, filter.q || 1, true);
  view.setFloat32(13, 0, true);
  view.setFloat32(17, filter.gain || 0, true);
  return packet;
}
function parseBandParams(data) {
  if (data.length < 22) return null;
  const view = new DataView(data.buffer, data.byteOffset);
  if (data[1] !== HEADER) return null;
  const presetId = data[3];
  const bandIndex = data[4];
  const filterType = data[5];
  const freq = view.getFloat32(6, true);
  const q = view.getFloat32(10, true);
  const gain = view.getFloat32(18, true);
  return {
    presetId,
    bandIndex,
    type: convertToFilterType$1(filterType),
    freq,
    q,
    gain,
    disabled: gain === 0 && freq === 0
  };
}
async function sendCommand$1(device, reportId, cmd, index = 0, delay2 = 0) {
  const packet = makePacket(cmd, index);
  console.log(
    `USB Device PEQ: Fosi Audio sending feature [0x${packet[0].toString(16)}, 0x${packet[1].toString(16)}, ${packet[2]}]`
  );
  await device.sendFeatureReport(reportId, packet);
  if (delay2 > 0) await waitMs(delay2);
}
async function receiveFeatureReport(device, reportId) {
  try {
    const dataView = await device.receiveFeatureReport(reportId);
    console.log(
      `USB Device PEQ: Fosi Audio received feature report:`,
      Array.from(new Uint8Array(dataView.buffer).slice(0, 25))
    );
    return dataView;
  } catch (e) {
    console.error("USB Device PEQ: Fosi Audio receiveFeatureReport failed:", e);
    return null;
  }
}
async function sendBandCommit(device, reportId, presetId, bandIndex) {
  const packet = new Uint8Array(PACKET_SIZE);
  packet[0] = HEADER;
  packet[1] = CMD.GET_EQ_PARAMS;
  packet[2] = presetId;
  packet[3] = bandIndex;
  console.log(`USB Device PEQ: Fosi Audio commit band ${bandIndex} of preset ${presetId}`);
  await device.sendReport(reportId, packet);
}
const fosiAudioUsbHidHandler = {
  async getCurrentSlot(_deviceDetails) {
    console.log("USB Device PEQ: Fosi Audio getCurrentSlot - returning Custom 1 (7)");
    return 7;
  },
  async pullFromDevice(deviceDetails, slot) {
    const device = deviceDetails.rawDevice;
    const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;
    const maxFilters = deviceDetails.modelConfig.maxFilters || 10;
    try {
      console.log(`USB Device PEQ: Fosi Audio pulling from device (mode ${slot})...`);
      const filters = [];
      let responseCount = 0;
      await sendCommand$1(device, reportId, CMD.SET_EQ_MODE, slot);
      for (let i = 0; i < maxFilters; i++) {
        const packet = new Uint8Array(PACKET_SIZE);
        packet[0] = HEADER;
        packet[1] = CMD.GET_EQ_PARAMS;
        packet[2] = slot;
        packet[3] = i;
        await device.sendFeatureReport(reportId, packet);
        const response = await receiveFeatureReport(device, reportId);
        if (response) {
          const data = new Uint8Array(response.buffer);
          const parsed = parseBandParams(data);
          if (parsed && parsed.bandIndex === i) {
            filters[i] = {
              type: parsed.type,
              freq: parsed.freq,
              q: parsed.q,
              gain: parsed.gain,
              disabled: parsed.disabled
            };
            responseCount++;
            console.log(
              `USB Device PEQ: Fosi Audio band ${i}: ${parsed.freq}Hz ${parsed.gain}dB Q=${parsed.q}`
            );
          }
        }
        await waitMs(20);
      }
      console.log(`USB Device PEQ: Fosi Audio received ${responseCount} band responses`);
      for (let i = 0; i < maxFilters; i++) {
        if (!filters[i]) {
          filters[i] = { type: "PK", freq: 1e3, q: 1, gain: 0, disabled: true };
        }
      }
      return { filters, globalGain: 0 };
    } catch (error) {
      console.error("USB Device PEQ: Fosi Audio pullFromDevice failed:", error);
      throw error;
    }
  },
  async pushToDevice(deviceDetails, slot, _preamp, filters) {
    const device = deviceDetails.rawDevice;
    const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;
    const maxFilters = Math.min(filters.length, deviceDetails.modelConfig.maxFilters || 10);
    try {
      console.log(`USB Device PEQ: Fosi Audio pushing ${maxFilters} filters to preset ${slot}...`);
      await sendCommand$1(device, reportId, CMD.GET_EQ_MODE_COUNT, 0, 50);
      await sendCommand$1(device, reportId, CMD.SET_EQ_MODE, slot, 30);
      for (let i = 0; i < maxFilters; i++) {
        const filter = filters[i];
        const filterToWrite = filter.disabled ? { type: "PK", freq: 1e3, q: 1, gain: 0 } : filter;
        const packet = encodeBandParams(slot, i, filterToWrite);
        console.log(
          `USB Device PEQ: Fosi Audio writing band ${i}: freq=${filterToWrite.freq}Hz gain=${filterToWrite.gain}dB q=${filterToWrite.q}`
        );
        await device.sendFeatureReport(reportId, packet);
        await waitMs(20);
        await sendBandCommit(device, reportId, slot, i);
        await waitMs(20);
      }
      await sendCommand$1(device, reportId, CMD.SET_AND_SAVE_EQ_MODE, slot, 50);
      console.log("USB Device PEQ: Fosi Audio push complete");
      return deviceDetails.modelConfig.disconnectOnSave || false;
    } catch (error) {
      console.error("USB Device PEQ: Fosi Audio pushToDevice failed:", error);
      throw error;
    }
  },
  async enablePEQ(deviceDetails, enable, slotId) {
    const device = deviceDetails.rawDevice;
    const reportId = deviceDetails.modelConfig.reportId || REPORT_ID;
    console.log(
      `USB Device PEQ: Fosi Audio ${enable ? "enabling" : "disabling"} PEQ (preset ${slotId})`
    );
    await sendCommand$1(device, reportId, CMD.GET_EQ_MODE_COUNT, 0, 30);
    if (enable) {
      await sendCommand$1(device, reportId, CMD.SET_EQ_MODE, slotId, 30);
    } else {
      await sendCommand$1(device, reportId, CMD.SET_EQ_MODE, 0, 30);
    }
  }
};
const registration$b = {
  vendorIds: [5418],
  manufacturer: "Fosi Audio",
  handler: fosiAudioUsbHidHandler,
  defaultModelConfig: {
    minGain: -12,
    maxGain: 12,
    maxFilters: 10,
    firstWritableEQSlot: 7,
    maxWritableEQSlots: 5,
    disconnectOnSave: false,
    disabledPresetId: 0,
    experimental: true,
    supportsPregain: false,
    supportsLSHSFilters: true,
    defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: "PK" }],
    reportId: 1,
    availableSlots: [
      { id: 0, name: "Bypass" },
      { id: 7, name: "Custom 1" },
      { id: 8, name: "Custom 2" },
      { id: 9, name: "Custom 3" },
      { id: 10, name: "Custom 4" },
      { id: 11, name: "Custom 5" }
    ]
  },
  devices: {
    "Fosi Audio DS3": {
      modelConfig: {
        maxFilters: 10,
        disconnectOnSave: false,
        firstWritableEQSlot: 7,
        maxWritableEQSlots: 5,
        experimental: false,
        availableSlots: [
          { id: 0, name: "Bypass" },
          { id: 7, name: "Custom 1" },
          { id: 8, name: "Custom 2" },
          { id: 9, name: "Custom 3" },
          { id: 10, name: "Custom 4" },
          { id: 11, name: "Custom 5" }
        ]
      }
    }
  }
};
const fosiAudioUsbHid = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fosiAudioUsbHidHandler,
  registration: registration$b
}, Symbol.toStringTag, { value: "Module" }));
const DESCRIBE_COMMAND = { Product: "JDS Labs Element IV", Action: "Describe" };
const FILTER_12_BAND_ORDER = [
  "Lowshelf 1",
  "Lowshelf 2",
  "Peaking 1",
  "Peaking 2",
  "Peaking 3",
  "Peaking 4",
  "Peaking 5",
  "Peaking 6",
  "Peaking 7",
  "Peaking 8",
  "Highshelf 1",
  "Highshelf 2"
];
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
async function sendJsonCommand(device, json) {
  const payload = JSON.stringify(json) + "\0";
  const encoded = textEncoder.encode(payload);
  if (!device.writable) {
    throw new Error("JDS Labs: Device writable stream not available");
  }
  await device.writable.write(encoded);
  console.log("JDS Labs: Sent command:", json);
}
async function readJsonResponse(device) {
  if (!device.readable) {
    throw new Error("JDS Labs: Device readable stream not available");
  }
  let buffer = "";
  const startTime = Date.now();
  const timeout = 1e4;
  while (Date.now() - startTime < timeout) {
    const result = await device.readable.read();
    if (result.done) break;
    const chunk = textDecoder.decode(result.value);
    buffer += chunk;
    const nullIndex = buffer.indexOf("\0");
    if (nullIndex !== -1) {
      const jsonStr = buffer.substring(0, nullIndex);
      console.log("JDS Labs: Received response:", jsonStr);
      return JSON.parse(jsonStr);
    }
  }
  throw new Error("JDS Labs: Timeout waiting for response");
}
function transformFilterType(bandName) {
  const lower = bandName.toLowerCase();
  if (lower.startsWith("lowshelf")) return "LSQ";
  if (lower.startsWith("highshelf")) return "HSQ";
  return "PK";
}
const jdsLabsUsbSerialHandler = {
  async getCurrentSlot(deviceDetails) {
    await sendJsonCommand(deviceDetails, DESCRIBE_COMMAND);
    const response = await readJsonResponse(deviceDetails);
    const general = response["General"];
    if (general && general["Input Mode"]) {
      const inputMode = general["Input Mode"].Current;
      if (inputMode === "USB") {
        return 0;
      }
      return 1;
    }
    return 0;
  },
  async pullFromDevice(deviceDetails, _slot) {
    await sendJsonCommand(deviceDetails, DESCRIBE_COMMAND);
    const response = await readJsonResponse(deviceDetails);
    const filters = [];
    let globalGain = 0;
    const dsp = response["DSP"];
    if (!dsp) {
      console.warn("JDS Labs: No DSP data in response");
      return { filters, globalGain };
    }
    const headphone = dsp["Headphone"];
    if (!headphone) {
      console.warn("JDS Labs: No Headphone config in DSP");
      return { filters, globalGain };
    }
    const preamp = headphone["Preamp"];
    if (preamp) {
      globalGain = preamp.Current;
    }
    for (const bandName of FILTER_12_BAND_ORDER) {
      const band = headphone[bandName];
      if (band) {
        const filterType = transformFilterType(bandName);
        filters.push({
          type: filterType,
          freq: band.Frequency,
          q: band.Q,
          gain: band.Gain,
          disabled: band.Gain === 0
        });
      }
    }
    return { filters, globalGain };
  },
  async pushToDevice(deviceDetails, _slot, preamp, filters) {
    const lsqFilters = [];
    const pkFilters = [];
    const hsqFilters = [];
    for (const filter of filters) {
      switch (filter.type) {
        case "LSQ":
          if (lsqFilters.length < 2) lsqFilters.push(filter);
          break;
        case "HSQ":
          if (hsqFilters.length < 2) hsqFilters.push(filter);
          break;
        case "PK":
        default:
          if (pkFilters.length < 8) pkFilters.push(filter);
          break;
      }
    }
    const dspConfig = {};
    for (let i = 0; i < 2; i++) {
      const bandName = `Lowshelf ${i + 1}`;
      if (i < lsqFilters.length && !lsqFilters[i].disabled) {
        dspConfig[bandName] = {
          Frequency: lsqFilters[i].freq,
          Gain: lsqFilters[i].gain,
          Q: lsqFilters[i].q
        };
      } else {
        dspConfig[bandName] = { Frequency: 100, Gain: 0, Q: 0.707 };
      }
    }
    for (let i = 0; i < 8; i++) {
      const bandName = `Peaking ${i + 1}`;
      if (i < pkFilters.length && !pkFilters[i].disabled) {
        dspConfig[bandName] = {
          Frequency: pkFilters[i].freq,
          Gain: pkFilters[i].gain,
          Q: pkFilters[i].q
        };
      } else {
        dspConfig[bandName] = { Frequency: 1e3, Gain: 0, Q: 1 };
      }
    }
    for (let i = 0; i < 2; i++) {
      const bandName = `Highshelf ${i + 1}`;
      if (i < hsqFilters.length && !hsqFilters[i].disabled) {
        dspConfig[bandName] = {
          Frequency: hsqFilters[i].freq,
          Gain: hsqFilters[i].gain,
          Q: hsqFilters[i].q
        };
      } else {
        dspConfig[bandName] = { Frequency: 1e4, Gain: 0, Q: 0.707 };
      }
    }
    const updatePayload = {
      Product: "JDS Labs Element IV",
      Action: "Update",
      DSP: {
        Headphone: {
          Preamp: preamp,
          ...dspConfig
        }
      }
    };
    await sendJsonCommand(deviceDetails, updatePayload);
    const response = await readJsonResponse(deviceDetails);
    console.log("JDS Labs: Update response:", response);
    return deviceDetails.modelConfig.disconnectOnSave;
  },
  async enablePEQ(_deviceDetails, _enabled, _slotId) {
  }
};
const registration$a = {
  vendorId: 5418,
  manufacturer: "JDS Labs",
  handler: jdsLabsUsbSerialHandler,
  devices: {
    "Element IV": {
      usbProductId: 35066,
      modelConfig: {
        minGain: -12,
        maxGain: 12,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        availableSlots: [
          { id: 0, name: "Headphones" },
          { id: 1, name: "RCA" }
        ]
      }
    }
  }
};
const jdsLabsUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  jdsLabsUsbSerialHandler,
  registration: registration$a
}, Symbol.toStringTag, { value: "Module" }));
const PROTOCOL_HEADER = [85, 96, 1, 0, 0, 0, 0, 0];
const READ_COMMANDS = {
  READ_EQ_MODE: 49183,
  READ_EQ_VALUES: 49229
};
const WRITE_COMMANDS = {
  SET_ADVANCE_CUSTOM_EQ_VALUE: 61520
};
const RESPONSE_COMMANDS = {
  EQ_MODE: 16415,
  EQ_VALUES: 16461
};
function crc16(buffer) {
  let crc = 65535;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = crc >> 1 ^ 40961;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}
function bytesToFloat(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getFloat32(0, true);
}
function floatToBytes(value) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  return [
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  ];
}
async function sendCommand(device, command, payload, _operation) {
  if (!device.writable) {
    throw new Error("Nothing: Device writable stream not available");
  }
  const header = [...PROTOCOL_HEADER];
  header[2] = command & 255;
  header[3] = command >> 8 & 255;
  const payloadLength = payload.length;
  header[6] = payloadLength & 255;
  header[7] = payloadLength >> 8 & 255;
  const fullPacket = [...header, ...payload];
  const checksum = crc16(fullPacket);
  fullPacket.push(checksum & 255);
  fullPacket.push(checksum >> 8 & 255);
  const data = new Uint8Array(fullPacket);
  console.log(`Nothing: sendCommand ${_operation} (0x${command.toString(16)})`, data);
  await device.writable.write(data);
}
async function readResponse$2(device) {
  if (!device.readable) {
    throw new Error("Nothing: Device readable stream not available");
  }
  const startTime = Date.now();
  const timeout = 1e4;
  let buffer = new Uint8Array(0);
  while (Date.now() - startTime < timeout) {
    const result = await device.readable.read();
    if (result.done) break;
    if (result.value) {
      const newBuffer = new Uint8Array(buffer.length + result.value.length);
      newBuffer.set(buffer);
      newBuffer.set(result.value, buffer.length);
      buffer = newBuffer;
    }
    if (buffer.length >= 10) {
      if (buffer[0] !== 85 || buffer[1] !== 96) {
        throw new Error("Nothing: Invalid response header");
      }
      const command = buffer[2] | buffer[3] << 8;
      const payloadLength = buffer[6] | buffer[7] << 8;
      const totalLength = 8 + payloadLength + 2;
      if (buffer.length >= totalLength) {
        const payload = buffer.slice(8, 8 + payloadLength);
        console.log(`Nothing: readResponse command=0x${command.toString(16)}`, payload);
        return { command, payload };
      }
    }
  }
  throw new Error("Nothing: Timeout waiting for response");
}
function createEQDataPacket(profileIndex, eqBands, totalGain) {
  const data = [];
  data.push(profileIndex);
  data.push(eqBands.length);
  data.push(...floatToBytes(totalGain));
  for (const band of eqBands) {
    const typeCode = convertFromFilterType(band.type);
    data.push(typeCode);
    data.push(...floatToBytes(band.disabled ? 0 : band.gain));
    data.push(...floatToBytes(band.freq));
    data.push(...floatToBytes(band.q));
  }
  return data;
}
const convertToFilterType = WALKPLAY_FILTER_MAP.fromCode;
const convertFromFilterType = WALKPLAY_FILTER_MAP.toCode;
async function readEQMode(device) {
  await sendCommand(device, READ_COMMANDS.READ_EQ_MODE, [], "readEQMode");
  const response = await readResponse$2(device);
  if (response.command !== RESPONSE_COMMANDS.EQ_MODE) {
    throw new Error(
      `Nothing: Unexpected response command 0x${response.command.toString(16)} (expected EQ_MODE)`
    );
  }
  return response.payload[0];
}
async function readEQValues(device) {
  await sendCommand(device, READ_COMMANDS.READ_EQ_VALUES, [], "readEQValues");
  const response = await readResponse$2(device);
  if (response.command !== RESPONSE_COMMANDS.EQ_VALUES) {
    throw new Error(
      `Nothing: Unexpected response command 0x${response.command.toString(16)} (expected EQ_VALUES)`
    );
  }
  const filters = [];
  const payload = response.payload;
  const bandSize = 13;
  const numBands = Math.floor(payload.length / bandSize);
  for (let i = 0; i < numBands; i++) {
    const offset = i * bandSize;
    const typeCode = payload[offset];
    const gain = bytesToFloat(payload, offset + 1);
    const freq = bytesToFloat(payload, offset + 5);
    const q = bytesToFloat(payload, offset + 9);
    const type = convertToFilterType(typeCode);
    filters.push({
      type,
      freq: Math.round(freq),
      q: Math.round(q * 100) / 100,
      gain: Math.round(gain * 10) / 10,
      disabled: gain === 0
    });
  }
  return filters;
}
const nothingUsbSerialHandler = {
  async getCurrentSlot(deviceDetails) {
    return await readEQMode(deviceDetails);
  },
  async pullFromDevice(deviceDetails, _slot) {
    const currentSlot = await readEQMode(deviceDetails);
    const firstWritableSlot = deviceDetails.modelConfig.firstWritableEQSlot;
    if (currentSlot < firstWritableSlot) {
      console.log(
        `Nothing: Current slot ${currentSlot} is not writable (first writable: ${firstWritableSlot}), returning empty`
      );
      return { filters: [], globalGain: 0 };
    }
    const filters = await readEQValues(deviceDetails);
    return { filters, globalGain: 0 };
  },
  async pushToDevice(deviceDetails, _slot, preamp, filters) {
    const firstWritableSlot = deviceDetails.modelConfig.firstWritableEQSlot;
    const eqData = createEQDataPacket(firstWritableSlot, filters, preamp);
    await sendCommand(
      deviceDetails,
      WRITE_COMMANDS.SET_ADVANCE_CUSTOM_EQ_VALUE,
      eqData,
      "pushToDevice"
    );
    const response = await readResponse$2(deviceDetails);
    console.log("Nothing: Push response command:", response.command);
    return deviceDetails.modelConfig.disconnectOnSave;
  },
  async enablePEQ(_deviceDetails, _enabled, _slotId) {
  }
};
const registration$9 = {
  manufacturer: "Nothing",
  handler: nothingUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: ["aeac4a03-dff5-498f-843a-34487cf133eb"],
    bluetoothServiceClassId: "aeac4a03-dff5-498f-843a-34487cf133eb"
  },
  devices: {
    "Nothing Headphones": {
      modelConfig: {
        minGain: -12,
        maxGain: 12,
        maxFilters: 8,
        firstWritableEQSlot: 5,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        readOnly: false,
        flatEQPhoneMeasurement: "Nothing HP1 Balanced",
        availableSlots: [
          { id: 0, name: "Balanced" },
          { id: 1, name: "Voice" },
          { id: 2, name: "More Treble" },
          { id: 3, name: "More Bass" },
          { id: 5, name: "Custom" }
        ]
      }
    }
  }
};
const nothingUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  nothingUsbSerialHandler,
  registration: registration$9
}, Symbol.toStringTag, { value: "Module" }));
let __serialIsSending = false;
async function sendReportAndListen(device, data, endByte = END_HEADERS) {
  if (__serialIsSending) throw new Error("Port is busy");
  __serialIsSending = true;
  const port = device.rawDevice;
  if (!port || !port.readable || !port.writable) {
    __serialIsSending = false;
    throw new Error("Serial port not available");
  }
  let writer = null;
  let reader = null;
  const buffer = [];
  const overallTimeoutMs = 5e3;
  const startedAt = Date.now();
  let timerId = null;
  let expectedTotal = null;
  try {
    writer = port.writable.getWriter();
    await writer.write(data);
    try {
      writer.releaseLock();
    } catch {
    }
    reader = port.readable.getReader();
    await Promise.all([
      Promise.resolve(),
      (async () => {
        while (true) {
          const elapsed = Date.now() - startedAt;
          if (elapsed >= overallTimeoutMs) return;
          const remaining = overallTimeoutMs - elapsed;
          const race = await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              timerId = setTimeout(() => {
                reader.cancel().catch(() => {
                });
                reject(new Error("Timeout"));
              }, remaining);
            })
          ]);
          const { value, done } = race;
          if (done) break;
          const chunk = Array.from(value || []);
          if (chunk.length > 0) {
            buffer.push(...chunk);
            if (expectedTotal == null && buffer.length >= 6) {
              const len = buffer[5] || 0;
              expectedTotal = 6 + len + 2;
            }
            if (expectedTotal != null && buffer.length >= expectedTotal) {
              if (buffer[expectedTotal - 1] === endByte) {
                buffer.splice(expectedTotal);
                return;
              }
            }
          }
          clearTimeout(timerId);
          timerId = null;
        }
      })()
    ]);
    return buffer.length > 0 ? new Uint8Array(buffer) : new Uint8Array(0);
  } catch (e) {
    if (e instanceof Error && e.message === "Timeout") {
      return new Uint8Array(0);
    }
    throw e;
  } finally {
    if (timerId) clearTimeout(timerId);
    try {
      if (reader) reader.releaseLock();
    } catch (_) {
    }
    __serialIsSending = false;
  }
}
function createCommandPacket(header1, header2, command, data = []) {
  const packet = [header1, header2, 0, 0, command];
  if (data.length > 0) {
    packet.push(data.length);
    packet.push(...data);
    packet.push(0);
  } else {
    packet.push(0, 0);
  }
  packet.push(END_HEADERS);
  return new Uint8Array(packet);
}
const createGetEqCountCmd = () => createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FILTER_COUNT);
const createGetEqBandCmd = (bandIndex) => createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_FILTER_PARAMS, [bandIndex]);
const createGetEqPresetCmd = () => createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_PRESET_SWITCH);
const createGetGlobalGainCmd = () => createCommandPacket(GET_HEADER1, GET_HEADER2, PEQ_GLOBAL_GAIN);
const createSetGlobalGainCmd = (gain) => {
  const value = Math.round(gain * 10);
  const v16 = (value % 65536 + 65536) % 65536;
  const hi = v16 >> 8 & 255;
  const lo = v16 & 255;
  return createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_GLOBAL_GAIN, [hi, lo]);
};
function parseGain(byte1, byte2) {
  let v = (byte1 << 8 | byte2) & 65535;
  if (v & 32768) v = v - 65536;
  return v / 10;
}
function parseQValue(byte1, byte2) {
  const v = (byte1 << 8 | byte2) & 65535;
  return v / 100;
}
function encodeSignedHundredths(value) {
  const v = Math.round(value * 10);
  const v16 = (v % 65536 + 65536) % 65536;
  return [v16 >> 8 & 255, v16 & 255];
}
function encodeUnsignedHundredths(value) {
  const v = Math.round(value * 100);
  const v16 = v & 65535;
  return [v16 >> 8 & 255, v16 & 255];
}
function createSetEqBandCommand(bandIndex, frequency, gain, qValue, filterType) {
  const [gHi, gLo] = encodeSignedHundredths(gain);
  const freq = Math.round(frequency) & 65535;
  const fHi = freq >> 8 & 255;
  const fLo = freq & 255;
  const [qHi, qLo] = encodeUnsignedHundredths(qValue);
  const data = [bandIndex & 255, gHi, gLo, fHi, fLo, qHi, qLo, (filterType ?? 0) & 255];
  return createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_FILTER_PARAMS, data);
}
const createSetEqSwitchCommand = (enabled) => createCommandPacket(SET_HEADER1, SET_HEADER2, 26, [enabled ? 1 : 0]);
const createSetEqPreCommand = (presetValue) => createCommandPacket(SET_HEADER1, SET_HEADER2, PEQ_PRESET_SWITCH, [presetValue & 255]);
const toDeviceFilterType = FIIO_FILTER_MAP.fromCode;
const fromDeviceFilterType = FIIO_FILTER_MAP.toCode;
async function getCurrentSlot$3(device) {
  try {
    const cmd = createGetEqPresetCmd();
    console.debug("[FiiO Serial] SEND get preset:", Array.from(cmd));
    const response = await sendReportAndListen(device, cmd);
    console.debug("[FiiO Serial] RECV get preset:", Array.from(response));
    if (response.length > 6) {
      return response[6];
    }
    return 0;
  } catch (error) {
    console.error("Failed to get current slot:", error);
    throw error;
  }
}
async function pullFromDevice$3(device, slot) {
  try {
    const countResponse = await sendReportAndListen(device, createGetEqCountCmd());
    let eqCount = 0;
    if (countResponse.length > 6) {
      eqCount = countResponse[6];
      if (eqCount === 0) {
        throw new Error("No PEQ band found.");
      }
    }
    const gainResponse = await sendReportAndListen(device, createGetGlobalGainCmd());
    let eqGlobalGain = 0;
    if (gainResponse.length > 7) {
      eqGlobalGain = parseGain(gainResponse[6], gainResponse[7]);
    }
    const filters = [];
    for (let i = 0; i < eqCount; i++) {
      const bandResponse = await sendReportAndListen(device, createGetEqBandCmd(i));
      if (bandResponse.length >= 14) {
        const gain = parseGain(bandResponse[7], bandResponse[8]);
        const frequency = bandResponse[9] << 8 | bandResponse[10];
        const qValue = parseQValue(bandResponse[11], bandResponse[12]);
        const filterType = bandResponse[13];
        filters.push({
          freq: frequency,
          gain,
          q: qValue,
          type: toDeviceFilterType(filterType)
        });
      }
    }
    filters.sort((a, b) => a.freq - b.freq);
    return {
      filters,
      globalGain: eqGlobalGain
    };
  } catch (error) {
    console.error("Failed to pull data from FiiO device:", error);
    throw error;
  }
}
async function pushToDevice$3(device, slot, globalGain, filters) {
  try {
    await sendReportAndListen(device, createSetGlobalGainCmd(globalGain));
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const filterType = fromDeviceFilterType(filter.type);
      await sendReportAndListen(
        device,
        createSetEqBandCommand(i, filter.freq, filter.gain, filter.q, filterType)
      );
    }
    console.log("FiiO settings applied successfully");
    return !!(device && device.modelConfig && device.modelConfig.disconnectOnSave);
  } catch (error) {
    console.error("Failed to push data to FiiO device:", error);
    throw error;
  }
}
async function enablePEQ$3(device, enabled, slotId) {
  try {
    if (enabled) {
      await sendReportAndListen(device, createSetEqSwitchCommand(true));
      if (slotId !== void 0) {
        await sendReportAndListen(device, createSetEqPreCommand(slotId));
      }
    } else {
      await sendReportAndListen(device, createSetEqSwitchCommand(false));
    }
    console.log(`FiiO EQ ${enabled ? "enabled" : "disabled"}`);
  } catch (error) {
    console.error("Failed to enable/disable FiiO EQ:", error);
    throw error;
  }
}
const fiioUsbSerialHandler = {
  getCurrentSlot: getCurrentSlot$3,
  pullFromDevice: pullFromDevice$3,
  pushToDevice: pushToDevice$3,
  enablePEQ: enablePEQ$3
};
const registration$8 = {
  vendorId: 6790,
  manufacturer: "FiiO",
  handler: fiioUsbSerialHandler,
  devices: {
    "FiiO Audio DSP": {
      usbProductId: 21971,
      modelConfig: {
        baudRate: 57600,
        minGain: -12,
        maxGain: 12,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 21,
        disconnectOnSave: false,
        disabledPresetId: 11,
        experimental: false,
        availableSlots: [
          { id: 240, name: "BYPASS" },
          { id: 0, name: "Jazz" },
          { id: 1, name: "Pop" },
          { id: 2, name: "Rock" },
          { id: 3, name: "Dance" },
          { id: 4, name: "R&B" },
          { id: 5, name: "Classic" },
          { id: 6, name: "Hip Hop" },
          { id: 8, name: "Retro" },
          { id: 9, name: "De-essing-1" },
          { id: 10, name: "De-essing-2" },
          { id: 160, name: "USER1" },
          { id: 161, name: "USER2" },
          { id: 162, name: "USER3" },
          { id: 163, name: "USER4" },
          { id: 164, name: "USER5" },
          { id: 165, name: "USER6" },
          { id: 166, name: "USER7" },
          { id: 167, name: "USER8" },
          { id: 168, name: "USER9" },
          { id: 169, name: "USER10" }
        ]
      }
    }
  }
};
const fiioUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fiioUsbSerialHandler,
  registration: registration$8
}, Symbol.toStringTag, { value: "Module" }));
const FIIO = {
  NUM_BANDS: 10,
  GAIN_MIN: -20,
  GAIN_MAX: 20
};
function typeToString$1(t) {
  return t === 1 ? "LSQ" : t === 2 ? "HSQ" : "PK";
}
function typeFromString$1(s) {
  return s === "LSQ" ? 1 : s === "HSQ" ? 2 : 0;
}
function buildPacket$1(cmd1, cmd2, payload = []) {
  const total = 2 + 2 + 2 + payload.length + 1;
  return new Uint8Array([
    241,
    16,
    total >> 8 & 255,
    total & 255,
    cmd1,
    cmd2,
    ...payload,
    255
  ]);
}
function encGain$1(db) {
  let raw = Math.round(db * 10);
  if (raw < 0) raw += 65536;
  return [raw >> 8 & 255, raw & 255];
}
function decGain$1(hi, lo) {
  let raw = hi << 8 | lo;
  if (raw > 32767) raw -= 65536;
  return raw / 10;
}
function parseEQResponse$1(data) {
  if (data.length < 80) return null;
  if (data[0] !== 241 || data[1] !== 16) return null;
  if (data[4] !== 3 || data[5] !== 13) return null;
  const bands = [];
  const base = 9;
  for (let i = 0; i < FIIO.NUM_BANDS; i++) {
    const o = base + i * 7;
    if (o + 7 > data.length - 1) break;
    bands.push({
      gain: decGain$1(data[o], data[o + 1]),
      freqHz: data[o + 2] << 8 | data[o + 3],
      q: (data[o + 4] << 8 | data[o + 5]) / 100,
      rawType: data[o + 6]
    });
  }
  return bands.length === FIIO.NUM_BANDS ? bands : null;
}
async function readFiioPacket$1(device, timeoutMs = 6e3) {
  const buf = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(100, deadline - Date.now());
    const timeoutPromise = new Promise(
      (r) => setTimeout(() => r({ value: void 0, done: true }), remaining)
    );
    const { value, done } = await Promise.race([device.readable.read(), timeoutPromise]);
    if (done || !value) break;
    for (const b of value) buf.push(b);
    if (buf.length >= 4) {
      const expected = buf[2] << 8 | buf[3];
      if (buf.length >= expected) return new Uint8Array(buf.slice(0, expected));
    }
  }
  return null;
}
async function sendAndReceive$1(device, packet, timeoutMs = 4e3) {
  await device.writable.write(packet);
  return await readFiioPacket$1(device, timeoutMs);
}
const fiioSppSerialHandler = {
  async getCurrentSlot(_device) {
    return 0;
  },
  async pullFromDevice(device, _slot) {
    try {
      const verPkt = buildPacket$1(0, 2, [1]);
      await sendAndReceive$1(device, verPkt, 2e3);
    } catch (_) {
    }
    const readPkt = buildPacket$1(3, 13, [1, 0, 9]);
    const resp = await sendAndReceive$1(device, readPkt, 6e3);
    if (!resp) throw new Error("FiiO SPP: no response");
    const bands = parseEQResponse$1(resp);
    if (!bands) throw new Error("FiiO SPP: parse failed");
    const filters = bands.map((b) => ({
      freq: b.freqHz,
      gain: b.gain,
      q: b.q,
      type: typeToString$1(b.rawType)
    }));
    return { filters, globalGain: 0 };
  },
  async pushToDevice(device, _slot, _preamp, filters) {
    for (let i = 0; i < FIIO.NUM_BANDS; i++) {
      const f = filters[i] || { freq: 1e3, gain: 0, q: 0.72, type: "PK" };
      const gainDb = Math.max(FIIO.GAIN_MIN, Math.min(FIIO.GAIN_MAX, f.gain ?? 0));
      const freqRaw = Math.max(0, Math.min(65535, Math.round(f.freq ?? 1e3)));
      const qRaw = Math.round((f.q ?? 0.72) * 100);
      const type = typeFromString$1(f.type ?? "PK");
      const [gHi, gLo] = encGain$1(gainDb);
      const pkt = buildPacket$1(19, 13, [
        1,
        i,
        i,
        gHi,
        gLo,
        freqRaw >> 8 & 255,
        freqRaw & 255,
        qRaw >> 8 & 255,
        qRaw & 255,
        type
      ]);
      try {
        await sendAndReceive$1(device, pkt, 2e3);
      } catch (_) {
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  },
  async enablePEQ(_device, _enabled, _slotId) {
  }
};
const registration$7 = {
  manufacturer: "FiiO",
  handler: fiioSppSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: ["00001101-0000-1000-8000-00805f9b34fb"],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "FiiO EH11": {
      modelConfig: {
        baudRate: 115200,
        minGain: -20,
        maxGain: 20,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "FiiO EH11 NeutralEQ",
        availableSlots: [{ id: 0, name: "Default" }]
      }
    },
    "FiiO EH13": {
      modelConfig: {
        baudRate: 115200,
        minGain: -20,
        maxGain: 20,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "FiiO EH13 NeutralEQ",
        availableSlots: [{ id: 0, name: "Default" }]
      }
    }
  }
};
const fiioSppSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fiioSppSerialHandler,
  registration: registration$7
}, Symbol.toStringTag, { value: "Module" }));
const RITA = {
  NUM_BANDS: 12,
  CMD_GET_ALL_EQ: new Uint8Array([255, 161, 1, 11, 170]),
  SET_EQ_HEADER: new Uint8Array([255, 161, 86, 43, 12]),
  EQ_RESPONSE_LEN: 89
};
function encodeBand(gainDb, freqHz, q, filterType = 1) {
  const rawGain = gainDb >= 0 ? Math.round(gainDb * 100) : 65536 + Math.round(gainDb * 100) & 65535;
  const rawFreq = Math.round(freqHz) & 65535;
  const rawQ = Math.max(1, Math.round(q * 100)) & 65535;
  return [
    filterType,
    rawGain >> 8 & 255,
    rawGain & 255,
    rawFreq >> 8 & 255,
    rawFreq & 255,
    rawQ >> 8 & 255,
    rawQ & 255
  ];
}
function decodeBand(bytes) {
  const filterType = bytes[0];
  const rawGain = bytes[1] << 8 | bytes[2];
  const gainDb = bytes[1] < 128 ? rawGain / 100 : -(65536 - rawGain) / 100;
  const freqHz = bytes[3] << 8 | bytes[4];
  const rawQ = bytes[5] << 8 | bytes[6];
  const q = rawQ / 100;
  return { filterType, gainDb, freqHz, q };
}
function extractResponse(buf) {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 255 && buf[i + 1] === 162) {
      const len = buf[i + 2];
      const total = 3 + len;
      if (buf.length >= i + total) {
        return { bytes: buf.slice(i, i + total), end: i + total };
      }
    }
  }
  return null;
}
async function readResponse$1(device, timeoutMs = 8e3) {
  const buf = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await device.readable.read();
    if (done) break;
    if (value) {
      for (const b of value) buf.push(b);
      const result = extractResponse(buf);
      if (result) return result.bytes;
    }
  }
  return null;
}
const ritaUsbSerialHandler = {
  async getCurrentSlot(_device) {
    return 0;
  },
  async pullFromDevice(device, _slot) {
    await device.writable.write(RITA.CMD_GET_ALL_EQ);
    const resp = await readResponse$1(device, 8e3);
    if (!resp || resp.length < RITA.EQ_RESPONSE_LEN) {
      throw new Error("Rita: bad response");
    }
    const filters = [];
    for (let i = 0; i < RITA.NUM_BANDS; i++) {
      const off = 5 + i * 7;
      const band = decodeBand(resp.slice(off, off + 7));
      filters.push({
        freq: band.freqHz,
        gain: Math.round(band.gainDb * 100) / 100,
        q: Math.round(band.q * 100) / 100,
        type: "PK"
      });
    }
    return { filters, globalGain: 0 };
  },
  async pushToDevice(device, _slot, _preamp, filters) {
    const bands = [];
    for (let i = 0; i < RITA.NUM_BANDS; i++) {
      const f = filters[i] || { freq: 1e3, gain: 0, q: 1 };
      bands.push({
        gainDb: f.gain ?? 0,
        freqHz: f.freq ?? 1e3,
        q: f.q ?? 1,
        filterType: 1
      });
    }
    const body = bands.flatMap((b) => encodeBand(b.gainDb, b.freqHz, b.q, b.filterType));
    const packet = new Uint8Array([...RITA.SET_EQ_HEADER, ...body, 170]);
    await device.writable.write(packet);
    return false;
  },
  async enablePEQ(_device, _enabled, _slotId) {
  }
};
const registration$6 = {
  manufacturer: "Tanchjim",
  handler: ritaUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: ["00001101-0000-1000-8000-00805f9b34fb"],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "Tanchjim Rita": {
      modelConfig: {
        baudRate: 9600,
        minGain: -15,
        maxGain: 15,
        maxFilters: 12,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "Tanchjim Rita Default ANC",
        availableSlots: [{ id: 0, name: "Default" }]
      }
    }
  }
};
const ritaUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  registration: registration$6,
  ritaUsbSerialHandler
}, Symbol.toStringTag, { value: "Module" }));
const EARFUN = {
  NUM_BANDS: 10,
  HEADER: 239,
  CMD_CATEGORY: 32,
  CMD_SET_PEQ_BAND: 149,
  PAYLOAD_LENGTH: 10,
  Q_FACTOR_H: 11,
  Q_FACTOR_L: 51,
  FOOTER: 254,
  STANDARD_FREQS: [31.5, 63, 125, 250, 500, 1e3, 2e3, 4e3, 8e3, 16e3]
};
function encodeFrequency$1(hz) {
  const value = Math.round(hz * 3);
  return [value >> 8 & 255, value & 255];
}
function encodeGain$1(dB) {
  let value = Math.round(dB * 100 / 3);
  if (value < 0) value = 65536 + value;
  return [value >> 8 & 255, value & 255];
}
function calculateChecksum(payload) {
  const sum = payload.reduce((a, b) => a + b, 0);
  return payload[0] + sum & 255;
}
function buildBandPacket(bandNum, frequencyHz, gainDb) {
  const [freqH, freqL] = encodeFrequency$1(frequencyHz);
  const [gainH, gainL] = encodeGain$1(gainDb);
  const payload = [
    EARFUN.PAYLOAD_LENGTH,
    bandNum,
    254,
    32,
    freqH,
    freqL,
    gainH,
    gainL,
    EARFUN.Q_FACTOR_H,
    EARFUN.Q_FACTOR_L
  ];
  const checksum = calculateChecksum(payload);
  return new Uint8Array([
    EARFUN.HEADER,
    EARFUN.CMD_CATEGORY,
    EARFUN.CMD_SET_PEQ_BAND,
    EARFUN.PAYLOAD_LENGTH,
    ...payload,
    checksum,
    EARFUN.FOOTER
  ]);
}
const earfunUsbSerialHandler = {
  async getCurrentSlot(_device) {
    return 0;
  },
  async pullFromDevice(_device, _slot) {
    const filters = EARFUN.STANDARD_FREQS.map((freq) => ({
      freq,
      gain: 0,
      q: 1,
      type: "PK"
    }));
    return { filters, globalGain: 0 };
  },
  async pushToDevice(device, _slot, _preamp, filters) {
    for (let i = 0; i < EARFUN.NUM_BANDS; i++) {
      const f = filters[i] || { freq: EARFUN.STANDARD_FREQS[i], gain: 0 };
      const packet = buildBandPacket(
        i + 1,
        f.freq ?? EARFUN.STANDARD_FREQS[i],
        f.gain ?? 0
      );
      await device.writable.write(packet);
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  },
  async enablePEQ(_device, _enabled, _slotId) {
  }
};
const registration$5 = {
  manufacturer: "EarFun",
  handler: earfunUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: ["00001101-0000-1000-8000-00805f9b34fb"],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "EarFun Tune Pro": {
      modelConfig: {
        baudRate: 115200,
        minGain: -12,
        maxGain: 12,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        writeOnly: true,
        flatEQPhoneMeasurement: "EarfunTunePro-ANC-Default",
        availableSlots: [{ id: 0, name: "Default" }]
      }
    }
  }
};
const earfunUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  earfunUsbSerialHandler,
  registration: registration$5
}, Symbol.toStringTag, { value: "Module" }));
const EDIFIER = {
  HEADER_TX: 170,
  APP_CODE: 236,
  CMD_CUSTOM_EQ_SET_BAND: 68,
  GAIN_BASELINE: 169,
  GAIN_SCALE: 4,
  Q_BASELINE: 149,
  Q_SCALE: 14,
  BAND_IDS: [165, 164, 167, 166],
  NUM_BANDS: 4,
  DEFAULT_FREQS: [100, 500, 2e3, 8e3],
  FREQ_TABLE: {
    20: [165, 177],
    50: [165, 151],
    75: [165, 238],
    76: [165, 233],
    77: [165, 232],
    100: [165, 193],
    150: [165, 51],
    175: [165, 10],
    200: [165, 109],
    400: [164, 53],
    500: [164, 81],
    1e3: [166, 77],
    1500: [160, 121],
    2e3: [162, 117],
    3e3: [174, 29],
    3078: [169, 163],
    4e3: [170, 5],
    5e3: [182, 45],
    6e3: [178, 213],
    8e3: [186, 229],
    1e4: [130, 181]
  }
};
function calculateCRC(packet) {
  return packet.reduce((sum, b) => sum + b & 255, 0);
}
function buildCommand(command, payload = []) {
  const len = payload.length;
  const pkt = [
    EDIFIER.HEADER_TX,
    EDIFIER.APP_CODE,
    command,
    len >> 8 & 255,
    len & 255,
    ...payload
  ];
  pkt.push(calculateCRC(pkt));
  return new Uint8Array(pkt);
}
function encodeGain(gainDb) {
  const clamped = Math.max(-6, Math.min(6, gainDb));
  return Math.round(EDIFIER.GAIN_BASELINE + clamped * EDIFIER.GAIN_SCALE) & 255;
}
function encodeQ(qValue) {
  const clamped = Math.max(0.5, Math.min(5, qValue));
  return Math.round(EDIFIER.Q_BASELINE + clamped * EDIFIER.Q_SCALE) & 255;
}
function encodeFrequency(freqHz) {
  const tableFreqs = Object.keys(EDIFIER.FREQ_TABLE).map((f) => parseInt(f, 10));
  const nearest = tableFreqs.reduce(
    (prev, curr) => Math.abs(curr - freqHz) < Math.abs(prev - freqHz) ? curr : prev
  );
  return EDIFIER.FREQ_TABLE[nearest];
}
async function getCurrentSlot$2(_device) {
  return 0;
}
async function pullFromDevice$2(_device, _slot) {
  const filters = EDIFIER.DEFAULT_FREQS.map((freq) => ({
    freq,
    gain: 0,
    q: 1.4,
    type: "PK"
  }));
  return { filters, globalGain: 0 };
}
async function pushToDevice$2(device, _slot, _preamp, filters) {
  for (let i = 0; i < EDIFIER.NUM_BANDS; i++) {
    const f = filters[i] || {
      freq: EDIFIER.DEFAULT_FREQS[i],
      gain: 0,
      q: 1.4
    };
    const bandId = EDIFIER.BAND_IDS[i];
    const [freqB2, freqB3] = encodeFrequency(f.freq ?? EDIFIER.DEFAULT_FREQS[i]);
    const gainByte = encodeGain(f.gain ?? 0);
    const qByte = encodeQ(f.q ?? 1.4);
    const payload = [bandId, 165, freqB2, freqB3, gainByte, qByte];
    const packet = buildCommand(EDIFIER.CMD_CUSTOM_EQ_SET_BAND, payload);
    await device.writable.write(packet);
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}
async function enablePEQ$2(_device, _enabled, _slotId) {
}
const edifierUsbSerialHandler = {
  getCurrentSlot: getCurrentSlot$2,
  pullFromDevice: pullFromDevice$2,
  pushToDevice: pushToDevice$2,
  enablePEQ: enablePEQ$2
};
const registration$4 = {
  manufacturer: "Edifier",
  handler: edifierUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: [
      "00001101-0000-1000-8000-00805f9b34fb"
    ],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "Edifier W830NB": {
      modelConfig: {
        baudRate: 115200,
        minGain: -6,
        maxGain: 6,
        maxFilters: 4,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        writeOnly: true,
        flatEQPhoneMeasurement: "Edifier 830NB Custom EQ 0db",
        availableSlots: [{ id: 0, name: "Custom EQ" }]
      }
    }
  }
};
const edifierUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  edifierUsbSerialHandler,
  registration: registration$4
}, Symbol.toStringTag, { value: "Module" }));
const MOONDROP = {
  NUM_BANDS: 5,
  PACKET_START: 255,
  PROTOCOL_VERSION: 4,
  DEVICE_ID: [0, 29],
  DIRECTION_TO_DEVICE: 10,
  DIRECTION_FROM_DEVICE: 11,
  CMD_ENABLE_EQ: 3,
  CMD_QUERY_EQ: 5,
  CMD_SET_EQ: 6
};
function createPacket(command, payload) {
  const len = payload.length;
  const packet = new Uint8Array(8 + len);
  packet[0] = MOONDROP.PACKET_START;
  packet[1] = MOONDROP.PROTOCOL_VERSION;
  packet[2] = len >> 8 & 255;
  packet[3] = len & 255;
  packet[4] = MOONDROP.DEVICE_ID[0];
  packet[5] = MOONDROP.DEVICE_ID[1];
  packet[6] = MOONDROP.DIRECTION_TO_DEVICE;
  packet[7] = command;
  packet.set(payload, 8);
  return packet;
}
function parseEQData(payload) {
  if (payload.length < 2) return null;
  const bandData = payload.slice(2);
  const bandOffsets = [0, 7, 14, 21, 28];
  const bands = [];
  for (let i = 0; i < MOONDROP.NUM_BANDS; i++) {
    const off = bandOffsets[i];
    const slotLen = i === MOONDROP.NUM_BANDS - 1 ? 6 : 7;
    if (off + slotLen > bandData.length) return null;
    const bytes = bandData.slice(off, off + slotLen);
    const freqHz = bytes[2] << 8 | bytes[3];
    const qRaw = bytes[4] << 8 | bytes[5];
    bands.push({
      rawBytes: Array.from(bytes),
      frequency: freqHz,
      qFactor: qRaw / 4096,
      gain: null
    });
  }
  for (let i = 0; i < bands.length; i++) {
    if (i < MOONDROP.NUM_BANDS - 1) {
      const raw = bands[i + 1].rawBytes[0] << 8 | bands[i + 1].rawBytes[1];
      const signed = raw > 32767 ? raw - 65536 : raw;
      bands[i].gain = signed / 60;
    } else {
      const paddingOffset = 34;
      if (bandData.length >= paddingOffset + 2) {
        const raw = bandData[paddingOffset] << 8 | bandData[paddingOffset + 1];
        const signed = raw > 32767 ? raw - 65536 : raw;
        bands[MOONDROP.NUM_BANDS - 1].gain = signed / 60;
      } else {
        bands[MOONDROP.NUM_BANDS - 1].gain = 0;
      }
    }
  }
  return bands;
}
function encodeEQBands(bands) {
  const payload = [];
  payload.push(0, 4);
  payload.push(0, 0);
  const f1 = Math.max(0, Math.min(65535, Math.round(bands[0].freq)));
  payload.push(f1 >> 8 & 255, f1 & 255);
  const q1 = Math.round(bands[0].q * 4096);
  payload.push(q1 >> 8 & 255, q1 & 255);
  payload.push(0);
  for (let i = 1; i < MOONDROP.NUM_BANDS - 1; i++) {
    const prevGainRaw2 = Math.round(bands[i - 1].gain * 60);
    const prevGainU162 = prevGainRaw2 < 0 ? prevGainRaw2 + 65536 : prevGainRaw2;
    payload.push(prevGainU162 >> 8 & 255, prevGainU162 & 255);
    const f = Math.max(0, Math.min(65535, Math.round(bands[i].freq)));
    payload.push(f >> 8 & 255, f & 255);
    const q = Math.round(bands[i].q * 4096);
    payload.push(q >> 8 & 255, q & 255);
    payload.push(0);
  }
  const lastIdx = MOONDROP.NUM_BANDS - 1;
  const prevIdx = MOONDROP.NUM_BANDS - 2;
  const prevGainRaw = Math.round(bands[prevIdx].gain * 60);
  const prevGainU16 = prevGainRaw < 0 ? prevGainRaw + 65536 : prevGainRaw;
  payload.push(prevGainU16 >> 8 & 255, prevGainU16 & 255);
  const fLast = Math.max(0, Math.min(65535, Math.round(bands[lastIdx].freq)));
  payload.push(fLast >> 8 & 255, fLast & 255);
  const qLast = Math.round(bands[lastIdx].q * 4096);
  payload.push(qLast >> 8 & 255, qLast & 255);
  const lastGainRaw = Math.round(bands[lastIdx].gain * 60);
  const lastGainU16 = lastGainRaw < 0 ? lastGainRaw + 65536 : lastGainRaw;
  payload.push(lastGainU16 >> 8 & 255, lastGainU16 & 255);
  payload.push(0);
  return new Uint8Array(payload);
}
async function readResponse(device, expectedCmd, timeoutMs = 5e3) {
  const buf = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await device.readable.read();
    if (done) break;
    if (value) {
      buf.push(...Array.from(value));
      if (buf.length >= 8 && buf[0] === 255 && buf[6] === MOONDROP.DIRECTION_FROM_DEVICE && buf[7] === expectedCmd) {
        return new Uint8Array(buf);
      }
    }
  }
  return null;
}
async function getCurrentSlot$1(_device) {
  return 0;
}
async function pullFromDevice$1(device, _slot) {
  const queryPayload = new Uint8Array([0, 4]);
  const queryPacket = createPacket(MOONDROP.CMD_QUERY_EQ, queryPayload);
  await device.writable.write(queryPacket);
  const resp = await readResponse(device, MOONDROP.CMD_QUERY_EQ, 5e3);
  if (!resp || resp.length <= 8) {
    throw new Error("Moondrop Edge: no response from device");
  }
  const bands = parseEQData(resp.slice(8));
  if (!bands) {
    throw new Error("Moondrop Edge: failed to parse EQ response");
  }
  const filters = bands.map((b) => ({
    freq: b.frequency,
    gain: Math.round((b.gain ?? 0) * 100) / 100,
    q: Math.round(b.qFactor * 1e3) / 1e3,
    type: "PK"
  }));
  return { filters, globalGain: 0 };
}
async function pushToDevice$1(device, _slot, _preamp, filters) {
  const bands = [];
  for (let i = 0; i < MOONDROP.NUM_BANDS; i++) {
    const f = filters[i] || { freq: 1e3, gain: 0, q: 1 };
    bands.push({
      freq: f.freq ?? 1e3,
      gain: f.gain ?? 0,
      q: f.q ?? 1
    });
  }
  const payload = encodeEQBands(bands);
  const packet = createPacket(MOONDROP.CMD_SET_EQ, payload);
  await device.writable.write(packet);
  return false;
}
async function enablePEQ$1(device, enabled, _slotId) {
  const payload = new Uint8Array([enabled ? 1 : 0]);
  const packet = createPacket(MOONDROP.CMD_ENABLE_EQ, payload);
  await device.writable.write(packet);
}
const moondropEdgeUsbSerialHandler = {
  getCurrentSlot: getCurrentSlot$1,
  pullFromDevice: pullFromDevice$1,
  pushToDevice: pushToDevice$1,
  enablePEQ: enablePEQ$1
};
const registration$3 = {
  manufacturer: "Moondrop",
  handler: moondropEdgeUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: [
      "00001101-0000-1000-8000-00805f9b34fb"
    ],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "Moondrop Edge": {
      modelConfig: {
        baudRate: 115200,
        minGain: -12,
        maxGain: 12,
        maxFilters: 5,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 1,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "Moondrop Edge Default",
        availableSlots: [{ id: 0, name: "Custom EQ" }]
      }
    }
  }
};
const moondropEdgeUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  moondropEdgeUsbSerialHandler,
  registration: registration$3
}, Symbol.toStringTag, { value: "Module" }));
const AIROHA = {
  NUM_BANDS: 10,
  RESPONSE_HEADER: [5, 91, 189],
  READ_RESPONSE_LENGTH: 193
};
function buildReadPresetCommand$1(preset) {
  return new Uint8Array([
    5,
    90,
    6,
    0,
    0,
    10,
    preset & 255,
    239,
    232,
    3
  ]);
}
function buildWritePEQCommandFull(presetNum, filters) {
  if (presetNum < 0 || presetNum > 3) {
    throw new Error("Preset must be 0-3");
  }
  if (filters.length !== AIROHA.NUM_BANDS) {
    throw new Error("Must provide 10 filters");
  }
  const cmd = [];
  cmd.push(5, 90, 79);
  const lengthPos = cmd.length;
  cmd.push(0, 0);
  cmd.push(3, 14, 0);
  const presetBytes = new Uint8Array(new Uint32Array([presetNum]).buffer);
  cmd.push(...Array.from(presetBytes));
  cmd.push(6);
  const sampleRates = [44100, 48e3, 88200, 96e3, 44100, 48e3];
  for (const sampleRate of sampleRates) {
    cmd.push(0, 103, 0, 10, 0);
    const srBytes = new Uint8Array(new Uint32Array([sampleRate]).buffer);
    cmd.push(...Array.from(srBytes));
    for (const band of filters) {
      const filterType = band.filterType;
      cmd.push(1, filterType);
      const freqVal = Math.round(band.freqHz * 100);
      cmd.push(freqVal & 255, freqVal >> 8 & 255, 0, 0);
      const gainVal = Math.round(band.gainDb * 100);
      const gainBytes = new Uint8Array(new Int32Array([gainVal]).buffer);
      cmd.push(...Array.from(gainBytes));
      const qVal = Math.round(band.qValue * 100);
      const qBytes = new Uint8Array(new Uint32Array([qVal]).buffer);
      cmd.push(...Array.from(qBytes));
      cmd.push(200, 0, 0, 0);
    }
  }
  const payloadLen = cmd.length - 3;
  cmd[lengthPos] = payloadLen & 255;
  cmd[lengthPos + 1] = payloadLen >> 8 & 255;
  return new Uint8Array(cmd);
}
function parsePEQResponse$1(data) {
  if (data.length < AIROHA.READ_RESPONSE_LENGTH) return null;
  if (data[0] !== 5 || data[1] !== 91 || data[2] !== 189) {
    return null;
  }
  const result = {
    numBands: data[5],
    eqEnabled: data[8] === 1,
    filters: []
  };
  const filterStart = 13;
  for (let i = 0; i < Math.min(AIROHA.NUM_BANDS, result.numBands); i++) {
    const offset = filterStart + i * 18;
    if (offset + 18 > data.length) break;
    const freqRaw = data[offset + 2] | data[offset + 3] << 8 | data[offset + 4] << 16 | data[offset + 5] << 24;
    const freqHz = freqRaw / 100;
    let gainRaw = (data[offset + 6] | data[offset + 7] << 8 | data[offset + 8] << 16 | data[offset + 9] << 24) >>> 0;
    if (gainRaw > 2147483647) gainRaw -= 4294967296;
    const gainDb = gainRaw / 100;
    const qRaw = data[offset + 14] | data[offset + 15] << 8 | data[offset + 16] << 16 | data[offset + 17] << 24;
    const qValue = qRaw / 100;
    result.filters.push({
      freq: freqHz,
      gain: gainDb,
      q: qValue,
      type: "PK"
    });
  }
  return result;
}
function normalizeFilters$1(filters, targetCount) {
  const normalized = [];
  for (const filter of filters) {
    const filterType = filter.type === "LSQ" ? 3 : filter.type === "HSQ" ? 4 : 2;
    normalized.push({
      freqHz: filter.freq,
      gainDb: filter.gain,
      qValue: filter.q,
      filterType
    });
    if (normalized.length >= targetCount) break;
  }
  while (normalized.length < targetCount) {
    normalized.push({
      freqHz: 1e3,
      gainDb: 0,
      qValue: 1,
      filterType: 2
    });
  }
  return normalized;
}
async function readPEQPacket$1(device, timeoutMs = 5e3) {
  const startTime = Date.now();
  let buffer = [];
  while (Date.now() - startTime < timeoutMs) {
    const { value, done } = await device.readable.read();
    if (done || !value) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    buffer.push(...Array.from(value));
    const headerIndex = buffer.indexOf(AIROHA.RESPONSE_HEADER[0]);
    if (headerIndex > 0) buffer = buffer.slice(headerIndex);
    if (buffer.length >= AIROHA.READ_RESPONSE_LENGTH) {
      const packet = buffer.slice(0, AIROHA.READ_RESPONSE_LENGTH);
      const parsed = parsePEQResponse$1(new Uint8Array(packet));
      if (parsed) return parsed;
      buffer = buffer.slice(1);
    }
  }
  return null;
}
async function getCurrentSlot(_device) {
  return 0;
}
async function pullFromDevice(device, slot) {
  try {
    const command = buildReadPresetCommand$1(slot);
    await device.writable.write(command);
    const response = await readPEQPacket$1(device, 5e3);
    if (!response) {
      throw new Error("Airoha: no response from device");
    }
    return { filters: response.filters, globalGain: 0 };
  } catch (error) {
    console.error("Airoha pull failed:", error);
    return { filters: [], globalGain: 0 };
  }
}
async function pushToDevice(device, slot, _preamp, filters) {
  const normalized = normalizeFilters$1(filters, AIROHA.NUM_BANDS);
  const command = buildWritePEQCommandFull(slot, normalized);
  await device.writable.write(command);
  return true;
}
async function enablePEQ(_device, _enabled, _slotId) {
}
const airohaUsbSerialHandler = {
  getCurrentSlot,
  pullFromDevice,
  pushToDevice,
  enablePEQ
};
const registration$2 = {
  manufacturer: "Audeze",
  handler: airohaUsbSerialHandler,
  filters: {
    usbVendorId: null,
    allowedBluetoothServiceClassIds: [
      "00001101-0000-1000-8000-00805f9b34fb"
    ],
    bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb"
  },
  devices: {
    "Audeze Maxwell": {
      modelConfig: {
        minGain: -12,
        maxGain: 12,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 4,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "Audeze Maxwell Flat",
        availableSlots: [
          { id: 0, name: "Preset 1" },
          { id: 1, name: "Preset 2" },
          { id: 2, name: "Preset 3" },
          { id: 3, name: "Preset 4" }
        ]
      }
    }
  }
};
const airohaUsbSerial = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  airohaUsbSerialHandler,
  registration: registration$2
}, Symbol.toStringTag, { value: "Module" }));
const NUM_BANDS$1 = 10;
const GAIN_MIN = -20;
const GAIN_MAX = 20;
function typeToString(t) {
  return t === 1 ? "LSQ" : t === 2 ? "HSQ" : "PK";
}
function typeFromString(s) {
  return s === "LSQ" ? 1 : s === "HSQ" ? 2 : 0;
}
function buildPacket(cmd1, cmd2, payload = []) {
  const total = 2 + 2 + 2 + payload.length + 1;
  return new Uint8Array([
    241,
    16,
    total >> 8 & 255,
    total & 255,
    cmd1,
    cmd2,
    ...payload,
    255
  ]);
}
function encGain(db) {
  let raw = Math.round(db * 10);
  if (raw < 0) raw += 65536;
  return [raw >> 8 & 255, raw & 255];
}
function decGain(hi, lo) {
  let raw = hi << 8 | lo;
  if (raw > 32767) raw -= 65536;
  return raw / 10;
}
function parseEQResponse(data) {
  if (data.length < 80) return null;
  if (data[0] !== 241 || data[1] !== 16) return null;
  if (data[4] !== 3 || data[5] !== 13) return null;
  const bands = [];
  const base = 9;
  for (let i = 0; i < NUM_BANDS$1; i++) {
    const o = base + i * 7;
    if (o + 7 > data.length - 1) break;
    bands.push({
      gain: decGain(data[o], data[o + 1]),
      freqHz: data[o + 2] << 8 | data[o + 3],
      q: (data[o + 4] << 8 | data[o + 5]) / 100,
      rawType: data[o + 6]
    });
  }
  return bands.length === NUM_BANDS$1 ? bands : null;
}
async function readFiioPacket(device, timeoutMs = 6e3) {
  const buf = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(100, deadline - Date.now());
    const chunk = await device.readNotification(remaining);
    if (!chunk) break;
    for (const b of chunk) buf.push(b);
    if (buf.length >= 4) {
      const expected = buf[2] << 8 | buf[3];
      if (buf.length >= expected) {
        return new Uint8Array(buf.slice(0, expected));
      }
    }
  }
  return null;
}
async function sendAndReceive(device, packet, timeoutMs = 4e3) {
  const txChar = device.txChar;
  const useWriteWithResponse = !!txChar.properties.write && !txChar.properties.writeWithoutResponse;
  if (useWriteWithResponse) {
    await txChar.writeValueWithResponse(packet);
  } else {
    await txChar.writeValueWithoutResponse(packet);
  }
  return await readFiioPacket(device, timeoutMs);
}
const fiioBleHandler = {
  async getCurrentSlot() {
    return 0;
  },
  async pullFromDevice(deviceDetails) {
    console.log("FiiO BLE: reading EQ from device");
    try {
      const verPkt = buildPacket(0, 2, [1]);
      await sendAndReceive(deviceDetails, verPkt, 2e3);
    } catch {
      console.log("FiiO BLE: version handshake skipped");
    }
    const readPkt = buildPacket(3, 13, [1, 0, 9]);
    const resp = await sendAndReceive(deviceDetails, readPkt, 6e3);
    if (!resp) throw new Error("FiiO BLE: no response to EQ read command");
    const bands = parseEQResponse(resp);
    if (!bands) throw new Error(`FiiO BLE: could not parse EQ response (${resp.length} bytes)`);
    const filters = bands.map((b) => ({
      freq: b.freqHz,
      gain: b.gain,
      q: b.q,
      type: typeToString(b.rawType)
    }));
    console.log(`FiiO BLE: pulled ${filters.length} bands`);
    return { filters, globalGain: 0 };
  },
  async pushToDevice(deviceDetails, _slot, _preamp, filters) {
    console.log(`FiiO BLE: writing ${filters.length} bands to device`);
    for (let i = 0; i < NUM_BANDS$1; i++) {
      const f = filters[i] || { freq: 1e3, gain: 0, q: 0.72, type: "PK" };
      const gainDb = Math.max(GAIN_MIN, Math.min(GAIN_MAX, f.gain ?? 0));
      const freqRaw = Math.max(0, Math.min(65535, Math.round(f.freq ?? 1e3)));
      const qRaw = Math.round((f.q ?? 0.72) * 100);
      const type = typeFromString(f.type ?? "PK");
      const [gHi, gLo] = encGain(gainDb);
      const pkt = buildPacket(19, 13, [
        1,
        i,
        i,
        gHi,
        gLo,
        freqRaw >> 8 & 255,
        freqRaw & 255,
        qRaw >> 8 & 255,
        qRaw & 255,
        type
      ]);
      try {
        await sendAndReceive(deviceDetails, pkt, 2e3);
      } catch {
        console.log(`FiiO BLE: no ACK for band ${i + 1}, continuing`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log("FiiO BLE: all EQ bands written");
    return false;
  },
  async enablePEQ() {
    console.log("FiiO BLE: EQ enable/disable not supported via BLE protocol");
  }
};
const registration$1 = {
  manufacturer: "FiiO",
  handler: fiioBleHandler,
  filters: { namePrefix: "FIIO" },
  gatt: {
    serviceUuid: "00001100-04a5-1000-1000-40ed981a04a5",
    txCharacteristicUuid: "00001101-04a5-1000-1000-40ed981a04a5",
    rxCharacteristicUuid: "00001102-04a5-1000-1000-40ed981a04a5"
  },
  defaultModelConfig: {
    minGain: -20,
    maxGain: 20,
    maxFilters: 10,
    firstWritableEQSlot: 0,
    maxWritableEQSlots: 1,
    disconnectOnSave: false,
    disabledPresetId: -1,
    experimental: false,
    availableSlots: [{ id: 0, name: "Custom EQ" }]
  },
  devices: {
    "FIIO EH11": { modelConfig: {} },
    "FIIO EH13": { modelConfig: {} }
  }
};
const fiioBle = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fiioBleHandler,
  registration: registration$1
}, Symbol.toStringTag, { value: "Module" }));
const NUM_BANDS = 10;
const RESPONSE_HEADER = [5, 91, 189];
const READ_RESPONSE_LENGTH = 193;
function buildReadPresetCommand(preset) {
  return new Uint8Array([5, 90, 6, 0, 0, 10, preset & 255, 239, 232, 3]);
}
function buildWritePEQCommandMirror(presetNum, filters) {
  if (presetNum < 0 || presetNum > 3) throw new Error("Preset must be 0-3");
  if (filters.length !== NUM_BANDS) throw new Error(`Must provide exactly ${NUM_BANDS} filters`);
  const cmd = [];
  cmd.push(5, 90, 189);
  cmd.push(0, 1);
  cmd.push(10, 0, 239, 1, 0, 0, 0, 0);
  for (const band of filters) {
    const filterType = band.filterType ?? 2;
    cmd.push(1);
    cmd.push(filterType);
    const freqVal = Math.round(band.freqHz * 100);
    const freqBytes = new Uint8Array(new Uint32Array([freqVal]).buffer);
    cmd.push(...freqBytes);
    const gainVal = Math.round(band.gainDb * 100);
    const gainBytes = new Uint8Array(new Int32Array([gainVal]).buffer);
    cmd.push(...gainBytes);
    cmd.push(0, 0, 0, 0);
    const qVal = Math.round(band.qValue * 100);
    const qBytes = new Uint8Array(new Uint32Array([qVal]).buffer);
    cmd.push(...qBytes);
  }
  return new Uint8Array(cmd);
}
function parsePEQResponse(data) {
  if (data.length < READ_RESPONSE_LENGTH) return null;
  if (data[0] !== RESPONSE_HEADER[0] || data[1] !== RESPONSE_HEADER[1] || data[2] !== RESPONSE_HEADER[2]) {
    return null;
  }
  const numBands = data[5];
  const filters = [];
  const filterStart = 13;
  for (let i = 0; i < Math.min(NUM_BANDS, numBands); i++) {
    const offset = filterStart + i * 18;
    if (offset + 18 > data.length) break;
    const freqRaw = data[offset + 2] | data[offset + 3] << 8 | data[offset + 4] << 16 | data[offset + 5] << 24;
    const freqHz = freqRaw / 100;
    let gainRaw = (data[offset + 6] | data[offset + 7] << 8 | data[offset + 8] << 16 | data[offset + 9] << 24) >>> 0;
    if (gainRaw > 2147483647) gainRaw -= 4294967296;
    const gainDb = gainRaw / 100;
    const qRaw = data[offset + 14] | data[offset + 15] << 8 | data[offset + 16] << 16 | data[offset + 17] << 24;
    const qValue = qRaw / 100;
    filters.push({ freq: freqHz, gain: gainDb, q: qValue, type: "PK" });
  }
  return { filters };
}
function normalizeFilters(filters, targetCount) {
  const normalized = [];
  for (const filter of filters) {
    normalized.push({
      freqHz: filter.freq,
      gainDb: filter.gain,
      qValue: filter.q,
      filterType: filter.type === "LSQ" ? 3 : filter.type === "HSQ" ? 4 : 2
    });
    if (normalized.length >= targetCount) break;
  }
  while (normalized.length < targetCount) {
    normalized.push({ freqHz: 1e3, gainDb: 0, qValue: 1, filterType: 2 });
  }
  return normalized;
}
async function writePacket(device, packet) {
  const txChar = device.txChar;
  if (txChar.properties.writeWithoutResponse) {
    await txChar.writeValueWithoutResponse(packet);
  } else {
    await txChar.writeValue(packet);
  }
}
async function readPEQPacket(device, timeoutMs = 5e3) {
  const startTime = Date.now();
  let buffer = [];
  while (Date.now() - startTime < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - startTime);
    const chunk = await device.readNotification(remaining);
    if (!chunk) break;
    buffer.push(...Array.from(chunk));
    const headerIndex = buffer.indexOf(RESPONSE_HEADER[0]);
    if (headerIndex > 0) {
      buffer = buffer.slice(headerIndex);
    }
    if (buffer.length >= READ_RESPONSE_LENGTH) {
      const packet = buffer.slice(0, READ_RESPONSE_LENGTH);
      const parsed = parsePEQResponse(new Uint8Array(packet));
      if (parsed) return parsed;
      buffer = buffer.slice(1);
    }
  }
  return null;
}
const airohaBleHandler = {
  async getCurrentSlot() {
    console.log("Airoha BLE: defaulting to slot 0");
    return 0;
  },
  async pullFromDevice(deviceDetails, slot) {
    console.log(`Airoha BLE: pulling EQ from slot ${slot}`);
    try {
      const command = buildReadPresetCommand(slot);
      await writePacket(deviceDetails, command);
      const response = await readPEQPacket(deviceDetails, 5e3);
      if (!response) throw new Error("No response from device when reading PEQ");
      console.log(`Airoha BLE: pulled ${response.filters.length} filters from slot ${slot}`);
      return { filters: response.filters, globalGain: 0 };
    } catch (error) {
      console.error("Airoha BLE: pullFromDevice failed:", error);
      return { filters: [], globalGain: 0 };
    }
  },
  async pushToDevice(deviceDetails, slot, _preamp, filters) {
    console.log(`Airoha BLE: pushing ${filters.length} filters to slot ${slot}`);
    try {
      const normalized = normalizeFilters(filters, NUM_BANDS);
      const command = buildWritePEQCommandMirror(slot, normalized);
      await writePacket(deviceDetails, command);
      console.log("Airoha BLE: PEQ write command sent");
      return true;
    } catch (error) {
      console.error("Airoha BLE: pushToDevice failed:", error);
      throw error;
    }
  },
  async enablePEQ(_device, enabled, slotId) {
    console.log(`Airoha BLE: enable/disable not supported (requested ${enabled} for slot ${slotId})`);
  }
};
const registration = {
  manufacturer: "Audeze",
  handler: airohaBleHandler,
  filters: {
    namePrefix: "Audeze Maxwell",
    services: ["5052494d-2dab-0341-6972-6f6861424c45"]
  },
  gatt: {
    serviceUuid: "5052494d-2dab-0341-6972-6f6861424c45",
    txCharacteristicUuid: "43484152-2dab-3241-6972-6f6861424c45",
    rxCharacteristicUuid: "43484152-2dab-3141-6972-6f6861424c45"
  },
  devices: {
    "Audeze Maxwell": {
      modelConfig: {
        minGain: -12,
        maxGain: 12,
        maxFilters: 10,
        firstWritableEQSlot: 0,
        maxWritableEQSlots: 4,
        disconnectOnSave: false,
        disabledPresetId: -1,
        experimental: false,
        flatEQPhoneMeasurement: "Audeze Maxwell Flat",
        availableSlots: [
          { id: 0, name: "Preset 1" },
          { id: 1, name: "Preset 2" },
          { id: 2, name: "Preset 3" },
          { id: 3, name: "Preset 4" }
        ]
      }
    }
  }
};
const airohaBle = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  airohaBleHandler,
  registration
}, Symbol.toStringTag, { value: "Module" }));
const PLUGIN_URI = "http://moddevices.com/plugins/caps/EqNp";
const SOURCE_NAME = "wifi";
function convertToWiimMode(filterType, disabled) {
  if (disabled) return -1;
  return WIIM_FILTER_MAP.toCode(filterType);
}
const convertFromWiimMode = WIIM_FILTER_MAP.fromCode;
async function sendHttpCommand(ip, command) {
  const url = `https://${ip}/httpapi.asp?command=${command}`;
  console.log("WiiM: Sending HTTP command:", url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WiiM: HTTP error ${response.status}: ${response.statusText}`);
  }
  const text = await response.text();
  console.log("WiiM: Received response:", text);
  return text;
}
async function sendHttpCommandJson(ip, command, payload) {
  const jsonStr = JSON.stringify(payload);
  const fullCommand = `${command}:${jsonStr}`;
  return sendHttpCommand(ip, encodeURIComponent(fullCommand));
}
function filtersToWiimBands(filters) {
  const bands = [];
  for (const filter of filters) {
    bands.push({
      mode: convertToWiimMode(filter.type, filter.disabled ?? false),
      freq: filter.freq,
      q: filter.q,
      gain: filter.disabled ? 0 : filter.gain
    });
  }
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
const wiimNetworkHandler = {
  async getCurrentSlot(_deviceDetails) {
    return 0;
  },
  async pullFromDevice(deviceDetails, _slot) {
    const ip = deviceDetails.ip;
    const payload = {
      PluginUri: PLUGIN_URI,
      SourceName: SOURCE_NAME
    };
    const responseText = await sendHttpCommandJson(ip, "EQGetLV2SourceBandEx", payload);
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      console.warn("WiiM: Failed to parse pull response:", responseText);
      return { filters: [], globalGain: 0 };
    }
    const eqBands = responseData.EQBand ?? [];
    const filters = wiimBandsToFilters(eqBands);
    return { filters, globalGain: 0 };
  },
  async pushToDevice(deviceDetails, _slot, _preamp, filters) {
    const ip = deviceDetails.ip;
    const eqBands = filtersToWiimBands(filters);
    const setPayload = {
      PluginUri: PLUGIN_URI,
      SourceName: SOURCE_NAME,
      EQBand: eqBands
    };
    await sendHttpCommandJson(ip, "EQSetLV2SourceBand", setPayload);
    const savePayload = {
      PluginUri: PLUGIN_URI,
      SourceName: SOURCE_NAME
    };
    await sendHttpCommandJson(ip, "EQSourceSave", savePayload);
    console.log("WiiM: PEQ filters pushed and saved successfully.");
    return deviceDetails.modelConfig.disconnectOnSave;
  },
  async enablePEQ(deviceDetails, enabled, _slotId) {
    const ip = deviceDetails.ip;
    if (enabled) {
      const payload = {
        PluginUri: PLUGIN_URI,
        SourceName: SOURCE_NAME
      };
      await sendHttpCommandJson(ip, "EQChangeSourceFX", payload);
    } else {
      const payload = {
        PluginUri: PLUGIN_URI,
        SourceName: SOURCE_NAME
      };
      await sendHttpCommandJson(ip, "EQSourceOff", payload);
    }
  }
};
const networkRegistration$1 = {
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
    availableSlots: [{ id: 0, name: "Default" }]
  }
};
const wiimNetwork = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  networkRegistration: networkRegistration$1,
  wiimNetworkHandler
}, Symbol.toStringTag, { value: "Module" }));
const RC = "KLMPQRSTUVWXYZABCGHdefIJjkNOlmnopqrstuvwxyzabcghiDEF34501289+67/";
const PC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeCustom(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) binaryString += String.fromCharCode(bytes[i]);
  const base64 = btoa(binaryString);
  let encoded = "";
  for (let i = 0; i < base64.length; i++) {
    const ch = base64.charAt(i);
    const idx = PC.indexOf(ch);
    encoded += idx !== -1 ? RC.charAt(idx) : ch;
  }
  return encoded;
}
function decodeCustom(encoded) {
  let base64 = "";
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded.charAt(i);
    const idx = RC.indexOf(ch);
    base64 += idx !== -1 ? PC.charAt(idx) : ch;
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
function toLuxsinType(type) {
  const map = {
    LPF: 0,
    HPF: 1,
    BPF: 2,
    Notch: 3,
    Peak: 4,
    PK: 4,
    LSQ: 5,
    HSQ: 6,
    AllPass: 7
  };
  return map[type] ?? 4;
}
function fromLuxsinType(code) {
  switch (code) {
    case 0:
      return "PK";
    // LPF — not in our type system, map to PK
    case 1:
      return "PK";
    // HPF
    case 2:
      return "PK";
    // BPF
    case 3:
      return "PK";
    // Notch
    case 4:
      return "PK";
    case 5:
      return "LSQ";
    case 6:
      return "HSQ";
    case 7:
      return "PK";
    // AllPass
    default:
      return "PK";
  }
}
async function httpGet(ip, pathAndQuery) {
  const url = `http://${ip}${pathAndQuery}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.text();
}
async function httpPostJsonEncoded(ip, path, obj) {
  const jsonStr = JSON.stringify(obj);
  const encodedJson = encodeCustom(jsonStr);
  const body = new URLSearchParams();
  body.append("json", encodedJson);
  const url = `http://${ip}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return true;
}
const luxsinNetworkHandler = {
  async getCurrentSlot(device) {
    try {
      const text = await httpGet(device.ip, "/dev/info.cgi?action=syncPeq");
      const data = JSON.parse(decodeCustom(text));
      return data.peqSelect ?? 0;
    } catch (err) {
      console.warn("Luxsin: getCurrentSlot failed, defaulting to 0", err);
      return 0;
    }
  },
  async pullFromDevice(device, slot) {
    try {
      const [syncDataText, syncPeqText] = await Promise.all([
        httpGet(device.ip, "/dev/info.cgi?action=syncData"),
        httpGet(device.ip, "/dev/info.cgi?action=syncPeq").catch(() => "")
      ]);
      const deviceData = JSON.parse(decodeCustom(syncDataText));
      if (syncPeqText) {
        const peqData = JSON.parse(decodeCustom(syncPeqText));
        if (peqData.peq) deviceData.peq = peqData.peq;
        if (peqData.peqSelect !== void 0) deviceData.peqSelect = peqData.peqSelect;
      }
      let filters = [];
      let preamp = 0;
      const currentIndex = deviceData.peqSelect ?? 0;
      const currentProfile = Array.isArray(deviceData.peq) ? deviceData.peq[currentIndex] : null;
      if (currentProfile) {
        preamp = Number(currentProfile.preamp) || 0;
        try {
          const rawFilters = JSON.parse(currentProfile.filters || "[]");
          filters = rawFilters.map((f) => ({
            type: fromLuxsinType(Number(f.type)),
            freq: Number(f.fc),
            q: Number(f.q),
            gain: Number(f.gain)
          }));
        } catch (e) {
          console.warn("Luxsin: failed to parse filters JSON", e);
        }
      }
      return { filters, globalGain: preamp };
    } catch (err) {
      console.error("Luxsin: error pulling from device", err);
      throw err;
    }
  },
  async pushToDevice(device, slot, preamp, filters) {
    try {
      const deviceIp = device.ip;
      const syncDataText = await httpGet(deviceIp, "/dev/info.cgi?action=syncData");
      const deviceData = JSON.parse(decodeCustom(syncDataText));
      const currentIndex = slot ?? (deviceData.peqSelect ?? 0);
      const profile = Array.isArray(deviceData.peq) ? deviceData.peq[currentIndex] : null;
      const luxFilters = (filters || []).map((f) => ({
        type: toLuxsinType(f.type),
        fc: Number(f.freq),
        gain: Number(f.gain),
        q: Number(f.q)
      }));
      const payload = {
        peq: [
          {
            index: currentIndex,
            name: profile?.name || device.model || `Profile ${currentIndex}`,
            canDel: profile?.canDel ?? 1,
            preamp: Number(preamp ?? profile?.preamp ?? 0),
            filters: JSON.stringify(luxFilters)
          }
        ]
      };
      await httpPostJsonEncoded(deviceIp, "/dev/info.cgi", payload);
      console.log("Luxsin: PEQ updated successfully");
      return false;
    } catch (err) {
      console.error("Luxsin: error pushing to device", err);
      throw err;
    }
  },
  async enablePEQ(device, enabled, slotId) {
    try {
      const payload = { peqEnable: enabled ? 1 : 0 };
      if (slotId !== void 0 && slotId !== null) payload.peqSelect = Number(slotId);
      await httpPostJsonEncoded(device.ip, "/dev/info.cgi", payload);
      console.log(`Luxsin: PEQ ${enabled ? "enabled" : "disabled"} on slot ${slotId}`);
    } catch (err) {
      console.error("Luxsin: error toggling PEQ", err);
      throw err;
    }
  }
};
const networkRegistration = {
  deviceType: "LuxsinX9",
  manufacturer: "Luxsin",
  handler: luxsinNetworkHandler,
  defaultModelConfig: {
    minGain: -12,
    maxGain: 12,
    maxFilters: 10,
    firstWritableEQSlot: 0,
    maxWritableEQSlots: 1,
    disconnectOnSave: false,
    disabledPresetId: -1,
    experimental: false,
    availableSlots: [{ id: 0, name: "Custom" }]
  }
};
const luxsinNetwork = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  luxsinNetworkHandler,
  networkRegistration
}, Symbol.toStringTag, { value: "Module" }));
export {
  getBleConfig,
  getHidConfig,
  getNetworkHandlers,
  getSerialConfig
};

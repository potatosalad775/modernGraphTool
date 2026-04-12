import { n as normalizeFiltersForDevice } from "./normalize-filters.js";
let currentDevice = null;
function buildRequestOptions(config) {
  const filters = [];
  const optionalServices = /* @__PURE__ */ new Set();
  for (const entry of config) {
    const filter = {};
    if (entry.filters?.namePrefix) {
      filter.namePrefix = entry.filters.namePrefix;
    }
    if (Array.isArray(entry.filters?.services) && entry.filters.services.length > 0) {
      filter.services = entry.filters.services;
      entry.filters.services.forEach((s) => optionalServices.add(s));
    }
    if (Object.keys(filter).length > 0) {
      filters.push(filter);
    }
    if (entry.gatt?.serviceUuid) {
      optionalServices.add(entry.gatt.serviceUuid);
    }
  }
  const requestOptions = filters.length > 0 ? { filters } : { acceptAllDevices: true };
  if (optionalServices.size > 0) {
    requestOptions.optionalServices = Array.from(optionalServices);
  }
  return requestOptions;
}
function matchConfigEntry(deviceName, config) {
  if (!deviceName) return null;
  return config.find((entry) => {
    if (entry.filters?.namePrefix && deviceName.startsWith(entry.filters.namePrefix)) {
      return true;
    }
    if (entry.devices && Object.prototype.hasOwnProperty.call(entry.devices, deviceName)) {
      return true;
    }
    return false;
  }) ?? null;
}
function resolveModelConfig(entry, deviceName) {
  const deviceDetails = entry.devices?.[deviceName] || entry.devices?.[Object.keys(entry.devices || {})[0]] || {};
  return {
    ...entry.defaultModelConfig || {},
    ...deviceDetails.modelConfig
  };
}
function createNotificationQueue(rxChar) {
  const queue = [];
  const waiters = [];
  rxChar.addEventListener("characteristicvaluechanged", ((event) => {
    const target = event.target;
    if (!target.value) return;
    const value = new Uint8Array(target.value.buffer);
    if (waiters.length > 0) {
      const resolver = waiters.shift();
      resolver(value);
    } else {
      queue.push(value);
    }
  }));
  return async function readNotification(timeoutMs = 5e3) {
    if (queue.length > 0) {
      return queue.shift();
    }
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      waiters.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  };
}
async function getDeviceConnected(config) {
  try {
    const requestOptions = buildRequestOptions(config);
    const rawDevice = await navigator.bluetooth.requestDevice(requestOptions);
    const entry = matchConfigEntry(rawDevice.name || "", config);
    if (!entry) {
      console.error("Bluetooth BLE: No configuration found for device:", rawDevice.name);
      return null;
    }
    if (currentDevice) return currentDevice;
    const server = await rawDevice.gatt.connect();
    const serviceUuid = entry.gatt?.serviceUuid || entry.filters?.services?.[0];
    if (!serviceUuid) {
      console.error("Bluetooth BLE: No service UUID configured");
      return null;
    }
    const service = await server.getPrimaryService(serviceUuid);
    const txChar = await service.getCharacteristic(entry.gatt.txCharacteristicUuid);
    const rxChar = await service.getCharacteristic(entry.gatt.rxCharacteristicUuid);
    await rxChar.startNotifications();
    const readNotification = createNotificationQueue(rxChar);
    const modelConfig = resolveModelConfig(entry, rawDevice.name || "");
    const model = rawDevice.name || "Bluetooth Device";
    currentDevice = {
      rawDevice,
      manufacturer: entry.manufacturer || "Bluetooth",
      model,
      modelConfig,
      handler: entry.handler,
      connectionType: "ble",
      txChar,
      rxChar,
      readNotification
    };
    rawDevice.addEventListener("gattserverdisconnected", () => {
      currentDevice = null;
    });
    return currentDevice;
  } catch (error) {
    if (error && error.name === "NotFoundError") {
      console.log("Bluetooth device chooser cancelled by user.");
      return null;
    }
    console.error("Failed to connect to Bluetooth BLE device:", error);
    return null;
  }
}
async function disconnectDevice() {
  if (currentDevice?.rawDevice) {
    try {
      const bleDevice = currentDevice.rawDevice;
      if (bleDevice.gatt?.connected) {
        bleDevice.gatt.disconnect();
      }
      currentDevice = null;
    } catch (error) {
      console.error("Failed to disconnect BLE device:", error);
    }
  }
}
async function pushToDevice(device, slot, preamp, filters) {
  if (!device?.handler) {
    console.error("No device handler available for pushing.");
    return true;
  }
  const filtersToWrite = normalizeFiltersForDevice(filters, device.modelConfig);
  return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}
async function pullFromDevice(device, slot) {
  if (device?.handler) {
    return await device.handler.pullFromDevice(device, slot);
  }
  console.error("No device handler available for pulling.");
  return { filters: [], globalGain: 0 };
}
function getAvailableSlots(device) {
  return device.modelConfig.availableSlots;
}
async function getCurrentSlot(device) {
  if (device?.handler) return await device.handler.getCurrentSlot(device);
  console.error("No device handler available for querying");
  return -2;
}
async function enablePEQ(device, enabled, slotId) {
  if (device?.handler) {
    return await device.handler.enablePEQ(device, enabled, slotId);
  }
  console.error("No device handler available for enabling.");
}
function getCurrentDevice() {
  return currentDevice;
}
function clearCurrentDevice() {
  currentDevice = null;
}
export {
  clearCurrentDevice,
  disconnectDevice,
  enablePEQ,
  getAvailableSlots,
  getCurrentDevice,
  getCurrentSlot,
  getDeviceConnected,
  pullFromDevice,
  pushToDevice
};

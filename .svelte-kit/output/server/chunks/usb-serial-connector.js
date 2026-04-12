import { n as normalizeFiltersForDevice } from "./normalize-filters.js";
let currentDevice = null;
async function getDeviceConnected(config) {
  try {
    const filters = [];
    const bluetoothServiceIds = [];
    for (const entry of config) {
      if (entry.vendorId) {
        filters.push({ usbVendorId: entry.vendorId });
      }
      if (entry.filters?.allowedBluetoothServiceClassIds) {
        for (const serviceId of entry.filters.allowedBluetoothServiceClassIds) {
          filters.push({ bluetoothServiceClassId: serviceId });
          bluetoothServiceIds.push(serviceId);
        }
      }
    }
    const requestOptions = {};
    if (filters.length > 0) requestOptions.filters = filters;
    if (bluetoothServiceIds.length > 0) {
      requestOptions.allowedBluetoothServiceClassIds = bluetoothServiceIds;
    }
    const rawDevice = await navigator.serial.requestPort(requestOptions);
    const info = rawDevice.getInfo();
    const productId = info.usbProductId;
    const bluetoothServiceClassId = info.bluetoothServiceClassId;
    let vendorConfig = null;
    let modelName = null;
    let modelConfig;
    let handler = null;
    for (const entry of config) {
      let deviceMatched = false;
      if (entry.vendorId && entry.vendorId === info.usbVendorId) {
        for (const [name, model] of Object.entries(entry.devices)) {
          if (model.usbProductId === productId) {
            vendorConfig = entry;
            modelName = name;
            modelConfig = model.modelConfig;
            handler = entry.handler;
            deviceMatched = true;
            break;
          }
        }
      }
      if (!deviceMatched && entry.filters) {
        const svc = (bluetoothServiceClassId || "").toLowerCase();
        const cfgSingle = (entry.filters.bluetoothServiceClassId || "").toLowerCase();
        const cfgList = Array.isArray(entry.filters.allowedBluetoothServiceClassIds) ? entry.filters.allowedBluetoothServiceClassIds.map(
          (x) => String(x).toLowerCase()
        ) : [];
        if (svc && cfgSingle && svc === cfgSingle || svc && cfgList.includes(svc)) {
          const deviceEntries = Object.entries(entry.devices);
          if (deviceEntries.length > 0) {
            const [name, model] = deviceEntries[0];
            vendorConfig = entry;
            modelName = name;
            modelConfig = model.modelConfig;
            handler = entry.handler;
            deviceMatched = true;
          }
        }
      }
      if (deviceMatched) break;
    }
    if (!vendorConfig || !modelConfig || !handler) {
      console.error("Unsupported serial device");
      return null;
    }
    const defaultBaud = bluetoothServiceClassId ? 9600 : 115200;
    const baudRate = modelConfig.baudRate && !bluetoothServiceClassId ? modelConfig.baudRate : defaultBaud;
    await rawDevice.open({ baudRate });
    let readable = void 0;
    let writable = void 0;
    try {
      if (rawDevice.readable) {
        readable = {
          async read() {
            const r = rawDevice.readable.getReader();
            try {
              return await r.read();
            } finally {
              try {
                r.releaseLock();
              } catch {
              }
            }
          }
        };
      }
      if (rawDevice.writable) {
        writable = {
          async write(data) {
            const w = rawDevice.writable.getWriter();
            try {
              await w.write(data);
            } finally {
              try {
                w.releaseLock();
              } catch {
              }
            }
          }
        };
      }
    } catch (e) {
      console.warn("UsbSerialConnector: Failed to set up read/write shims:", e);
    }
    currentDevice = {
      rawDevice,
      info,
      manufacturer: vendorConfig.manufacturer,
      model: modelName || "Unknown Serial Device",
      handler,
      modelConfig,
      connectionType: "serial",
      readable,
      writable
    };
    return currentDevice;
  } catch (error) {
    console.error("Failed to connect to Serial device:", error);
    return null;
  }
}
async function disconnectDevice() {
  if (currentDevice?.rawDevice) {
    try {
      await currentDevice.rawDevice.close();
      currentDevice = null;
    } catch (error) {
      console.error("Failed to disconnect serial device:", error);
    }
  }
}
async function pushToDevice(device, slot, preamp, filters) {
  if (!device?.handler) return;
  const filtersToWrite = normalizeFiltersForDevice(filters, device.modelConfig);
  return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}
async function pullFromDevice(device, slot) {
  if (!device?.handler) return { filters: [], globalGain: 0 };
  return await device.handler.pullFromDevice(device, slot);
}
function getAvailableSlots(device) {
  return device.modelConfig.availableSlots;
}
async function getCurrentSlot(device) {
  if (device?.handler) return await device.handler.getCurrentSlot(device);
  return -2;
}
async function enablePEQ(device, enabled, slotId) {
  if (device?.handler) return await device.handler.enablePEQ(device, enabled, slotId);
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

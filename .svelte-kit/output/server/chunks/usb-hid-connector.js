import { n as normalizeFiltersForDevice } from "./normalize-filters.js";
let currentDevice = null;
async function getDeviceConnected(config) {
  try {
    const vendorFilters = config.flatMap(
      (entry) => entry.vendorIds.map((vendorId) => ({ vendorId }))
    );
    const selectedDevices = await navigator.hid.requestDevice({ filters: vendorFilters });
    if (selectedDevices.length === 0) return null;
    const rawDevice = selectedDevices[0];
    const vendorConfig = config.find((entry) => entry.vendorIds.includes(rawDevice.vendorId));
    if (!vendorConfig) {
      console.error("No configuration found for vendor:", rawDevice.vendorId);
      return null;
    }
    const model = rawDevice.productName;
    let deviceDetails = vendorConfig.devices[model];
    if (!deviceDetails && vendorConfig.deviceGroups) {
      for (const [groupName, groupConfig] of Object.entries(vendorConfig.deviceGroups)) {
        if (groupConfig.productIds.includes(rawDevice.productId)) {
          deviceDetails = { modelConfig: groupConfig.modelConfig };
          console.log(
            `Matched device by productId in group: ${groupName} (0x${rawDevice.productId.toString(16)})`
          );
          break;
        }
      }
    }
    const resolvedDetails = deviceDetails || {};
    const modelConfig = {
      ...vendorConfig.defaultModelConfig,
      ...resolvedDetails.modelConfig
    };
    const handler = resolvedDetails.handler || vendorConfig.handler;
    if (currentDevice != null) return currentDevice;
    if (!rawDevice.opened) await rawDevice.open();
    currentDevice = {
      rawDevice,
      manufacturer: resolvedDetails.manufacturer || vendorConfig.manufacturer,
      model,
      handler,
      modelConfig,
      connectionType: "hid"
    };
    return currentDevice;
  } catch (error) {
    console.error("Failed to connect to HID device:", error);
    return null;
  }
}
async function disconnectDevice() {
  if (currentDevice?.rawDevice) {
    try {
      await currentDevice.rawDevice.close();
      currentDevice = null;
    } catch (error) {
      console.error("Failed to disconnect device:", error);
    }
  }
}
async function checkDeviceConnected(device) {
  const rawDevice = device.rawDevice;
  const rawDevices = await navigator.hid.getDevices();
  const match = rawDevices.find(
    (d) => d.vendorId === rawDevice.vendorId && d.productId === rawDevice.productId
  );
  if (!match) {
    console.error("Device disconnected?");
    return false;
  }
  if (!match.opened) {
    await match.open();
    device.rawDevice = match;
  }
  return true;
}
async function pushToDevice(device, slot, preamp, filters) {
  if (!await checkDeviceConnected(device)) throw new Error("Device Disconnected");
  if (!device.handler) {
    console.error("No device handler available for pushing.");
    return true;
  }
  const filtersToWrite = normalizeFiltersForDevice(filters, device.modelConfig);
  return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}
async function pullFromDevice(device, slot) {
  if (!await checkDeviceConnected(device)) throw new Error("Device Disconnected");
  if (device.handler) {
    return await device.handler.pullFromDevice(device, slot);
  }
  console.error("No device handler available for pulling.");
  return { filters: [], globalGain: 0 };
}
function getAvailableSlots(device) {
  return device.modelConfig.availableSlots;
}
async function getCurrentSlot(device) {
  if (device.handler) return await device.handler.getCurrentSlot(device);
  console.error("No device handler available for querying");
  return -2;
}
async function enablePEQ(device, enabled, slotId) {
  if (device.handler) {
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

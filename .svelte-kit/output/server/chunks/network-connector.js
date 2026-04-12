let currentDevice = null;
async function getDeviceConnected(deviceIP, deviceType) {
  try {
    if (!deviceIP) {
      console.warn("No IP Address provided.");
      return null;
    }
    const { getNetworkHandlers } = await import("./registry.js");
    const handlers = await getNetworkHandlers();
    const entry = handlers[deviceType];
    if (!entry) {
      console.warn("Unsupported Device Type.");
      return null;
    }
    currentDevice = {
      rawDevice: null,
      ip: deviceIP,
      manufacturer: deviceType,
      model: deviceType,
      handler: entry.handler,
      modelConfig: entry.defaultModelConfig,
      connectionType: "network"
    };
    return currentDevice;
  } catch (error) {
    console.error("Failed to connect to Network Device:", error);
    return null;
  }
}
async function disconnectDevice() {
  if (currentDevice) {
    currentDevice = null;
  }
}
async function pushToDevice(device, slot, preamp, filters) {
  if (!currentDevice) {
    console.warn("No network device connected.");
    return;
  }
  return await currentDevice.handler.pushToDevice(currentDevice, slot, preamp, filters);
}
async function pullFromDevice(device, slot) {
  if (!currentDevice) {
    console.warn("No network device connected.");
    return { filters: [], globalGain: 0 };
  }
  return await currentDevice.handler.pullFromDevice(currentDevice, slot);
}
async function getCurrentSlot(device) {
  if (!currentDevice) return 0;
  return await currentDevice.handler.getCurrentSlot(currentDevice);
}
async function enablePEQ(device, enabled, slotId) {
  if (!currentDevice) {
    console.warn("No network device connected.");
    return;
  }
  return await currentDevice.handler.enablePEQ(currentDevice, enabled, slotId);
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
  getCurrentDevice,
  getCurrentSlot,
  getDeviceConnected,
  pullFromDevice,
  pushToDevice
};

function normalizeFiltersForDevice(filters, modelConfig) {
  const result = filters.map((f) => ({ ...f }));
  if (result.length > modelConfig.maxFilters) {
    console.warn(
      `USB Device PEQ: Truncating ${result.length} filters to ${modelConfig.maxFilters} (device limit)`
    );
    result.splice(modelConfig.maxFilters);
  }
  for (const f of result) {
    if (f.freq < 20 || f.freq > 2e4) f.freq = 100;
    if (f.q < 0.01 || f.q > 100) f.q = 1;
  }
  const hasLSHSFilters = result.some(
    (f) => (f.type === "LSQ" || f.type === "HSQ") && f.gain !== 0
  );
  const needsPreGain = result.some((f) => f.gain > 0);
  if (hasLSHSFilters && modelConfig.supportsLSHSFilters === false) {
    for (const f of result) {
      if ((f.type === "LSQ" || f.type === "HSQ") && f.gain !== 0) {
        f.type = "PK";
        f.gain = 0;
      }
    }
    if (needsPreGain && modelConfig.supportsPregain === false) {
      console.warn(
        "Device doesn't support LS/HS filters and auto pregain - both will be ignored"
      );
    } else {
      console.warn("Device only supports Peak filters - ignoring LS/HS filters");
    }
  } else if (needsPreGain && modelConfig.supportsPregain === false) {
    console.warn("Device does not support auto calculated pregain");
  }
  if (result.length < modelConfig.maxFilters && modelConfig.defaultResetFiltersValues) {
    const defaultFilter = modelConfig.defaultResetFiltersValues[0];
    for (let i = result.length; i < modelConfig.maxFilters; i++) {
      result.push({
        type: defaultFilter.filterType || "PK",
        freq: defaultFilter.freq,
        q: defaultFilter.q,
        gain: defaultFilter.gain
      });
    }
  }
  return result;
}
export {
  normalizeFiltersForDevice as n
};

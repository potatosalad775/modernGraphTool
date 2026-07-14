# Device PEQ — Hardware Equalizer Bridge

USB/Bluetooth/network bridge for reading and writing parametric EQ settings to audio hardware devices. Supports WebHID, WebSerial, Web Bluetooth (BLE GATT), and HTTP-based protocols.

Originally based on [devicePEQ](https://github.com/jeromeof/devicePEQ) by **jeromeof** (Pragmatic Audio). Ported to TypeScript with a modular architecture for integration into modernGraphTool.

## Architecture

```
src/lib/device-peq/
├── types.ts                  Core types (DeviceHandler, DeviceFilter, ConnectedDevice, etc.)
├── registry.ts               Lazy-loading device registry
├── normalize-filters.ts      Pre-write filter validation shared across connectors
├── web-device-apis.d.ts      WebHID, WebSerial & Web Bluetooth API type declarations
│
├── connectors/               Transport layer — one per connection type
│   ├── usb-hid-connector.ts       WebHID device discovery + communication
│   ├── usb-serial-connector.ts    WebSerial device discovery + communication (incl. BT SPP)
│   ├── bluetooth-ble-connector.ts Web Bluetooth BLE GATT discovery + communication
│   └── network-connector.ts       HTTP-based device communication
│
├── handlers/                 Protocol layer — one per device family
│   ├── fiio-usb-hid.ts           FiiO HID binary protocol
│   ├── fiio-usb-serial.ts        FiiO Serial binary protocol
│   ├── fiio-spp-serial.ts        FiiO EH11/EH13 Bluetooth SPP (F1 10 framing)
│   ├── fiio-ble.ts               FiiO EH11/EH13 BLE GATT (F1 10 framing)
│   ├── walkplay-hid.ts           Walkplay HID protocol (biquad IIR)
│   ├── moondrop-usb-hid.ts       Moondrop HID protocol (biquad IIR)
│   ├── moondrop-old-fashioned-hid.ts  Moondrop Old Fashioned register R/W protocol
│   ├── moondrop-edge-usb-serial.ts    Moondrop Edge ANC shifted-gain SPP protocol
│   ├── ktmicro-usb-hid.ts        KTMicro HID protocol
│   ├── qudelix-usb-hid.ts        Qudelix HID protocol (experimental)
│   ├── fosi-audio-usb-hid.ts     Fosi Audio DS3 feature report protocol
│   ├── topping-usb-hid.ts        Topping per-band register protocol (unregistered)
│   ├── jds-labs-usb-serial.ts    JDS Labs JSON-over-serial protocol
│   ├── nothing-usb-serial.ts     Nothing binary protocol (CRC16, BT SPP)
│   ├── rita-usb-serial.ts        Tanchjim Rita SPP protocol (12-band)
│   ├── earfun-usb-serial.ts      EarFun Tune Pro SPP (write-only)
│   ├── edifier-usb-serial.ts     Edifier ConnectX SPP (write-only, lookup-table freq)
│   ├── airoha-usb-serial.ts      Audeze Maxwell SPP (Airoha chipset)
│   ├── airoha-ble.ts             Audeze Maxwell BLE GATT (Airoha chipset)
│   ├── wiim-network.ts           WiiM HTTP/JSON API
│   └── luxsin-network.ts         Luxsin X9 HTTP API (custom base64 encoding)
│
└── utils/                    Shared utilities used across handlers
    ├── filter-type-maps.ts       Bidirectional PK/LSQ/HSQ <-> device code mappings
    ├── biquad.ts                 IIR biquad coefficient computation + byte packing
    └── fiio-protocol.ts          FiiO protocol constants + gain encoding helpers
```

## Supported Devices

### USB HID (50+ devices)

- **FiiO**: QX13, KA17, KA15, Q7, BT11, Air Link, BTR13, BTR17, K13 R2R, BR15 R2R, FP3, FG3, FX17, and more
- **Walkplay chipset**: EPZ TP13, Truthear KEYX, Hi-MAX, AE6, TP35 Pro, DA5, G303, plus ~67 auto-detected devices via productId groups (SchemeNo11/SchemeNo16)
- **Moondrop**: Old Fashioned, Rays, Marigold, FreeDSP Pro/Mini, MOONRIVER 3, DAWN PRO 2, Quark2, ECHO-A, ddHiFi DSP, and more
- **KTMicro**: Allegro PRO, KT02H20, TANCHJIM BUNNY DSP/FISSION, CDSP, Chu2 DSP
- **Fosi Audio**: DS3
- **Qudelix**: 5K (experimental)
- **SNOWSKY**: Melody, TINY A/B
- **JadeAudio**: JIEZI, JA11

### USB Serial / Bluetooth SPP (9 devices)

- **JDS Labs**: Element IV (JSON-over-serial)
- **Nothing**: Headphones (BT SPP, CRC16)
- **FiiO**: Audio DSP (USB Serial), EH11/EH13 (BT SPP)
- **Tanchjim**: Rita (BT SPP, 12-band)
- **Moondrop**: Edge ANC (BT SPP, shifted-gain encoding)
- **EarFun**: Tune Pro (BT SPP, write-only)
- **Edifier**: W830NB (BT SPP, write-only)

### Bluetooth BLE (3 devices)

- **FiiO**: EH11, EH13 (BLE GATT, F1 10 framing)
- **Audeze**: Maxwell (BLE GATT, Airoha chipset)

### Network (2 devices)

- **WiiM**: Mini/Pro/Pro Plus/Ultra/Amp (HTTP/JSON, Linkplay API)
- **Luxsin**: X9 (HTTP, custom base64 encoding)

## Data Flow

```
UI (DevicePeq.svelte)
  → Connector (device discovery, filter normalization)
    → Handler (protocol-specific encoding/decoding)
      → Hardware device (HID reports / serial bytes / BLE GATT / HTTP)
```

**Pull:** User clicks "Pull" → connector calls `handler.pullFromDevice()` → handler decodes device response → returns `PullResult { filters, globalGain }` → UI populates EQ store.

**Push:** User clicks "Push" → connector calls `normalizeFiltersForDevice()` (clamp, truncate, pad) → calls `handler.pushToDevice()` → handler encodes and transmits → device stores filters.

## Handler Interface

Every handler implements this interface (defined in `types.ts`):

```typescript
interface DeviceHandler {
	getCurrentSlot(device: ConnectedDevice): Promise<number>;
	pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult>;
	pushToDevice(
		device: ConnectedDevice,
		slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean>;
	enablePEQ(device: ConnectedDevice, enabled: boolean, slotId: number): Promise<void>;
}
```

## Adding a New Device

### 1. Create a handler file

Create `handlers/your-device.ts`. Implement the `DeviceHandler` interface and export it:

```typescript
import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult } from '../types.js';

export const yourDeviceHandler: DeviceHandler = {
	async getCurrentSlot(device) {
		/* ... */
	},
	async pullFromDevice(device, slot) {
		/* ... */
	},
	async pushToDevice(device, slot, preamp, filters) {
		/* ... */
	},
	async enablePEQ(device, enabled, slotId) {
		/* ... */
	}
};
```

### 2. Export a registration

At the bottom of the same file, export a `registration` object with vendor IDs, default config, and per-device overrides:

**For HID devices:**

```typescript
import type { UsbHidVendorConfig } from '../types.js';

export const registration: UsbHidVendorConfig = {
	vendorIds: [0x1234],
	manufacturer: 'Your Brand',
	handler: yourDeviceHandler,
	defaultModelConfig: {
		minGain: -12,
		maxGain: 12,
		maxFilters: 10,
		firstWritableEQSlot: 0,
		maxWritableEQSlots: 1,
		disconnectOnSave: false,
		disabledPresetId: -1,
		experimental: true,
		availableSlots: [{ id: 0, name: 'Custom' }]
	},
	devices: {
		'Product Name': { modelConfig: { maxFilters: 5, experimental: false } }
	},
	// Optional: match unknown productNames by USB productId
	deviceGroups: {
		GroupName: {
			productIds: [0x1234, 0x5678],
			modelConfig: { maxFilters: 10 }
		}
	}
};
```

**For Serial devices:**

```typescript
import type { UsbSerialVendorConfig } from '../types.js';

export const registration: UsbSerialVendorConfig = {
	vendorId: 0x1234, // USB vendor ID (omit for Bluetooth SPP)
	manufacturer: 'Your Brand',
	handler: yourDeviceHandler,
	// For Bluetooth SPP devices:
	// filters: {
	//   usbVendorId: null,
	//   allowedBluetoothServiceClassIds: ['your-uuid'],
	//   bluetoothServiceClassId: 'your-uuid',
	// },
	devices: {
		'Product Name': {
			usbProductId: 12345,
			modelConfig: {
				/* full DeviceModelConfig */
			}
		}
	}
};
```

**For BLE devices:**

```typescript
import type { BleDeviceConfig } from '../types.js';

export const registration: BleDeviceConfig = {
	manufacturer: 'Your Brand',
	handler: yourDeviceHandler,
	filters: { namePrefix: 'YourDevice' },
	gatt: {
		serviceUuid: 'your-service-uuid',
		txCharacteristicUuid: 'your-tx-uuid',
		rxCharacteristicUuid: 'your-rx-uuid'
	},
	defaultModelConfig: {
		/* DeviceModelConfig */
	},
	devices: {
		'Device Name': { modelConfig: {} }
	}
};
```

**For Network devices:**

```typescript
export const networkRegistration = {
	deviceType: 'YourDevice',
	manufacturer: 'Your Brand',
	handler: yourDeviceHandler,
	defaultModelConfig: {
		/* DeviceModelConfig */
	} satisfies DeviceModelConfig
};
```

### 3. Register in the registry

Add one import line to `registry.ts`:

**HID** — add to the `Promise.all` in `getHidConfig()`:

```typescript
import('./handlers/your-device.js'),
```

Then add `yourModule.registration` to the `_hidConfig` array, and add an entry to `handlerMap` if other devices may reference your handler.

**Serial** — add to the `Promise.all` in `getSerialConfig()`:

```typescript
import('./handlers/your-device.js'),
```

Then add `yourModule.registration` to the `_serialConfig` array.

**BLE** — add to the `Promise.all` in `getBleConfig()`:

```typescript
import('./handlers/your-device.js'),
```

Then add `yourModule.registration` to the `_bleConfig` array.

**Network** — add to `getNetworkHandlers()`:

```typescript
const { networkRegistration } = await import('./handlers/your-device.js');
_networkHandlers[networkRegistration.deviceType] = { ... };
```

That's it — **2 files touched** (1 new handler, 1 one-liner in registry).

## Shared Utilities

### Filter Type Maps (`utils/filter-type-maps.ts`)

Each device encodes PK/LSQ/HSQ as different numbers. Use pre-built maps or create your own:

```typescript
import { FIIO_FILTER_MAP, createFilterTypeMap } from '../utils/filter-type-maps.js';

// Pre-built: FIIO_FILTER_MAP, WALKPLAY_FILTER_MAP, KTMICRO_FILTER_MAP, QUDELIX_FILTER_MAP, WIIM_FILTER_MAP
FIIO_FILTER_MAP.toCode('PK'); // → 0
FIIO_FILTER_MAP.fromCode(1); // → 'LSQ'

// Custom:
const MY_MAP = createFilterTypeMap({ PK: 5, LSQ: 6, HSQ: 7 });
```

### Biquad Computation (`utils/biquad.ts`)

For devices that need client-side IIR biquad coefficients (Walkplay, Moondrop):

```typescript
import { computeWalkplayBiquad, biquadCoeffsToBytes } from '../utils/biquad.js';

const coeffs = computeWalkplayBiquad(freq, gain, q); // 5 quantized int32 coefficients
const bytes = biquadCoeffsToBytes(coeffs); // 20-byte LE Uint8Array
```

### FiiO Protocol (`utils/fiio-protocol.ts`)

Shared constants and helpers for FiiO HID/Serial handlers:

```typescript
import {
	SET_HEADER1,
	PEQ_FILTER_PARAMS,
	fiioGainBytesFromValue,
	handleGain
} from '../utils/fiio-protocol.js';
```

### Filter Normalization (`normalize-filters.ts`)

Applied automatically by connectors before `pushToDevice()`. Handles:

- Truncating filters to device `maxFilters`
- Clamping frequency (20–20000 Hz) and Q (0.01–100)
- Converting unsupported LS/HS filters to PK
- Padding unused slots with default filter values

## Cross-Handler References

Some devices share a vendor ID range but use a different protocol handler. The Walkplay registration includes devices that use the FiiO, Moondrop, or Old Fashioned handler. These use `handlerRef` strings that the registry resolves at load time:

```typescript
devices: {
  'FIIO FX17 ': { manufacturer: 'FiiO', handlerRef: 'fiio-usb-hid', modelConfig: { ... } },
  'Rays': { manufacturer: 'Moondrop', handlerRef: 'moondrop-usb-hid' },
  'Old Fashioned': { manufacturer: 'Moondrop', handlerRef: 'moondrop-old-fashioned-hid', modelConfig: { ... } },
}
```

Valid `handlerRef` keys match the handler map in `registry.ts`: `'fiio-usb-hid'`, `'walkplay-hid'`, `'moondrop-usb-hid'`, `'ktmicro-usb-hid'`, `'moondrop-old-fashioned-hid'`.

## Device Groups (productId fallback matching)

The Walkplay vendor config includes `deviceGroups` for automatic matching when a device's `productName` doesn't match any known entry but its USB `productId` does:

```typescript
deviceGroups: {
  SchemeNo11: {
    productIds: [0x13d4, 0x98c0, ...],  // 16 product IDs
    modelConfig: { supportsLSHSFilters: false, supportsPregain: true }
  },
  SchemeNo16: {
    productIds: [0x4380, 0x43b6, ...],  // ~50 product IDs
    modelConfig: { schemeNo: 16, maxFilters: 10, ... }
  }
}
```

The HID connector tries three matching strategies in order:

1. Match by `productName` in `devices`
2. Match by `productId` in `deviceGroups`
3. Fall back to `defaultModelConfig`

## Porting from the Original Project

This module was ported from jeromeof's [devicePEQ](https://github.com/jeromeof/devicePEQ), which is plain JavaScript using IIFE module patterns. The original project continues to evolve independently — new handlers and device entries are added there first, then ported here. This section documents what the port involves so future sync-ups go smoothly.

### What changes between original JS and our TypeScript

**Module structure.** The original wraps each handler in an IIFE:

```javascript
export const fiioUsbHID = (function () {
	// private functions...
	return { getCurrentSlot, pullFromDevice, pushToDevice, enablePEQ };
})();
```

We convert this to a plain exported object that satisfies the `DeviceHandler` interface:

```typescript
export const fiioUsbHidHandler: DeviceHandler = {
  async getCurrentSlot(device) { ... },
  async pullFromDevice(device, slot) { ... },
  async pushToDevice(device, slot, preamp, filters) { ... },
  async enablePEQ(device, enabled, slotId) { ... },
};
```

Private functions become module-level functions above the export.

**`pushToDevice` signature.** The original passes `(deviceDetails, phoneObj, slot, globalGain, filters)`. Our interface uses `(device, slot, preamp, filters)` — `phoneObj` is dropped entirely. If the original handler uses `phoneObj` (only Luxsin does, for naming new presets), find an alternative (we use `device.model` as fallback).

**Device configs are separate in the original, co-located here.** The original has standalone config files (`usbDeviceConfig.js`, `usbSerialDeviceConfig.js`, `bluetoothBleDeviceConfig.js`). In our version, each handler file exports its own `registration` object at the bottom. When porting, you need to pull the relevant config entries from the original's config file and embed them in the handler's `registration`.

**Device access patterns differ by transport:**

| Transport | Original access                              | Our access                                     |
| --------- | -------------------------------------------- | ---------------------------------------------- |
| HID       | `deviceDetails.rawDevice`                    | `device.rawDevice as HIDDevice`                |
| Serial    | `deviceDetails.writable.write()`             | `device.writable!.write()`                     |
| BLE       | `device.txChar`, `device.readNotification()` | `device.txChar!`, `device.readNotification!()` |
| Network   | `device.ip`                                  | `device.ip!`                                   |

Serial and BLE fields are optional on `ConnectedDevice`, so TypeScript requires non-null assertions (`!`).

**Return types are stricter.** Original `pushToDevice` often returns `undefined`. Ours must return `Promise<boolean>` — `true` means "disconnect after save", `false` means "stay connected". Check what the original returns and make it explicit.

**Filter types must match.** Our `DeviceFilterType` is `'PK' | 'LSQ' | 'HSQ'`. Some original handlers use extended types like `'LPF'`, `'HPF'`, `'NOTCH'`, `'ALLPASS'` that don't exist in our type system. Map these to `'PK'` when porting.

### Porting checklist

When syncing a new handler from the original project:

1. **Read the original handler** and its corresponding config entries (check both the handler JS file and the relevant `*DeviceConfig.js` file)
2. **Create the TypeScript handler file** — convert the IIFE to a module, add types, fix the `pushToDevice` signature
3. **Embed the registration** — copy device entries from the original config file into the `registration` export, converting to our type interfaces
4. **Check for new `DeviceModelConfig` fields** — the original may have added config fields we don't have yet (e.g., `writeOnly`, `autoGlobalGain` were added during the last sync). Add them as optional fields to `DeviceModelConfig` in `types.ts`
5. **Register in `registry.ts`** — add the import and push to the appropriate config array
6. **Check for new device entries on existing handlers** — the original often adds new devices to existing vendor configs without creating new handlers. Compare the `devices` objects in our registration vs. the original's config entries
7. **Run `npm run check`**

### Things to watch for

- **Trailing spaces in device names.** Some original device names have intentional trailing spaces (e.g., `'FIIO FX17 '`, `'ES9039 '`). These must match exactly — the connector matches on `rawDevice.productName`.
- **Handler references across vendors.** Walkplay's device list includes entries that use completely different handlers (FiiO, Moondrop, Old Fashioned) via `handlerRef`. When porting new walkplay devices, check which handler they actually use.
- **Feature reports vs input reports.** Most HID handlers use `sendReport`/`oninputreport`. Fosi Audio uses `sendFeatureReport`/`receiveFeatureReport` — a different HID communication pattern. Check the original to see which API the handler calls.
- **Topping handler pattern.** The Topping handler is imported by the original project but has no device config entries pointing to it. We mirror this: the handler file exists but is intentionally not registered. If the original adds Topping device entries in the future, register it then.

## Browser Compatibility

| Transport           | Chrome/Edge        | Firefox | Safari |
| ------------------- | ------------------ | ------- | ------ |
| WebHID              | Yes                | No      | No     |
| WebSerial (USB)     | Yes                | No      | No     |
| WebSerial (BT SPP)  | Yes (varies by OS) | No      | No     |
| Web Bluetooth (BLE) | Yes (HTTPS only)   | No      | No     |
| Network (HTTP)      | Yes                | Yes     | Yes    |

## Testing

Utility tests are in `*.spec.ts` files alongside their source:

```
npm run test -- src/lib/device-peq    # run device-peq tests only
```

Handler functions depend on browser APIs (WebHID, WebSerial, Web Bluetooth) and require manual testing with real hardware. The shared utilities are pure functions and fully unit-tested.

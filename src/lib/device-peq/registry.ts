/**
 * Device PEQ Registry — collects registrations from handler modules.
 *
 * Each handler module co-exports a `registration` object alongside its handler.
 * This file lazily imports them and builds the config arrays that connectors consume.
 *
 * To add a new device:
 *   1. Create a handler in handlers/ that exports `registration`
 *   2. Add one `import()` line to the appropriate Promise.all below
 */
import type {
	DeviceHandler,
	UsbHidVendorConfig,
	UsbSerialVendorConfig,
	BleDeviceConfig
} from './types.js';

// ---------------------------------------------------------------------------
// Lazy caches
// ---------------------------------------------------------------------------

let _hidConfig: UsbHidVendorConfig[] | null = null;
let _serialConfig: UsbSerialVendorConfig[] | null = null;
let _bleConfig: BleDeviceConfig[] | null = null;
let _networkHandlers: Record<
	string,
	{ handler: DeviceHandler; defaultModelConfig: UsbHidVendorConfig['defaultModelConfig'] }
> | null = null;

// ---------------------------------------------------------------------------
// Cross-handler reference resolution
// ---------------------------------------------------------------------------

/**
 * Some device entries reference handlers from other modules via `handlerRef`
 * (e.g. Walkplay config entries that use the FiiO or Moondrop handler).
 * This function resolves those string references to actual handler objects.
 */
function resolveHandlerRefs(
	configs: UsbHidVendorConfig[],
	handlerMap: Record<string, DeviceHandler>
): void {
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

// ---------------------------------------------------------------------------
// HID config
// ---------------------------------------------------------------------------

export async function getHidConfig(): Promise<UsbHidVendorConfig[]> {
	if (_hidConfig) return _hidConfig;

	const [fiioHid, walkplay, moondrop, ktmicro, oldFashioned, fosiAudio] = await Promise.all([
		import('./handlers/fiio-usb-hid.js'),
		import('./handlers/walkplay-hid.js'),
		import('./handlers/moondrop-usb-hid.js'),
		import('./handlers/ktmicro-usb-hid.js'),
		import('./handlers/moondrop-old-fashioned-hid.js'),
		import('./handlers/fosi-audio-usb-hid.js')
	]);

	// Build handler lookup for cross-references
	const handlerMap: Record<string, DeviceHandler> = {
		'fiio-usb-hid': fiioHid.fiioUsbHidHandler,
		'walkplay-hid': walkplay.walkplayHidHandler,
		'moondrop-usb-hid': moondrop.moondropUsbHidHandler,
		'ktmicro-usb-hid': ktmicro.ktmicroUsbHidHandler,
		'moondrop-old-fashioned-hid': oldFashioned.moondropOldFashionedHidHandler
	};

	// Collect registrations from modules that have vendor configs
	_hidConfig = [
		fiioHid.registration,
		walkplay.registration,
		ktmicro.registration,
		fosiAudio.registration
	];

	// Resolve cross-handler references (e.g. Walkplay devices using FiiO/Moondrop handlers)
	resolveHandlerRefs(_hidConfig, handlerMap);

	return _hidConfig;
}

// ---------------------------------------------------------------------------
// Serial config
// ---------------------------------------------------------------------------

export async function getSerialConfig(): Promise<UsbSerialVendorConfig[]> {
	if (_serialConfig) return _serialConfig;

	const [jdsLabs, nothing, fiioSerial, fiioSpp, rita, earfun, edifier, moondropEdge, airoha] =
		await Promise.all([
			import('./handlers/jds-labs-usb-serial.js'),
			import('./handlers/nothing-usb-serial.js'),
			import('./handlers/fiio-usb-serial.js'),
			import('./handlers/fiio-spp-serial.js'),
			import('./handlers/rita-usb-serial.js'),
			import('./handlers/earfun-usb-serial.js'),
			import('./handlers/edifier-usb-serial.js'),
			import('./handlers/moondrop-edge-usb-serial.js'),
			import('./handlers/airoha-usb-serial.js')
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

// ---------------------------------------------------------------------------
// BLE config
// ---------------------------------------------------------------------------

export async function getBleConfig(): Promise<BleDeviceConfig[]> {
	if (_bleConfig) return _bleConfig;

	const [fiioBle, airohaBle] = await Promise.all([
		import('./handlers/fiio-ble.js'),
		import('./handlers/airoha-ble.js')
	]);

	_bleConfig = [fiioBle.registration, airohaBle.registration];

	return _bleConfig;
}

// ---------------------------------------------------------------------------
// Network config
// ---------------------------------------------------------------------------

export async function getNetworkHandlers(): Promise<
	Record<
		string,
		{ handler: DeviceHandler; defaultModelConfig: UsbHidVendorConfig['defaultModelConfig'] }
	>
> {
	if (_networkHandlers) return _networkHandlers;

	const [wiim, luxsin] = await Promise.all([
		import('./handlers/wiim-network.js'),
		import('./handlers/luxsin-network.js')
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

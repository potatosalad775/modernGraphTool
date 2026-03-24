/**
 * Device PEQ Configuration — unified registry of all supported USB HID, Serial, and Network devices.
 * Handlers are imported lazily when first needed.
 */
import type { DeviceHandler, UsbHidVendorConfig, UsbSerialVendorConfig } from './types.js';

// ---------------------------------------------------------------------------
// Lazy handler imports — resolved on first call to getHidConfig / getSerialConfig
// ---------------------------------------------------------------------------

let _hidConfig: UsbHidVendorConfig[] | null = null;
let _serialConfig: UsbSerialVendorConfig[] | null = null;

export async function getHidConfig(): Promise<UsbHidVendorConfig[]> {
	if (_hidConfig) return _hidConfig;

	const [
		{ fiioUsbHidHandler },
		{ walkplayHidHandler },
		{ moondropUsbHidHandler },
		{ ktmicroUsbHidHandler },
		{ qudelixUsbHidHandler }
	] = await Promise.all([
		import('./handlers/fiio-usb-hid.js'),
		import('./handlers/walkplay-hid.js'),
		import('./handlers/moondrop-usb-hid.js'),
		import('./handlers/ktmicro-usb-hid.js'),
		import('./handlers/qudelix-usb-hid.js')
	]);

	_hidConfig = buildHidConfig(
		fiioUsbHidHandler,
		walkplayHidHandler,
		moondropUsbHidHandler,
		ktmicroUsbHidHandler,
		qudelixUsbHidHandler
	);
	return _hidConfig;
}

export async function getSerialConfig(): Promise<UsbSerialVendorConfig[]> {
	if (_serialConfig) return _serialConfig;

	const [
		{ jdsLabsUsbSerialHandler },
		{ nothingUsbSerialHandler },
		{ fiioUsbSerialHandler }
	] = await Promise.all([
		import('./handlers/jds-labs-usb-serial.js'),
		import('./handlers/nothing-usb-serial.js'),
		import('./handlers/fiio-usb-serial.js')
	]);

	_serialConfig = buildSerialConfig(
		jdsLabsUsbSerialHandler,
		nothingUsbSerialHandler,
		fiioUsbSerialHandler
	);
	return _serialConfig;
}

// ---------------------------------------------------------------------------
// HID device registry
// ---------------------------------------------------------------------------

function buildHidConfig(
	fiioUsbHID: DeviceHandler,
	walkplayUsbHID: DeviceHandler,
	moondropUsbHidHandler: DeviceHandler,
	ktmicroUsbHidHandler: DeviceHandler,
	_qudelixUsbHidHandler: DeviceHandler
): UsbHidVendorConfig[] {
	const FIIO_DEFAULT_SLOTS = [
		{ id: 0, name: 'Jazz' },
		{ id: 1, name: 'Pop' },
		{ id: 2, name: 'Rock' },
		{ id: 3, name: 'Dance' },
		{ id: 4, name: 'R&B' },
		{ id: 5, name: 'Classic' },
		{ id: 6, name: 'Hip-hop' },
		{ id: 7, name: 'Monitor' },
		{ id: 160, name: 'USER1' },
		{ id: 161, name: 'USER2' },
		{ id: 162, name: 'USER3' },
		{ id: 163, name: 'USER4' },
		{ id: 164, name: 'USER5' },
		{ id: 165, name: 'USER6' },
		{ id: 166, name: 'USER7' },
		{ id: 167, name: 'USER8' },
		{ id: 168, name: 'USER9' },
		{ id: 169, name: 'USER10' }
	];

	const FIIO_KA17_SLOTS = [
		{ id: 0, name: 'Jazz' },
		{ id: 1, name: 'Pop' },
		{ id: 2, name: 'Rock' },
		{ id: 3, name: 'Dance' },
		{ id: 5, name: 'R&B' },
		{ id: 6, name: 'Classic' },
		{ id: 7, name: 'Hip-hop' },
		{ id: 4, name: 'USER1' },
		{ id: 8, name: 'USER2' },
		{ id: 9, name: 'USER3' }
	];

	return [
		{
			vendorIds: [0x2972, 0x0a12],
			manufacturer: 'FiiO',
			handler: fiioUsbHID,
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
				defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
				reportId: 7,
				availableSlots: FIIO_DEFAULT_SLOTS
			},
			devices: {
				'FIIO QX13': { modelConfig: { maxFilters: 10, experimental: false, disconnectOnSave: false } },
				'SNOWSKY Melody': { manufacturer: 'FiiO', handler: fiioUsbHID, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: true } },
				'JadeAudio JIEZI': { manufacturer: 'FiiO', handler: fiioUsbHID, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 4, experimental: false, reportId: 2 } },
				'JadeAudio JA11': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 4, experimental: false, reportId: 2, availableSlots: [{ id: 0, name: 'Vocal' }, { id: 1, name: 'Classic' }, { id: 2, name: 'Bass' }, { id: 3, name: 'USER1' }] } },
				'FIIO KA17': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
				'FIIO Q7': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
				'FIIO KA17 (MQA HID)': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
				'FIIO BT11 (UAC1.0)': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
				'FIIO Air Link': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, reportId: 1, availableSlots: FIIO_KA17_SLOTS } },
				'FIIO BTR13': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 12, experimental: false, availableSlots: [{ id: 0, name: 'Jazz' }, { id: 1, name: 'Pop' }, { id: 2, name: 'Rock' }, { id: 3, name: 'Dance' }, { id: 4, name: 'R&B' }, { id: 5, name: 'Classic' }, { id: 6, name: 'Hip-hop' }, { id: 7, name: 'USER1' }, { id: 8, name: 'USER2' }, { id: 9, name: 'USER3' }] } },
				'BTR17': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false } },
				'FIIO KA15': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, availableSlots: [{ id: 0, name: 'Jazz' }, { id: 1, name: 'Pop' }, { id: 2, name: 'Rock' }, { id: 3, name: 'Dance' }, { id: 4, name: 'R&B' }, { id: 5, name: 'Classic' }, { id: 6, name: 'Hip-hop' }, { id: 7, name: 'USER1' }, { id: 8, name: 'USER2' }, { id: 9, name: 'USER3' }] } },
				'LS-TC2': { modelConfig: { minGain: -12, maxGain: 12, maxFilters: 5, firstWritableEQSlot: 3, maxWritableEQSlots: 1, disconnectOnSave: true, disabledPresetId: 11, experimental: true, availableSlots: [{ id: 0, name: 'Vocal' }, { id: 1, name: 'Classic' }, { id: 2, name: 'Bass' }, { id: 3, name: 'Dance' }, { id: 4, name: 'R&B' }, { id: 5, name: 'Classic' }, { id: 6, name: 'Hip-hop' }, { id: 160, name: 'USER1' }] } }
			}
		},
		{
			vendorIds: [0x3302, 0x0762, 0x35d8, 0x2fc6, 0x0104, 0xb445, 0x0661, 0x0666, 0x0d8c],
			manufacturer: 'WalkPlay',
			handler: walkplayUsbHID,
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
				defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
				availableSlots: [{ id: 101, name: 'Custom' }]
			},
			devices: {
				'FIIO FX17 ': { manufacturer: 'FiiO', handler: fiioUsbHID, modelConfig: { minGain: -12, maxGain: 12, maxFilters: 10, firstWritableEQSlot: 7, maxWritableEQSlots: 3, disconnectOnSave: false, disabledPresetId: 11, experimental: false, availableSlots: FIIO_DEFAULT_SLOTS } },
				'Rays': { manufacturer: 'Moondrop', handler: moondropUsbHidHandler, supportsLSHSFilters: false, supportsPregain: true },
				'EPZ TP13 AI ENC audio': { manufacturer: 'EPZ', modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
				'Marigold': { manufacturer: 'Moondrop', handler: moondropUsbHidHandler, modelConfig: { supportsLSHSFilters: false, supportsPregain: true } },
				'FreeDSP Pro': { manufacturer: 'Moondrop', handler: moondropUsbHidHandler },
				'ddHiFi DSP IEM - Memory': { manufacturer: 'Moondrop', handler: moondropUsbHidHandler },
				'Quark2': { manufacturer: 'Moondrop' },
				'ECHO-A': { manufacturer: 'Moondrop' },
				'Truthear KeyX': { manufacturer: 'Truthear', handler: walkplayUsbHID, modelConfig: { minGain: -12, maxGain: 6, maxFilters: 8, firstWritableEQSlot: -1, maxWritableEQSlots: 0, disconnectOnSave: false, disabledPresetId: -1, supportsPregain: true, supportsLSHSFilters: false, experimental: false, defaultIndex: 0x17, availableSlots: [{ id: 101, name: 'Custom' }] } },
				'Hi-MAX': { modelConfig: { experimental: false } },
				'BGVP MX1': { modelConfig: { schemeNo: 15, experimental: true } },
				'DT04': { manufacturer: 'LETSHUOER', modelConfig: { schemeNo: 15, experimental: true } },
				'MD-QT-042': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: true } },
				'MOONDROP HiFi with PD': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: true } },
				'DAWN PRO 2': { manufacturer: 'Moondrop', modelConfig: { schemeNo: 15, experimental: true } },
				'CS431XX': { modelConfig: { schemeNo: 15, experimental: true } },
				'ES9039 ': { modelConfig: { schemeNo: 15, experimental: true } },
				'TANCHJIM-STARGATE II': { manufacturer: 'Tanchim', modelConfig: { schemeNo: 15, supportsLSHSFilters: false } },
				'didiHiFi DSP Cable - Memory': { manufacturer: 'ddHifi', modelConfig: { schemeNo: 15, experimental: true } },
				'Dual CS43198': { modelConfig: { schemeNo: 15, experimental: true } },
				'ES9039 HiFi DSP Audio': { modelConfig: { schemeNo: 15, experimental: true } },
				'AE6': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
				'KM_HA03': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
				'TP35 Pro': { modelConfig: { schemeNo: 16, maxFilters: 10 } },
				'DA5': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
				'G303': { modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } },
				'HiFi DSP Audio with PD': { manufacturer: 'ddHifi', modelConfig: { schemeNo: 16, maxFilters: 10, experimental: true } }
			}
		},
		{
			vendorIds: [0x31b2],
			manufacturer: 'KT Micro',
			handler: ktmicroUsbHidHandler,
			defaultModelConfig: {
				minGain: -12,
				maxGain: 12,
				maxFilters: 5,
				firstWritableEQSlot: -1,
				maxWritableEQSlots: 0,
				compensate2X: true,
				disconnectOnSave: true,
				disabledPresetId: 0x02,
				experimental: false,
				supportsPregain: false,
				supportsLSHSFilters: true,
				defaultResetFiltersValues: [{ gain: 0, freq: 100, q: 1, filterType: 'PK' }],
				availableSlots: [{ id: 0x03, name: 'Custom' }]
			},
			devices: {
				'Kiwi Ears-Allegro PRO': { manufacturer: 'Kiwi Ears', modelConfig: { supportsLSHSFilters: false, disconnectOnSave: true } },
				'KT02H20 HIFI Audio': { manufacturer: 'JCally', modelConfig: { supportsLSHSFilters: false } },
				'TANCHJIM BUNNY DSP': { manufacturer: 'TANCHJIM', modelConfig: { compensate2X: false, supportsPregain: true } },
				'TANCHJIM FISSION': { manufacturer: 'TANCHJIM', modelConfig: { compensate2X: false, supportsPregain: true } },
				'CDSP': { manufacturer: 'Moondrop', modelConfig: { compensate2X: false } },
				'Chu2 DSP': { manufacturer: 'Moondrop', modelConfig: { compensate2X: false } }
			}
		}
	];
}

// ---------------------------------------------------------------------------
// Serial device registry
// ---------------------------------------------------------------------------

function buildSerialConfig(
	jdsLabsUsbSerial: DeviceHandler,
	nothingUsbSerial: DeviceHandler,
	fiioUsbSerial: DeviceHandler
): UsbSerialVendorConfig[] {
	return [
		{
			vendorId: 0x152a,
			manufacturer: 'JDS Labs',
			handler: jdsLabsUsbSerial,
			devices: {
				'Element IV': {
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
							{ id: 0, name: 'Headphones' },
							{ id: 1, name: 'RCA' }
						]
					}
				}
			}
		},
		{
			manufacturer: 'Nothing',
			handler: nothingUsbSerial,
			filters: {
				usbVendorId: null,
				allowedBluetoothServiceClassIds: ['aeac4a03-dff5-498f-843a-34487cf133eb'],
				bluetoothServiceClassId: 'aeac4a03-dff5-498f-843a-34487cf133eb'
			},
			devices: {
				'Nothing Headphones': {
					modelConfig: {
						minGain: -12,
						maxGain: 12,
						maxFilters: 8,
						firstWritableEQSlot: 5,
						maxWritableEQSlots: 1,
						disconnectOnSave: false,
						disabledPresetId: -1,
						experimental: true,
						readOnly: false,
						availableSlots: [
							{ id: 0, name: 'Balanced' },
							{ id: 1, name: 'Voice' },
							{ id: 2, name: 'More Treble' },
							{ id: 3, name: 'More Bass' },
							{ id: 5, name: 'Custom' }
						]
					}
				}
			}
		},
		{
			vendorId: 6790,
			manufacturer: 'FiiO',
			handler: fiioUsbSerial,
			devices: {
				'FiiO Audio DSP': {
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
							{ id: 240, name: 'BYPASS' },
							{ id: 0, name: 'Jazz' },
							{ id: 1, name: 'Pop' },
							{ id: 2, name: 'Rock' },
							{ id: 3, name: 'Dance' },
							{ id: 4, name: 'R&B' },
							{ id: 5, name: 'Classic' },
							{ id: 6, name: 'Hip Hop' },
							{ id: 8, name: 'Retro' },
							{ id: 9, name: 'De-essing-1' },
							{ id: 10, name: 'De-essing-2' },
							{ id: 160, name: 'USER1' },
							{ id: 161, name: 'USER2' },
							{ id: 162, name: 'USER3' },
							{ id: 163, name: 'USER4' },
							{ id: 164, name: 'USER5' },
							{ id: 165, name: 'USER6' },
							{ id: 166, name: 'USER7' },
							{ id: 167, name: 'USER8' },
							{ id: 168, name: 'USER9' },
							{ id: 169, name: 'USER10' }
						]
					}
				}
			}
		}
	];
}

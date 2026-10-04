/**
 * The network devices `network.ts` drives — split out so the connect form can list them without
 * loading the module that talks to them.
 */
export type NetworkDeviceType = 'WiiM' | 'LuxsinX9';

export const NETWORK_DEVICE_TYPES: { id: NetworkDeviceType; label: string }[] = [
	{ id: 'WiiM', label: 'WiiM' },
	{ id: 'LuxsinX9', label: 'Luxsin X9' }
];

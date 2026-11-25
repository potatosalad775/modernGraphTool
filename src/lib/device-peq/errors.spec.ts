import { describe, it, expect } from 'vitest';
import { BridgeError } from '@potatosalad775/eqcaps-device-bridge';
import {
	describeDeviceError,
	isConnectionLost,
	isInvalidRequest,
	isUnsupported
} from './errors.js';
import { NetworkHostError } from './network-host.js';
import { NetworkAccessError, NetworkResponseError } from './network.js';

describe('describeDeviceError', () => {
	it('explains each bridge failure in its own words', () => {
		const said = (code: ConstructorParameters<typeof BridgeError>[0]) =>
			describeDeviceError(new BridgeError(code, 'x'));
		expect(said('timeout')).toMatch(/didn't answer/);
		expect(said('transport')).toMatch(/Lost the connection/);
		expect(said('rejected')).toMatch(/refused/);
		expect(said('bad-response')).toMatch(/unexpected/);
		expect(said('unsupported')).toMatch(/doesn't support/);
		expect(said('unrepresentable')).toMatch(/can't be sent/);
		expect(said('unsupported-type')).toBe(said('unrepresentable'));
		expect(said('invalid-request')).toBe(said('unrepresentable'));
	});

	it('falls back to a generic sentence for anything else', () => {
		expect(describeDeviceError(new Error('boom'))).toMatch(/Something went wrong/);
		expect(describeDeviceError('nope')).toMatch(/Something went wrong/);
	});

	it('explains a network device the browser could not reach, and a refused address', () => {
		expect(describeDeviceError(new NetworkAccessError(new TypeError('Failed to fetch')))).toMatch(
			/couldn't reach the device/
		);
		expect(describeDeviceError(new NetworkResponseError(1))).toMatch(/unexpected/);
		expect(describeDeviceError(new NetworkHostError('public'))).toMatch(/public hostname/);
		expect(describeDeviceError(new NetworkHostError('port'))).toMatch(/1 to 65535/);
		expect(describeDeviceError(new NetworkHostError('invalid'))).toMatch(/IP address/);
	});

	it('knows a device that has no such thing right now', () => {
		expect(isUnsupported(new BridgeError('unsupported', 'x'))).toBe(true);
		expect(isUnsupported(new BridgeError('timeout', 'x'))).toBe(false);
		expect(isUnsupported(new BridgeError('unsupported-type', 'x'))).toBe(false);
		// Matched by name and code, like the rest, so a look-alike from another module counts.
		expect(
			isUnsupported(Object.assign(new Error('x'), { name: 'BridgeError', code: 'unsupported' }))
		).toBe(true);
		expect(isUnsupported(new Error('unsupported'))).toBe(false);
		expect(isUnsupported(Object.assign(new Error('x'), { code: 'unsupported' }))).toBe(false);
		expect(isUnsupported({ name: 'BridgeError', code: 'unsupported' })).toBe(false);
		expect(isUnsupported('unsupported')).toBe(false);
		expect(isUnsupported(null)).toBe(false);
	});

	it('knows a device refused a request as given, such as a name it cannot store', () => {
		expect(isInvalidRequest(new BridgeError('invalid-request', 'x'))).toBe(true);
		expect(isInvalidRequest(new BridgeError('unrepresentable', 'x'))).toBe(false);
		expect(isInvalidRequest(new BridgeError('unsupported', 'x'))).toBe(false);
		// Matched by name and code, like the rest, so a look-alike from another module counts.
		expect(
			isInvalidRequest(
				Object.assign(new Error('x'), { name: 'BridgeError', code: 'invalid-request' })
			)
		).toBe(true);
		expect(isInvalidRequest(new Error('invalid-request'))).toBe(false);
		expect(isInvalidRequest(Object.assign(new Error('x'), { code: 'invalid-request' }))).toBe(
			false
		);
		expect(isInvalidRequest({ name: 'BridgeError', code: 'invalid-request' })).toBe(false);
		expect(isInvalidRequest('invalid-request')).toBe(false);
		expect(isInvalidRequest(null)).toBe(false);
	});

	it('knows a lost transport needs a new connection', () => {
		expect(isConnectionLost(new BridgeError('transport', 'x'))).toBe(true);
		expect(isConnectionLost(new BridgeError('timeout', 'x'))).toBe(false);
	});
});

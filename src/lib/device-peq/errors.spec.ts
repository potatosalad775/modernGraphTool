import { describe, it, expect } from 'vitest';
import { BridgeError } from '@potatosalad775/eqcaps-device-bridge';
import { describeDeviceError, isConnectionLost } from './errors.js';

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

	it('knows a lost transport needs a new connection', () => {
		expect(isConnectionLost(new BridgeError('transport', 'x'))).toBe(true);
		expect(isConnectionLost(new BridgeError('timeout', 'x'))).toBe(false);
	});
});

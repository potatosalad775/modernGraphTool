import * as m from '$lib/paraglide/messages.js';

/** `BridgeError.code` values, restated so this module doesn't pull the bridge into the bundle. */
type Code =
	| 'unsupported-type'
	| 'unrepresentable'
	| 'unsupported'
	| 'timeout'
	| 'bad-response'
	| 'rejected'
	| 'transport'
	| 'invalid-request';

function codeOf(error: unknown): Code | null {
	if (error instanceof Error && error.name === 'BridgeError' && 'code' in error) {
		return (error as Error & { code: Code }).code;
	}
	return null;
}

/** The connection is gone and has to be made again. */
export function isConnectionLost(error: unknown): boolean {
	return codeOf(error) === 'transport';
}

/** A user-facing sentence for a failed device operation. */
export function describeDeviceError(error: unknown): string {
	switch (codeOf(error)) {
		case 'timeout':
			return m.device_peq_error_timeout();
		case 'transport':
			return m.device_peq_error_transport();
		case 'rejected':
			return m.device_peq_error_rejected();
		case 'bad-response':
			return m.device_peq_error_bad_response();
		case 'unsupported':
			return m.device_peq_error_unsupported();
		case 'unsupported-type':
		case 'unrepresentable':
		case 'invalid-request':
			return m.device_peq_error_unrepresentable();
		default:
			return m.device_peq_error_generic();
	}
}

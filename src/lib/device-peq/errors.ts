import * as m from '#lib/paraglide/messages.js';

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

/** The sentence for an address `network-host.ts` refuses. */
export function describeNetworkHostProblem(
	problem: 'empty' | 'invalid' | 'public' | 'port'
): string {
	switch (problem) {
		case 'public':
			return m.device_peq_network_host_public();
		case 'port':
			return m.device_peq_network_host_port();
		default:
			return m.device_peq_network_host_invalid();
	}
}

/** A user-facing sentence for a failed device operation. */
export function describeDeviceError(error: unknown): string {
	// Matched by name, like `BridgeError`, so this module doesn't pull `network.ts` into the bundle.
	if (error instanceof Error && error.name === 'NetworkAccessError') {
		return m.device_peq_error_network_blocked();
	}
	if (error instanceof Error && error.name === 'NetworkResponseError') {
		return m.device_peq_error_bad_response();
	}
	if (error instanceof Error && error.name === 'NetworkHostError' && 'problem' in error) {
		return describeNetworkHostProblem(
			error.problem as Parameters<typeof describeNetworkHostProblem>[0]
		);
	}
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

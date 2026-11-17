/**
 * The app's Trusted Types policy.
 *
 * Under `require-trusted-types-for 'script'` the browser refuses a plain string at the sinks
 * that can run code: `innerHTML`, a script's `src`, the `Worker` constructor. Each of ours goes
 * through one of the two functions here, so the places that can inject markup or load a script
 * are the callers of this file and nothing else. Svelte's own templates use its
 * `svelte-trusted-html` policy; `{@html}` assigns whatever it is given, which is why its three
 * call sites wrap their value in `trustedHtml`.
 *
 * Without Trusted Types (Firefox and Safari before 2025, or no such CSP) both functions hand
 * the string back unchanged.
 */

interface TrustedTypePolicyLike {
	createHTML(input: string): unknown;
	createScriptURL(input: string): unknown;
}

interface TrustedTypesLike {
	createPolicy(
		name: string,
		rules: {
			createHTML: (input: string) => string;
			createScriptURL: (input: string) => string;
		}
	): TrustedTypePolicyLike;
}

/** The name operators list in a `trusted-types` directive, next to `svelte-trusted-html`. */
export const POLICY_NAME = 'mgt';

let policy: TrustedTypePolicyLike | null | undefined;

function getPolicy(): TrustedTypePolicyLike | null {
	if (policy !== undefined) return policy;
	policy = null;
	const factory = (globalThis as { trustedTypes?: TrustedTypesLike }).trustedTypes;
	if (!factory) return policy;
	try {
		policy = factory.createPolicy(POLICY_NAME, {
			// Callers pass operator-authored config or the output of `sanitizeHtml`; the policy
			// marks the hand-over, it does not sanitize again.
			createHTML: (input) => input,
			createScriptURL: (input) => {
				const url = new URL(input, document.baseURI);
				if (url.protocol === 'https:' || url.protocol === 'blob:') return input;
				if (url.origin === location.origin) return input;
				// A page served over plain http has no transport to protect; refusing here
				// would only break an http-only deployment's ranking config.
				if (url.protocol === 'http:' && location.protocol === 'http:') return input;
				throw new TypeError(`Refusing to load a script from ${url.protocol} ${url.host}`);
			}
		});
	} catch (error) {
		// A `trusted-types` directive that does not list this policy. The sinks then throw on
		// their own, which is the operator's policy doing its job; say why.
		console.warn(`[trusted-types] Could not create the "${POLICY_NAME}" policy:`, error);
	}
	return policy;
}

/** For `{@html}`: operator config, or HTML that already went through `sanitizeHtml`. */
export function trustedHtml(html: string): string {
	return (getPolicy()?.createHTML(html) ?? html) as string;
}

/**
 * For a script's `src` and the `Worker` constructor: same origin, `https:` or `blob:` only
 * (plus `http:` when the page itself is served over http).
 */
export function trustedScriptUrl(url: string): string {
	return (getPolicy()?.createScriptURL(url) ?? url) as string;
}

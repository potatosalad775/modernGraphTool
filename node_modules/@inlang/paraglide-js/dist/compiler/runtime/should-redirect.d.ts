/**
 * @typedef {object} ShouldRedirectServerInput
 * @property {Request} request
 * @property {string | URL} [url]
 * @property {Locale} [locale]
 *
 * @typedef {object} ShouldRedirectClientInput
 * @property {undefined} [request]
 * @property {string | URL} [url]
 * @property {Locale} [locale]
 *
 * @typedef {ShouldRedirectServerInput | ShouldRedirectClientInput} ShouldRedirectInput
 *
 * @typedef {object} ShouldRedirectResult
 * @property {boolean} shouldRedirect - Indicates whether the consumer should perform a redirect.
 * @property {Locale} locale - Locale resolved using the configured strategies.
 * @property {URL | undefined} redirectUrl - Destination URL when a redirect is required.
 */
/**
 * Determines whether a redirect is required to align the current URL with the active locale.
 *
 * This helper mirrors the logic that powers `paraglideMiddleware`, but works in both server
 * and client environments. It evaluates the configured strategies in order, computes the
 * canonical localized URL, and reports when the current URL does not match.
 *
 * When called in the browser without arguments, the current `window.location.href` is used.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/i18n-routing#client-side-redirects
 *
 * @example
 * // Client side usage (e.g. TanStack Router beforeLoad hook)
 * async function beforeLoad({ location }) {
 *   const decision = await shouldRedirect({ url: location.href });
 *
 *   if (decision.shouldRedirect) {
 *     throw redirect({ to: decision.redirectUrl.href });
 *   }
 * }
 *
 * @example
 * // Server side usage with a Request
 * export async function handle(request) {
 *   const decision = await shouldRedirect({ request });
 *
 *   if (decision.shouldRedirect) {
 *     return Response.redirect(decision.redirectUrl, 307);
 *   }
 *
 *   return render(request, decision.locale);
 * }
 *
 * @param {ShouldRedirectInput} [input]
 * @returns {Promise<ShouldRedirectResult>}
 */
export function shouldRedirect(input?: ShouldRedirectInput): Promise<ShouldRedirectResult>;
export type ShouldRedirectServerInput = {
    request: Request;
    url?: string | URL | undefined;
    locale?: string | undefined;
};
export type ShouldRedirectClientInput = {
    request?: undefined;
    url?: string | URL | undefined;
    locale?: string | undefined;
};
export type ShouldRedirectInput = ShouldRedirectServerInput | ShouldRedirectClientInput;
export type ShouldRedirectResult = {
    /**
     * - Indicates whether the consumer should perform a redirect.
     */
    shouldRedirect: boolean;
    /**
     * - Locale resolved using the configured strategies.
     */
    locale: Locale;
    /**
     * - Destination URL when a redirect is required.
     */
    redirectUrl: URL | undefined;
};
//# sourceMappingURL=should-redirect.d.ts.map
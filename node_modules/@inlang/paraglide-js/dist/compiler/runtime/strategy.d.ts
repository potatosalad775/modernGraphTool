/**
 * Checks if the given strategy is a custom strategy.
 *
 * @param {unknown} strategy The name of the custom strategy to validate.
 * Must be a string that starts with "custom-" followed by alphanumeric characters, hyphens, or underscores.
 * @returns {boolean} Returns true if it is a custom strategy, false otherwise.
 */
export function isCustomStrategy(strategy: unknown): boolean;
/**
 * Defines a custom strategy that is executed on the server.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#write-your-own-strategy
 *
 * @param {string} strategy The name of the custom strategy to define. Must follow the pattern custom-name with alphanumeric characters, hyphens, or underscores.
 * @param {CustomServerStrategyHandler} handler The handler for the custom strategy, which should implement
 * the method getLocale.
 * @returns {void}
 */
export function defineCustomServerStrategy(strategy: string, handler: CustomServerStrategyHandler): void;
/**
 * Defines a custom strategy that is executed on the client.
 *
 * @see https://inlang.com/m/gerre34r/library-inlang-paraglideJs/strategy#write-your-own-strategy
 *
 * @param {string} strategy The name of the custom strategy to define. Must follow the pattern custom-name with alphanumeric characters, hyphens, or underscores.
 * @param {CustomClientStrategyHandler} handler The handler for the custom strategy, which should implement the
 * methods getLocale and setLocale.
 * @returns {void}
 */
export function defineCustomClientStrategy(strategy: string, handler: CustomClientStrategyHandler): void;
/**
 * @typedef {"cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage"} BuiltInStrategy
 */
/**
 * @typedef {`custom_${string}`} CustomStrategy
 */
/**
 * @typedef {BuiltInStrategy | CustomStrategy} Strategy
 */
/**
 * @typedef {Array<Strategy>} Strategies
 */
/**
 * @typedef {{ getLocale: (request?: Request) => Promise<string | undefined> | (string | undefined) }} CustomServerStrategyHandler
 */
/**
 * @typedef {{ getLocale: () => Promise<string|undefined> | (string | undefined), setLocale: (locale: string) => Promise<void> | void }} CustomClientStrategyHandler
 */
/** @type {Map<string, CustomServerStrategyHandler>} */
export const customServerStrategies: Map<string, CustomServerStrategyHandler>;
/** @type {Map<string, CustomClientStrategyHandler>} */
export const customClientStrategies: Map<string, CustomClientStrategyHandler>;
export type BuiltInStrategy = "cookie" | "baseLocale" | "globalVariable" | "url" | "preferredLanguage" | "localStorage";
export type CustomStrategy = `custom_${string}`;
export type Strategy = BuiltInStrategy | CustomStrategy;
export type Strategies = Array<Strategy>;
export type CustomServerStrategyHandler = {
    getLocale: (request?: Request) => Promise<string | undefined> | (string | undefined);
};
export type CustomClientStrategyHandler = {
    getLocale: () => Promise<string | undefined> | (string | undefined);
    setLocale: (locale: string) => Promise<void> | void;
};
//# sourceMappingURL=strategy.d.ts.map
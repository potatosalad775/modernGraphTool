/**
 * A locale that is available in the project.
 */
export type Locale = string;
/**
 * A branded type representing a localized string.
 *
 * Message functions return this type instead of \`string\`, enabling TypeScript
 * to distinguish translated strings from regular strings at compile time.
 * This allows you to enforce that only properly localized content is used
 * in your UI components.
 *
 * Since \`LocalizedString\` is a branded subtype of \`string\`, it remains fully
 * backward compatible—you can pass it anywhere a \`string\` is expected.
 */
export type LocalizedString = string & {
    readonly __brand: "LocalizedString";
};
/**
 * A single markup option passed to a tag instance.
 */
export type MessageMarkupOption = {
    name: string;
    value: unknown;
};
/**
 * A single static markup attribute attached to a tag instance.
 */
export type MessageMarkupAttribute = {
    name: string;
    value: string | true;
};
/**
 * Record of markup options for a tag instance.
 */
export type MessageMarkupOptions = Record<string, unknown>;
/**
 * Record of markup attributes for a tag instance.
 */
export type MessageMarkupAttributes = Record<string, string | true>;
/**
 * Type-level schema for a single markup tag.
 */
export type MessageMarkupTag = {
    options: MessageMarkupOptions;
    attributes: MessageMarkupAttributes;
    children: boolean;
};
/**
 * Type-level schema for all markup tags in a message.
 */
export type MessageMarkupSchema = Record<string, MessageMarkupTag>;
/**
 * Type-only metadata attached to compiled message functions.
 */
export type MessageMetadata<Inputs, Options, Markup extends MessageMarkupSchema = MessageMarkupSchema> = {
    readonly __paraglide?: {
        inputs: Inputs;
        options: Options;
        markup: Markup;
    };
};
/**
 * A compiled, framework-neutral message part.
 */
export type MessagePart = {
    type: "text";
    value: string;
} | {
    type: "markup-start";
    name: string;
    options: MessageMarkupOptions;
    attributes: MessageMarkupAttributes;
} | {
    type: "markup-end";
    name: string;
    options: MessageMarkupOptions;
    attributes: MessageMarkupAttributes;
} | {
    type: "markup-standalone";
    name: string;
    options: MessageMarkupOptions;
    attributes: MessageMarkupAttributes;
};
/**
 * A message function is a message for a specific locale.
 */
export type MessageFunction = (inputs?: Record<string, never>) => LocalizedString;
/**
 * A message bundle function that selects the message to be returned.
 *
 * Uses `getLocale()` under the hood to determine the locale with an option.
 */
export type MessageBundleFunction<T extends string> = (params: Record<string, never>, options: {
    locale: T;
}) => LocalizedString;
//# sourceMappingURL=type-definitions.d.ts.map
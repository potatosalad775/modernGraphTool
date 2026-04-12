import { compileInputAccess } from "./variable-access.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";
/**
 * Compiles a local variable.
 *
 * @example
 *   const code = compileLocalVariable({
 *    type: "local-variable",
 *    name: "myVar",
 *    value: { type: "literal", value: "Hello" }
 *   });
 *   >> code === "const myVar = 'Hello';"
 */
export function compileLocalVariable(args) {
    const annotation = args.declaration.value.annotation;
    const value = compileAnnotation(compileLiteralOrVarRef(args.declaration.value.arg), args.locale, annotation);
    return `const ${args.declaration.name} = ${value};`;
}
function compileAnnotation(str, locale, annotation) {
    if (!annotation) {
        return str;
    }
    return `registry.${annotation.name}("${locale}", ${str}, ${compileOptions(annotation.name, annotation.options)})`;
}
function compileOptions(annotationName, options) {
    if (options.length === 0) {
        return "{}";
    }
    const entries = options.map((option) => `${option.name}: ${compileOptionLiteralOrVarRef(annotationName, option.name, option.value)}`);
    const code = "{ " + entries.join(", ") + " }";
    return code;
}
const numericOptionNamesByAnnotation = {
    number: new Set([
        "minimumIntegerDigits",
        "minimumFractionDigits",
        "maximumFractionDigits",
        "minimumSignificantDigits",
        "maximumSignificantDigits",
        "roundingIncrement",
    ]),
    plural: new Set([
        "minimumIntegerDigits",
        "minimumFractionDigits",
        "maximumFractionDigits",
        "minimumSignificantDigits",
        "maximumSignificantDigits",
    ]),
    datetime: new Set(["fractionalSecondDigits"]),
};
const booleanOptionNamesByAnnotation = {
    number: new Set(["useGrouping"]),
    datetime: new Set(["hour12"]),
};
const jsNonNegativeIntegerPattern = /^(?:0|[1-9]\d*)$/;
function compileOptionLiteralOrVarRef(annotationName, optionName, value) {
    if (value.type === "variable-reference") {
        return compileInputAccess(value.name);
    }
    if (shouldEmitNumberLiteral(annotationName, optionName, value.value)) {
        return value.value;
    }
    if (shouldEmitBooleanLiteral(annotationName, optionName, value.value)) {
        return value.value;
    }
    return `"${escapeForDoubleQuoteString(value.value)}"`;
}
function shouldEmitNumberLiteral(annotationName, optionName, literal) {
    return (numericOptionNamesByAnnotation[annotationName]?.has(optionName) === true &&
        jsNonNegativeIntegerPattern.test(literal));
}
function shouldEmitBooleanLiteral(annotationName, optionName, literal) {
    return (booleanOptionNamesByAnnotation[annotationName]?.has(optionName) === true &&
        (literal === "true" || literal === "false"));
}
function compileLiteralOrVarRef(value) {
    switch (value.type) {
        case "literal":
            return `"${escapeForDoubleQuoteString(value.value)}"`;
        case "variable-reference":
            return compileInputAccess(value.name);
    }
}
//# sourceMappingURL=compile-local-variable.js.map
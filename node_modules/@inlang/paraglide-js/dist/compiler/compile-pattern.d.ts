import type { Declaration, Pattern } from "@inlang/sdk";
import type { Compiled } from "./types.js";
export type CompilePatternMode = "string" | "parts";
/**
 * Compiles a pattern into either a template literal string or parts array.
 *
 * @example
 *   const pattern: Pattern = [
 * 	 { type: "text", value: "Your age is " },
 * 	 { type: "expression", arg: { type: "variable-reference", name: "age" } },
 *   ]
 *
 *   const { code } = compilePattern({ pattern, declarations: [{ type: "input-variable", name: "age" }] });
 *
 *   // code will be: `Your age is ${i?.age}`
 */
export declare const compilePattern: (args: {
    pattern: Pattern;
    declarations: Declaration[];
    mode?: CompilePatternMode;
}) => Compiled<Pattern>;
//# sourceMappingURL=compile-pattern.d.ts.map
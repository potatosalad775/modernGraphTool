import type nodeFs from "node:fs/promises";
export declare function writeOutput(args: {
    directory: string;
    output: Record<string, string>;
    cleanDirectory?: boolean;
    fs: typeof nodeFs;
    previousOutputHashes?: Record<string, string>;
}): Promise<Record<string, string>>;
//# sourceMappingURL=write-output.d.ts.map
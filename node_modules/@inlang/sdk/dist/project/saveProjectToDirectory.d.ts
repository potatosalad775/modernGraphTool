import type fs from "node:fs/promises";
import type { InlangProject } from "./api.js";
/**
 * Saves a project to a directory.
 *
 * Writes all project files to disk and runs exporters to generate
 * resource files (e.g., JSON translation files).
 *
 * @example
 *   await saveProjectToDirectory({
 *     fs: await import("node:fs/promises"),
 *     project,
 *     path: "./project.inlang",
 *   });
 */
export declare function saveProjectToDirectory(args: {
    /**
     * The file system module to use for writing files.
     */
    fs: typeof fs;
    /**
     * The inlang project to save.
     */
    project: InlangProject;
    /**
     * The path to the inlang project directory. Must end with `.inlang`.
     */
    path: string;
    /**
     * If `true`, skips running exporters and only writes internal project files.
     *
     * Useful when you only want to update project metadata without
     * regenerating resource files.
     */
    skipExporting?: boolean;
}): Promise<void>;
//# sourceMappingURL=saveProjectToDirectory.d.ts.map
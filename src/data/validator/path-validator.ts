/**
 * Path validation using statSync/existsSync + isFile().
 * Distinguishes: file missing, permission denied, path is directory.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { ConfigurationError, PortoErrorCode } from "../../errors";

/**
 * Ensure path exists and is a regular file. Throws with specific error.
 */
export function ensurePathIsFile(dataPath: string, relativePath: string): void {
    const absolutePath = join(dataPath, relativePath);
    if (!existsSync(absolutePath)) {
        throw new ConfigurationError(
            `Required porto-data path not found: '${relativePath}'.`,
            PortoErrorCode.PORTO_DATA_NOT_FOUND,
            500,
        );
    }
    try {
        const stat = statSync(absolutePath);
        if (!stat.isFile()) {
            throw new ConfigurationError(
                `Porto-data path is a directory, not a file: '${relativePath}'.`,
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                500,
            );
        }
    } catch (err) {
        if (err instanceof ConfigurationError) throw err;
        const msg =
            err instanceof Error &&
            "code" in err &&
            (err as NodeJS.ErrnoException).code === "EACCES"
                ? `Permission denied reading porto-data path: '${relativePath}'.`
                : `Required porto-data path not found: '${relativePath}'.`;
        throw new ConfigurationError(msg, PortoErrorCode.PORTO_DATA_NOT_FOUND, 500);
    }
}

/**
 * Shared porto-data root resolution for build scripts and tests.
 * Order: PORTO_DATA_PATH (explicit override) → installed @gruncellka/porto-data.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * @param {unknown} err
 * @param {string} name
 */
function isMissingPackage(err, name) {
    const code = err?.code;
    if (code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND") {
        return false;
    }
    return String(err?.message ?? "").includes(name);
}

/**
 * @param {object} [options]
 * @param {string} [options.marker] Relative path that must exist under the data root
 * @param {string} [options.label] Error context label
 */
export function resolvePortoDataRoot(options = {}) {
    const marker = options.marker ?? "metadata.json";
    const label = options.label ?? "resolve-porto-data-root";

    const envPath = process.env.PORTO_DATA_PATH?.trim();
    if (envPath) {
        if (existsSync(join(envPath, marker))) {
            return envPath;
        }
        throw new Error(
            `${label}: PORTO_DATA_PATH=${envPath} is set but is not a porto-data catalog root (missing ${marker}).`,
        );
    }

    let entry;
    try {
        const require = createRequire(import.meta.url);
        entry = require.resolve("@gruncellka/porto-data");
    } catch (err) {
        if (!isMissingPackage(err, "@gruncellka/porto-data")) {
            throw err;
        }
        throw new Error(
            `${label}: porto-data package not found (marker ${marker}). Install @gruncellka/porto-data or set PORTO_DATA_PATH.`,
        );
    }

    const packageRoot = dirname(entry);
    for (const candidate of [join(packageRoot, "porto_data"), packageRoot]) {
        if (existsSync(join(candidate, marker))) {
            return candidate;
        }
    }

    throw new Error(
        `${label}: installed @gruncellka/porto-data does not contain ${marker}. Set PORTO_DATA_PATH if using a custom tree.`,
    );
}

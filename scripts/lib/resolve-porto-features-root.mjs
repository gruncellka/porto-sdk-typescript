/**
 * Shared porto-features root resolution for BDD batch runner and tests.
 * Returns the porto_features directory (contains features/ and fixtures/).
 *
 * Order: PORTO_FEATURES_PATH (explicit override) → installed @gruncellka/porto-features.
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

export function resolvePortoFeaturesRoot() {
    const envPath = process.env.PORTO_FEATURES_PATH?.trim();
    if (envPath) {
        if (existsSync(join(envPath, "features"))) {
            return envPath;
        }
        throw new Error(
            `PORTO_FEATURES_PATH=${envPath} is set but is not a porto-features root (missing features/).`,
        );
    }

    let entry;
    try {
        const require = createRequire(import.meta.url);
        entry = require.resolve("@gruncellka/porto-features");
    } catch (err) {
        if (!isMissingPackage(err, "@gruncellka/porto-features")) {
            throw err;
        }
        throw new Error(
            "porto-features package not found. Install @gruncellka/porto-features or set PORTO_FEATURES_PATH.",
        );
    }

    const packageRoot = dirname(entry);
    for (const candidate of [join(packageRoot, "porto_features"), packageRoot]) {
        if (existsSync(join(candidate, "features"))) {
            return candidate;
        }
    }

    throw new Error(
        "installed @gruncellka/porto-features does not contain features/. Set PORTO_FEATURES_PATH if using a custom tree.",
    );
}

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePortoDataRoot } from "../../scripts/lib/resolve-porto-data-root.mjs";

const sdkRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const labCatalogRoot = resolve(sdkRoot, "../../resources/porto-data/porto_data");

/** Installed `@gruncellka/porto-data`, local checkout, or explicit `PORTO_DATA_PATH`. */
export function resolvePortoDataPathForTests(): string {
    const envPath = process.env.PORTO_DATA_PATH?.trim();
    if (envPath) {
        return resolvePortoDataRoot({
            marker: "metadata.json",
            label: "porto-data-path",
        });
    }
    if (existsSync(join(labCatalogRoot, "metadata.json"))) {
        return labCatalogRoot;
    }
    return resolvePortoDataRoot({
        marker: "metadata.json",
        label: "porto-data-path",
    });
}

/** Local catalog identity work can leave checksums stale; tests load data, not integrity. */
export const testLoaderOptions = {
    verifyChecksums: false,
    strictMode: false,
} as const;

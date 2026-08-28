/**
 * Test/dev helper: load porto-data JSON for BrowserPortoClient.embeddedFiles.
 * Not part of the published SDK catalog — reads the installed @gruncellka/porto-data package.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { dirname } from "node:path";

const EMBED_PATHS = [
    "mappings.json",
    "providers.json",
    "policy/markets.json",
    "formats/envelopes.json",
    "formats/layouts.json",
    "formats/addresses.json",
];

function resolveDataRoot(): string {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@gruncellka/porto-data");
    const packageRoot = dirname(entry);
    for (const candidate of [join(packageRoot, "porto_data"), packageRoot]) {
        try {
            readFileSync(join(candidate, "formats/envelopes.json"), "utf-8");
            return candidate;
        } catch {
            // try next
        }
    }
    throw new Error("porto-data envelopes not found in installed package");
}

export function loadEmbeddedPortoDataFiles(
    provider = "deutschepost",
): Record<string, Record<string, unknown>> {
    const dataRoot = resolveDataRoot();
    const providerPaths = [
        `providers/${provider}/graph.json`,
        `providers/${provider}/products.json`,
        `providers/${provider}/zones.json`,
        `providers/${provider}/weights.json`,
        `providers/${provider}/prices/products.json`,
        `providers/${provider}/marks.json`,
        `providers/${provider}/features.json`,
        `providers/${provider}/services.json`,
        `providers/${provider}/execution.json`,
    ];
    const files: Record<string, Record<string, unknown>> = {};
    for (const relativePath of [...EMBED_PATHS, ...providerPaths]) {
        try {
            files[relativePath] = JSON.parse(readFileSync(join(dataRoot, relativePath), "utf-8"));
        } catch {
            // optional
        }
    }
    if (!files["formats/envelopes.json"]) {
        throw new Error(`missing envelopes in porto-data at ${dataRoot}`);
    }
    return files;
}

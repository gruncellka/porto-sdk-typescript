/**
 * Porto Data Registry - Central porto-data discovery, validation, and loading
 *
 * All porto-data file access is centralized here. Config stays pure.
 * Registry is the single source of truth for porto-data.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { PortoConfig } from "../config.js";
import { DEFAULT_PROVIDER, normalizePortoConfig, normalizeProviderId } from "../config.js";
import { PortoDataLoader } from "./loader.js";

/** Public catalog discovery error — no install-command hints. */
export const PORTO_DATA_CATALOG_UNRESOLVED =
    "Porto data catalog could not be resolved.\n\n" +
    "Install the porto-data package or provide an explicit dataPath / PORTO_DATA_PATH override.";

function isMissingPackage(err: unknown, name: string): boolean {
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    if (code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND") {
        return false;
    }
    return String(err && typeof err === "object" && "message" in err ? err.message : "").includes(
        name,
    );
}

/**
 * Find porto-data catalog root from the installed `@gruncellka/porto-data` package.
 * Override via PortoConfig.dataPath / PORTO_DATA_PATH. Catalog is never copied into the SDK.
 */
export function findPortoDataPath(): string {
    const require = createRequire(import.meta.url);
    let entry: string;
    try {
        entry = require.resolve("@gruncellka/porto-data");
    } catch (err) {
        if (!isMissingPackage(err, "@gruncellka/porto-data")) {
            throw err;
        }
        throw new Error(PORTO_DATA_CATALOG_UNRESOLVED);
    }
    const packageRoot = dirname(entry);
    const candidates = [join(packageRoot, "porto_data"), packageRoot];

    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        const hasMappings = existsSync(join(candidate, "mappings.json"));
        const hasData = existsSync(join(candidate, "data"));
        const hasProviders = existsSync(join(candidate, "providers"));
        const hasGlobal = existsSync(join(candidate, "global"));
        if (hasMappings || hasData || (hasProviders && hasGlobal)) {
            return candidate;
        }
    }

    throw new Error(PORTO_DATA_CATALOG_UNRESOLVED);
}

/**
 * Load valid provider ids from porto-data mappings.json.
 */
export function getValidProvidersFromMappings(dataPath: string): Set<string> {
    const mappingsPath = join(dataPath, "mappings.json");
    if (!existsSync(mappingsPath)) return new Set();
    try {
        const data = JSON.parse(readFileSync(mappingsPath, "utf-8"));
        const raw = data?.mappings ?? data;
        const providers = raw?.providers ?? {};
        if (typeof providers !== "object") return new Set();
        return new Set(Object.keys(providers).filter((k): k is string => typeof k === "string"));
    } catch {
        return new Set();
    }
}

/**
 * Validate provider exists in porto-data mappings.
 * Returns normalized provider id or throws.
 */
export function validateProvider(provider: string | undefined, dataPath: string): string {
    const p = normalizeProviderId(provider ?? DEFAULT_PROVIDER);
    const validProviders = getValidProvidersFromMappings(dataPath);
    if (validProviders.size > 0 && !validProviders.has(p)) {
        throw new Error(
            `Invalid provider '${provider}'. Must be one of: ${[...validProviders].sort().join(", ")}. ` +
                `(from porto-data mappings at ${dataPath})`,
        );
    }
    return p;
}

export function getValidProvidersFromEmbedded(
    embedded: Record<string, Record<string, unknown>>,
): Set<string> {
    const mappingsPayload = embedded["mappings.json"];
    if (!mappingsPayload) return new Set();
    const raw = (mappingsPayload.mappings ?? mappingsPayload) as Record<string, unknown>;
    const providers = raw.providers ?? {};
    if (typeof providers !== "object" || providers === null) return new Set();
    return new Set(Object.keys(providers).filter((k): k is string => typeof k === "string"));
}

export function validateProviderFromEmbedded(
    provider: string | undefined,
    embedded: Record<string, Record<string, unknown>>,
): string {
    const p = normalizeProviderId(provider ?? DEFAULT_PROVIDER);
    const valid = getValidProvidersFromEmbedded(embedded);
    if (valid.size > 0 && !valid.has(p)) {
        throw new Error(
            `Invalid provider '${provider}'. Must be one of: ${[...valid].sort().join(", ")}.`,
        );
    }
    return p;
}

/**
 * Central porto-data registry: discovery, validation, loading.
 */
export class PortoDataRegistry {
    private _dataPath = "";
    private _providerId = "";
    private _loader: PortoDataLoader | null = null;

    constructor(private readonly config: PortoConfig) {}

    get dataPath(): string {
        if (!this._dataPath) {
            const path = this.config.data?.trim();
            if (path) {
                this._dataPath = path;
            } else if (
                this.config.embeddedFiles &&
                Object.keys(this.config.embeddedFiles).length > 0
            ) {
                // Browser / embedded catalog — never resolve @gruncellka/porto-data via createRequire.
                this._dataPath = ":embedded:";
            } else {
                this._dataPath = findPortoDataPath();
            }
        }
        return this._dataPath;
    }

    get providerId(): string {
        if (!this._providerId) {
            const embedded = this.config.embeddedFiles;
            if (embedded && Object.keys(embedded).length > 0) {
                this._providerId = validateProviderFromEmbedded(
                    normalizePortoConfig(this.config).defaultProvider,
                    embedded,
                );
            } else {
                this._providerId = validateProvider(
                    normalizePortoConfig(this.config).defaultProvider,
                    this.dataPath,
                );
            }
        }
        return this._providerId;
    }

    get loader(): PortoDataLoader {
        if (!this._loader) {
            const embedded = this.config.embeddedFiles;
            if (embedded && Object.keys(embedded).length > 0) {
                this._loader = PortoDataLoader.fromEmbedded(embedded, {
                    provider: this.providerId,
                });
            } else {
                this._loader = new PortoDataLoader(this.dataPath, {
                    provider: this.providerId,
                    strictMode: this.config.strictDataValidation !== false,
                    verifyChecksums: this.config.strictDataValidation !== false,
                });
            }
        }
        return this._loader;
    }

    loaderFor(providerId: string): PortoDataLoader {
        const embedded = this.config.embeddedFiles;
        if (embedded && Object.keys(embedded).length > 0) {
            const pid = validateProviderFromEmbedded(providerId, embedded);
            return PortoDataLoader.fromEmbedded(embedded, { provider: pid });
        }
        const pid = validateProvider(providerId, this.dataPath);
        return new PortoDataLoader(this.dataPath, {
            provider: pid,
            strictMode: this.config.strictDataValidation !== false,
            verifyChecksums: this.config.strictDataValidation !== false,
        });
    }
}

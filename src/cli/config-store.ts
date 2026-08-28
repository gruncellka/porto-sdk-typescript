/**
 * CLI config store. CLI-only. Not used by core SDK.
 *
 * Provider-scoped shape:
 *   default_provider
 *   providers.<provider>.wires.<wire>
 *
 * Precedence (highest → lowest): CLI flags → ~/.porto/config.json → env → SDK defaults
 *
 * Defaults live here only; never in commands, helpers, or adapters.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PortoConfig } from "../config.js";
import { loadPortoConfigFromEnv } from "../config.js";

/** Single source for default provider. No defaults in commands/helpers/adapters. */
export const DEFAULT_PROVIDER = "deutschepost";

const CONFIG_PATH = join(process.env.HOME || "", ".porto", "config.json");

export function getConfigPath(): string {
    return CONFIG_PATH;
}

export function configExists(): boolean {
    return existsSync(CONFIG_PATH);
}

/** Canonical config file shape */
interface ConfigFileShape {
    default_provider?: string;
    providers?: Record<
        string,
        { wires?: Record<string, { baseUrl?: string; credentials?: Record<string, string> }> }
    >;
}

/** Read and parse config file, return canonical shape */
function readConfigFile(): ConfigFileShape {
    if (!existsSync(CONFIG_PATH)) {
        return { default_provider: DEFAULT_PROVIDER, providers: {} };
    }
    try {
        const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
        return {
            default_provider: raw.default_provider
                ? String(raw.default_provider).trim().toLowerCase()
                : DEFAULT_PROVIDER,
            providers: (raw.providers as ConfigFileShape["providers"]) ?? {},
        };
    } catch {
        return { default_provider: DEFAULT_PROVIDER, providers: {} };
    }
}

/** Flatten provider wires to PortoConfig.wires for the given provider */
function flattenForProvider(
    file: ConfigFileShape,
    providerId: string,
): Record<string, { baseUrl?: string; credentials?: Record<string, string> }> {
    const provider = providerId.trim().toLowerCase();
    const prov = file.providers?.[provider]?.wires;
    if (!prov) return {};
    const result: Record<string, { baseUrl?: string; credentials?: Record<string, string> }> = {};
    for (const [id, val] of Object.entries(prov)) {
        result[id] = {
            baseUrl: val.baseUrl,
            credentials: val.credentials ? { ...val.credentials } : undefined,
        };
    }
    return result;
}

/**
 * Load config for CLI. Precedence: env (base) → file overlay → CLI flags (override).
 */
export function loadConfig(providerOverride?: string): PortoConfig {
    const config = loadPortoConfigFromEnv();
    const file = readConfigFile();

    const provider = (
        providerOverride?.trim() ??
        (typeof file.default_provider === "string" ? file.default_provider : undefined) ??
        Object.keys(config.providers ?? {})[0] ??
        DEFAULT_PROVIDER
    )
        .trim()
        .toLowerCase();
    config.providers = {
        ...(config.providers ?? {}),
        [provider]: config.providers?.[provider] ?? {},
    };

    if (file.providers?.[provider]?.wires) {
        config.providers = {
            ...(config.providers ?? {}),
            [provider]: { wires: flattenForProvider(file, provider) },
        };
    }

    // data_path lives at the top level of the CLI config file, outside `providers`
    const raw = existsSync(CONFIG_PATH)
        ? (() => {
              try {
                  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
              } catch {
                  return {};
              }
          })()
        : {};
    if (raw.data_path) config.data = String(raw.data_path).trim();

    return config;
}

/**
 * Save wire config for a provider. Explicit, provider-scoped API.
 */
export function saveProviderWire(
    providerId: string,
    wireId: string,
    payload: { baseUrl?: string; credentials?: Record<string, string> },
): void {
    mkdirSync(join(process.env.HOME || "", ".porto"), { recursive: true });
    const file = readConfigFile();
    if (!file.providers) file.providers = {};
    const provider = providerId.trim().toLowerCase();
    if (!file.providers[provider]) file.providers[provider] = { wires: {} };
    if (!file.providers[provider].wires) file.providers[provider].wires = {};

    const baseUrl = payload.baseUrl ? String(payload.baseUrl).replace(/\/+$/, "") : undefined;
    const credentials: Record<string, string> = {};
    if (payload.credentials && typeof payload.credentials === "object") {
        for (const [k, v] of Object.entries(payload.credentials)) {
            if (v != null && typeof v === "string") credentials[k] = v;
        }
    }
    file.providers[provider].wires![wireId] = { baseUrl, credentials };

    const toWrite: Record<string, unknown> = {
        default_provider: file.default_provider ?? DEFAULT_PROVIDER,
        providers: file.providers,
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(toWrite, null, 2));
}

/**
 * Get wire config for a provider. Generic getter.
 * CLI must use this API; never read cfg.wires.* directly.
 */
export function getProviderWire(
    providerId: string,
    wireId: string,
): { baseUrl?: string; credentials?: Record<string, string> } | null {
    const file = readConfigFile();
    const provider = providerId.trim().toLowerCase();
    const wire = wireId.trim().toLowerCase();
    const config = file.providers?.[provider]?.wires?.[wire];
    if (!config) return null;
    return {
        baseUrl: config.baseUrl,
        credentials: config.credentials ? { ...config.credentials } : undefined,
    };
}

/**
 * List wire ids for a provider. CLI uses this instead of cfg.wires.
 */
export function listProviderWireIds(providerId: string): string[] {
    const file = readConfigFile();
    const provider = providerId.trim().toLowerCase();
    const wires = file.providers?.[provider]?.wires;
    if (!wires || typeof wires !== "object") return [];
    return Object.keys(wires);
}

/**
 * Config check summary. CLI uses this API; never reads config directly.
 */
export function getConfigCheckSummary(providerOverride?: string): {
    provider: string;
    data: string | null;
    timeout: number;
    retries: number;
    hasAuth: boolean;
    wires: string[];
} {
    const config = loadConfig(providerOverride);
    const provider =
        Object.keys(config.providers ?? {})[0]
            ?.trim()
            ?.toLowerCase() ?? DEFAULT_PROVIDER;
    const wires = listProviderWireIds(provider);
    let hasAuth = false;
    for (const id of wires) {
        const cfg = getProviderWire(provider, id);
        if (cfg?.credentials && Object.keys(cfg.credentials).length > 0) {
            hasAuth = true;
            break;
        }
    }
    return {
        provider,
        data: config.data ?? null,
        timeout: config.transport?.timeout ?? 30,
        retries: config.transport?.retries ?? 3,
        hasAuth,
        wires,
    };
}

/**
 * Clear wire config for a provider.
 */
export function clearProviderWire(providerId: string, wireId: string): boolean {
    if (!existsSync(CONFIG_PATH)) return false;
    const file = readConfigFile();
    const provider = providerId.trim().toLowerCase();
    const wires = file.providers?.[provider]?.wires;
    if (!wires || !(wireId in wires)) return false;
    delete wires[wireId];
    const toWrite: Record<string, unknown> = {
        default_provider: file.default_provider ?? DEFAULT_PROVIDER,
        providers: file.providers ?? {},
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(toWrite, null, 2));
    return true;
}

/**
 * Create config file with minimal structure. No credentials, no provider-specific defaults.
 */
export function initConfig(force = false): { created: boolean; path: string } {
    const dir = join(process.env.HOME || "", ".porto");
    const path = join(dir, "config.json");
    if (existsSync(path) && !force) {
        return { created: false, path };
    }
    mkdirSync(dir, { recursive: true });
    const minimal: ConfigFileShape = {
        default_provider: DEFAULT_PROVIDER,
        providers: {},
    };
    writeFileSync(path, JSON.stringify(minimal, null, 2));
    return { created: true, path };
}

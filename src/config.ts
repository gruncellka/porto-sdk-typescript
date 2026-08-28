/**
 * Configuration interface for Porto SDK
 *
 * Integration-agnostic. No provider/wire specifics.
 * Provider/wire bootstrap lives in adapter layer.
 *
 * PortoConfig is user/env input. Downstream runtime uses NormalizedPortoConfig only.
 */

import { providerId } from "./ids.js";
import { type Seconds, seconds } from "./time.js";

/** Internal catalog bootstrap id. Not a root barrel export and not a PortoConfig field. */
export const DEFAULT_PROVIDER = "deutschepost";

export function normalizeProviderId(providerIdValue: string): import("./ids.js").ProviderId {
    return providerId(providerIdValue);
}

export interface CacheConfig {
    enabled: boolean;
    /** Time-to-live in seconds. */
    ttl: Seconds | number;
    maxSize: number;
}

/**
 * Generic wire config. Adapter bootstrap populates this.
 */
export interface WireConfig {
    baseUrl?: string;
    credentials?: Record<string, string>;
}

/** HTTP transport policy. Timeouts and backoff are seconds. */
export interface TransportConfig {
    timeout?: Seconds | number;
    retries?: number;
    backoff?: Seconds | number;
}

export const DEFAULT_TRANSPORT = {
    timeout: seconds(30),
    retries: 3,
    backoff: seconds(0.1),
} as const;

export const DEFAULT_CACHE = {
    enabled: true,
    ttl: seconds(300),
    maxSize: 1000,
} as const;

/** Per-provider execution context: wires and auth for one carrier. */
export interface ProviderRuntimeConfig {
    wires?: Record<string, WireConfig>;
}

/**
 * Porto SDK Configuration — wire-agnostic registry root (user/env input).
 *
 * Canonical shape: providers[id].wires, data, cache, transport.
 * There is no defaultProvider field — `client.provider(id)` is always explicit.
 */
export interface PortoConfig {
    /** Per-provider execution configs (wires, auth). */
    providers?: Record<string, ProviderRuntimeConfig>;

    /** Path to porto-data directory. If omitted, registry discovers from package. */
    data?: string;

    /**
     * Pre-loaded porto-data payloads (browser bundle). SDK-internal; apps use PortoClient only.
     * Keys are relative paths such as `formats/envelopes.json`.
     */
    embeddedFiles?: Record<string, Record<string, unknown>>;

    cache?: Partial<CacheConfig>;
    transport?: TransportConfig;
    /** When false, skip catalog schema/checksum validation (tests / catalog WIP). Default true. */
    strictDataValidation?: boolean;
}

export interface NormalizedTransportConfig {
    timeout: Seconds;
    retries: number;
    backoff: Seconds;
}

export interface NormalizedCacheConfig {
    enabled: boolean;
    ttl: Seconds;
    maxSize: number;
}

export interface NormalizedPortoConfig {
    defaultProvider: string;
    providers: Record<string, ProviderRuntimeConfig>;
    /** Present overlay keys, or null when ``providers`` was omitted (all catalog ids bindable). */
    allowlist: Set<string> | null;
    data?: string;
    embeddedFiles?: Record<string, Record<string, unknown>>;
    cache: NormalizedCacheConfig;
    transport: NormalizedTransportConfig;
    strictDataValidation: boolean;
}

export function resolveTransport(config: PortoConfig): NormalizedTransportConfig {
    return {
        timeout: seconds(Number(config.transport?.timeout ?? DEFAULT_TRANSPORT.timeout)),
        retries: config.transport?.retries ?? DEFAULT_TRANSPORT.retries,
        backoff: seconds(Number(config.transport?.backoff ?? DEFAULT_TRANSPORT.backoff)),
    };
}

export function normalizePortoConfig(config: PortoConfig): NormalizedPortoConfig {
    const specified = config.providers !== undefined;
    const providers = specified
        ? Object.fromEntries(
              Object.entries(config.providers ?? {}).map(([id, runtime]) => [
                  normalizeProviderId(id),
                  runtime,
              ]),
          )
        : {};
    const ids = Object.keys(providers).sort();
    const catalogProvider = ids[0] ?? DEFAULT_PROVIDER;

    return {
        defaultProvider: catalogProvider,
        providers,
        allowlist: specified ? new Set(ids) : null,
        data: config.data,
        embeddedFiles: config.embeddedFiles,
        strictDataValidation: config.strictDataValidation !== false,
        cache: {
            enabled: config.cache?.enabled ?? DEFAULT_CACHE.enabled,
            ttl: seconds(Number(config.cache?.ttl ?? DEFAULT_CACHE.ttl)),
            maxSize: config.cache?.maxSize ?? DEFAULT_CACHE.maxSize,
        },
        transport: resolveTransport(config),
    };
}

export function configuredProviderIds(config: PortoConfig): Set<string> {
    return new Set(Object.keys(normalizePortoConfig(config).providers));
}

export function runtimeFor(config: PortoConfig, providerIdValue: string): ProviderRuntimeConfig {
    const normalized = normalizePortoConfig(config);
    const pid = normalizeProviderId(providerIdValue);
    return normalized.providers[pid] ?? {};
}

export function wiresFor(
    config: PortoConfig,
    providerIdValue: string,
): Record<string, WireConfig> | undefined {
    return runtimeFor(config, providerIdValue).wires;
}

function readEnv(name: string): string | undefined {
    if (typeof process === "undefined" || !process.env) {
        return undefined;
    }
    return process.env[name];
}

/**
 * Load generic config from env. Aliases consumed once here.
 * Node/Python loaders only — not used by the browser bundle.
 */
export function loadPortoConfigFromEnv(): PortoConfig {
    const cfg: PortoConfig = {};
    const provider = readEnv("PORTO_PROVIDER");
    if (provider) {
        cfg.providers = { [normalizeProviderId(provider)]: {} };
    }
    const data = readEnv("PORTO_DATA_PATH");
    if (data) {
        cfg.data = data.trim();
    }
    const transport: TransportConfig = {};
    const timeout = readEnv("PORTO_TIMEOUT");
    if (timeout) {
        transport.timeout = Number(timeout);
    }
    const retries = readEnv("PORTO_RETRIES");
    if (retries) {
        transport.retries = Number(retries);
    }
    if (transport.timeout !== undefined || transport.retries !== undefined) {
        cfg.transport = transport;
    }
    return cfg;
}

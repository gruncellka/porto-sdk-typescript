/**
 * CLI bootstrap layer.
 * Single entry point: env + file + flags merge → { config, provider, wire }.
 * All commands receive this; no direct config loading in commands.
 */

import type { PortoConfig } from "../config.js";
import { loadConfig } from "./config-store.js";
import { getDefaultWire } from "./integrations/registry.js";

export interface BootstrapResult {
    config: PortoConfig;
    provider: string;
    wire: string;
}

/**
 * Single bootstrap entry point. Loads config (env + file + flags merge),
 * resolves provider/wire. All commands receive this object.
 */
export function bootstrap(opts?: Record<string, unknown>): BootstrapResult {
    const providerOverride = (opts?.provider as string)?.trim()?.toLowerCase();
    const config = loadConfig(providerOverride);
    const provider = (providerOverride ?? Object.keys(config.providers ?? {})[0])
        ?.trim()
        ?.toLowerCase();
    const wire =
        (opts?.wire as string)?.trim()?.toLowerCase() ??
        (provider ? getDefaultWire(provider) : "default");
    if (!provider) {
        throw new Error(
            "Provider could not be resolved. Set PORTO_PROVIDER, use --provider, or configure providers in ~/.porto/config.json",
        );
    }
    return { config, provider, wire };
}

/**
 * Resolve provider and wire from opts and already-loaded config.
 * Used when caller has config (e.g. from bootstrap).
 */
export function resolveProviderAndWire(
    opts: Record<string, unknown>,
    config: PortoConfig,
): { provider: string; wire: string } {
    const provider =
        (opts.provider as string)?.trim()?.toLowerCase() ?? Object.keys(config.providers ?? {})[0];
    const wire =
        (opts.wire as string)?.trim()?.toLowerCase() ??
        (provider ? getDefaultWire(provider) : "default");
    if (!provider) {
        throw new Error(
            "Provider could not be resolved. Set PORTO_PROVIDER, use --provider, or configure default_provider in ~/.porto/config.json",
        );
    }
    return { provider, wire };
}

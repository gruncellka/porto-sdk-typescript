/**
 * Wire definitions registry.
 * Compose provider modules; generic fallback only.
 */

import { maskSecret } from "../output.js";
import { deutschepostInternetmarke } from "./deutschepost.js";
import { swisspostWebstamp } from "./swisspost.js";

export interface WireDefinition {
    mapPayload: (opts: Record<string, unknown>) => {
        baseUrl?: string;
        credentials?: Record<string, string>;
    };
    buildStatusSummary: (
        wireConfig: { baseUrl?: string; credentials?: Record<string, string> } | null,
    ) => Record<string, unknown>;
    buildLoginSummary: (
        opts: Record<string, unknown>,
        configPath: string,
    ) => Record<string, unknown>;
}

export interface ProviderDefinition {
    defaultWire: string;
    wires: Record<string, WireDefinition>;
}

export const CLI_WIRE_DEFINITIONS: Record<string, ProviderDefinition> = {
    deutschepost: {
        defaultWire: "internetmarke",
        wires: { internetmarke: deutschepostInternetmarke },
    },
    swisspost: {
        defaultWire: "webstamp",
        wires: { webstamp: swisspostWebstamp },
    },
};

const GENERIC_DEFINITION: WireDefinition = {
    mapPayload: (opts) => {
        const credentials: Record<string, string> = {};
        for (const k of [
            "username",
            "password",
            "client_id",
            "client_secret",
            "api_key",
            "api_secret",
            "partnerId",
            "customerId",
            "applicationId",
        ]) {
            const v = opts[k];
            if (v != null && typeof v === "string") credentials[k] = v;
        }
        const baseUrl = opts.baseUrl as string | undefined;
        return {
            baseUrl: baseUrl ? String(baseUrl).replace(/\/+$/, "") : undefined,
            credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        };
    },
    buildStatusSummary: (wireConfig) => {
        const creds = wireConfig?.credentials ?? {};
        return {
            authenticated: Boolean(
                wireConfig?.credentials && Object.keys(wireConfig.credentials).length > 0,
            ),
            baseUrl: wireConfig?.baseUrl ?? null,
            credentialKeys: Object.keys(creds).filter((k) => k !== "password"),
        };
    },
    buildLoginSummary: (_opts, configPath) => ({
        saved: configPath,
        credentialsSaved: true,
    }),
};

export function getDefaultWire(provider: string): string {
    const p = provider.trim().toLowerCase();
    const def = CLI_WIRE_DEFINITIONS[p];
    return def?.defaultWire ?? "default";
}

export function getDefinition(provider: string, wire: string): WireDefinition {
    const p = provider.trim().toLowerCase();
    const w = wire.trim().toLowerCase();
    const def = CLI_WIRE_DEFINITIONS[p]?.wires?.[w];
    return def ?? GENERIC_DEFINITION;
}

export function buildWirePayload(
    opts: Record<string, unknown>,
    provider: string,
    wire: string,
): { baseUrl?: string; credentials?: Record<string, string> } {
    return getDefinition(provider, wire).mapPayload(opts);
}

export function getWireStatusSummary(
    wireConfig: { baseUrl?: string; credentials?: Record<string, string> } | null,
    provider: string,
    wire: string,
): Record<string, unknown> {
    const def = getDefinition(provider, wire);
    const summary = def.buildStatusSummary(wireConfig);
    return { provider, wire, ...summary };
}

export function buildLoginOutputSummary(
    opts: Record<string, unknown>,
    provider: string,
    wire: string,
    configPath: string,
): Record<string, unknown> {
    const def = getDefinition(provider, wire);
    const summary = def.buildLoginSummary(opts, configPath);
    return { provider, wire, ...summary };
}

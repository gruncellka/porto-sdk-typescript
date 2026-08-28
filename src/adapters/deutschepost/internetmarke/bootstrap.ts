/**
 * Deutsche Post Internetmarke adapter bootstrap - reads env, builds WireConfig.
 * Provider/wire specifics live here, not in generic config.
 */

import type { WireConfig } from "../../../config.js";
import type { Transport } from "../../../transport/http-client.js";
import { InternetmarkeAdapter } from "./adapter.js";

const DEFAULT_BASE_URL = "https://api-eu.dhl.com/post/de/shipping/im/v1";

function getEnv(
    provider: string,
    wire: string,
    field: string,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    const key = `PORTO_${provider.toUpperCase()}_${wire.toUpperCase()}_${field}`;
    return env[key];
}

function getIntegratorApiCredentials(
    provider: string,
    env: NodeJS.ProcessEnv,
): { apiKey?: string; apiSecret?: string } {
    const apiKey =
        getEnv(provider, "internetmarke", "API_KEY", env) ??
        getEnv(provider, "internetmarke", "DHL_API_KEY", env) ??
        env.DHL_API_KEY;
    const apiSecret =
        getEnv(provider, "internetmarke", "API_SECRET", env) ??
        getEnv(provider, "internetmarke", "DHL_API_SECRET", env) ??
        env.DHL_API_SECRET;
    return { apiKey, apiSecret };
}

/**
 * Load Internetmarke wire config from env. Returns undefined without integrator
 * API key/secret, so the wire stays unconfigured rather than half-credentialed.
 * Env, first match wins: PORTO_DEUTSCHEPOST_INTERNETMARKE_*, then INTERNETMARKE_* / DHL_*.
 */
export function loadInternetmarkeConfig(
    provider: string,
    env: NodeJS.ProcessEnv = process.env,
): WireConfig | undefined {
    const username =
        getEnv(provider, "internetmarke", "USERNAME", env) ?? env.INTERNETMARKE_USERNAME;
    const password =
        getEnv(provider, "internetmarke", "PASSWORD", env) ?? env.INTERNETMARKE_PASSWORD;
    const { apiKey, apiSecret } = getIntegratorApiCredentials(provider, env);
    if (!apiKey || !apiSecret) return undefined;

    const baseUrl =
        getEnv(provider, "internetmarke", "BASE_URL", env) ??
        env.INTERNETMARKE_BASE_URL ??
        env.DHL_BASE_URL;
    const partnerId =
        getEnv(provider, "internetmarke", "PARTNER_ID", env) ?? env.INTERNETMARKE_PARTNER_ID;

    const credentials: Record<string, string> = {
        dhl_api_key: apiKey,
        dhl_api_secret: apiSecret,
    };
    if (username) credentials.username = username;
    if (password) credentials.password = password;
    if (partnerId) credentials.partner_id = partnerId;

    return {
        baseUrl: baseUrl ? baseUrl.replace(/\/+$/, "") : undefined,
        credentials,
    };
}

export function getInternetmarkeBaseUrl(wireConfig?: WireConfig): string {
    return wireConfig?.baseUrl ?? DEFAULT_BASE_URL;
}

export function createInternetmarkeAdapter(
    wires: Record<string, WireConfig> | undefined,
    env?: NodeJS.ProcessEnv,
    provider = "deutschepost",
    httpClient?: Transport,
) {
    const im = wires?.internetmarke ?? (env ? loadInternetmarkeConfig(provider, env) : undefined);
    const creds = im?.credentials ?? {};
    return new InternetmarkeAdapter(
        creds.username,
        creds.password,
        creds.dhl_api_key,
        creds.dhl_api_secret,
        getInternetmarkeBaseUrl(im),
        creds.partner_id,
        undefined,
        httpClient,
    );
}

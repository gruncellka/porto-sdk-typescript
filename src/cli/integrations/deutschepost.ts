import { maskSecret } from "../output.js";
import type { WireDefinition } from "./registry.js";

export const deutschepostInternetmarke: WireDefinition = {
    mapPayload: (opts) => {
        const credentials: Record<string, string> = {
            username: String(opts.username ?? ""),
            password: String(opts.password ?? ""),
        };
        const baseUrl = opts.baseUrl as string | undefined;
        if (opts.dhlApiKey) credentials.dhl_api_key = String(opts.dhlApiKey);
        if (opts.dhlApiSecret) credentials.dhl_api_secret = String(opts.dhlApiSecret);
        if (opts.partnerId) credentials.partner_id = String(opts.partnerId);
        return {
            baseUrl: baseUrl ? String(baseUrl).replace(/\/+$/, "") : undefined,
            credentials,
        };
    },
    buildStatusSummary: (wireConfig) => {
        const creds = wireConfig?.credentials ?? {};
        return {
            authenticated: Boolean(
                wireConfig?.credentials && Object.keys(wireConfig.credentials).length > 0,
            ),
            username: creds.username ?? null,
            baseUrl: wireConfig?.baseUrl ?? null,
            hasDhlApiKey: Boolean(creds.dhl_api_key),
            hasDhlApiSecret: Boolean(creds.dhl_api_secret),
        };
    },
    buildLoginSummary: (opts, configPath) => ({
        saved: configPath,
        username: opts.username ?? null,
        password: maskSecret(opts.password as string),
        dhlApiKey: maskSecret(opts.dhlApiKey as string),
        dhlApiSecret: maskSecret(opts.dhlApiSecret as string),
        partnerId: opts.partnerId ?? null,
    }),
};

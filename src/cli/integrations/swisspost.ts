import type { WireDefinition } from "./registry.js";

export const swisspostWebstamp: WireDefinition = {
    mapPayload: (opts) => {
        const credentials: Record<string, string> = {};
        const baseUrl = opts.baseUrl as string | undefined;
        if (opts.username) credentials.username = String(opts.username);
        if (opts.password) credentials.password = String(opts.password);
        if (opts.customerId) credentials.customer_id = String(opts.customerId);
        if (opts.applicationId) credentials.application_id = String(opts.applicationId);
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
            hasCustomerId: Boolean(creds.customer_id),
            hasApplicationId: Boolean(creds.application_id),
        };
    },
    buildLoginSummary: (_opts, configPath) => ({
        saved: configPath,
        credentialsSaved: true,
    }),
};

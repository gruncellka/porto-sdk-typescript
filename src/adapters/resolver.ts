/**
 * Adapter resolver - maps provider id to address adapter instances.
 */

import type { WireConfig } from "../config.js";
import type { Transport } from "../transport/http-client.js";
import { DataFactoryAdapter, OfflineDataFactoryAdapter } from "./deutschepost/datafactory.js";

export type AddressAdapter = DataFactoryAdapter | OfflineDataFactoryAdapter;

export function getAddressAdapter(
    providerId: string,
    wires: Record<string, WireConfig> | undefined,
    httpClient?: Transport,
): AddressAdapter {
    const provider = providerId.trim().toLowerCase();
    if (provider === "deutschepost") {
        const df = wires?.datafactory;
        if (df?.credentials?.client_id && df?.credentials?.client_secret) {
            return new DataFactoryAdapter(
                df.credentials.client_id,
                df.credentials.client_secret,
                df.baseUrl,
                undefined,
                httpClient,
            );
        }
    }
    return new OfflineDataFactoryAdapter();
}

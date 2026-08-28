import { createHash } from "node:crypto";

import type { TrackingState } from "../../types/index.js";
import { DEUTSCHEPOST_SHIPMENT_STATUS_MAP } from "../deutschepost/tracking/status-map.js";
import { LAPOSTE_STATUS_MAP } from "../laposte/tracking/status-map.js";
import { SWISSPOST_STATUS_MAP } from "../swisspost/tracking/status-map.js";
import { UKRPOSHTA_STATUS_MAP } from "../ukrposhta/tracking/status-map.js";

export function mapNativeStatus(providerId: string, nativeCode: string): TrackingState | undefined {
    const provider = providerId.trim().toLowerCase();
    const table =
        {
            laposte: LAPOSTE_STATUS_MAP,
            ukrposhta: UKRPOSHTA_STATUS_MAP,
            swisspost: SWISSPOST_STATUS_MAP,
            deutschepost: DEUTSCHEPOST_SHIPMENT_STATUS_MAP,
        }[provider] ?? {};
    return table[nativeCode] ?? table[nativeCode.toUpperCase()] ?? table[nativeCode.toLowerCase()];
}

export function buildEventId(
    providerId: string,
    trackingNumber: string,
    providerCode: string,
    occurredAt: string,
): string {
    const raw = `${providerId}:${trackingNumber}:${providerCode}:${occurredAt}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

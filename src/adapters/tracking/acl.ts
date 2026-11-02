import { createHash } from "node:crypto";

import type { PortoStatus } from "../../types/index.js";
import { MAP as deutschepost } from "../deutschepost/tracking/status-map.js";
import { MAP as laposte } from "../laposte/tracking/status-map.js";
import { MAP as swisspost } from "../swisspost/tracking/status-map.js";
import { MAP as ukrposhta } from "../ukrposhta/tracking/status-map.js";

export function mapNativeStatus(providerId: string, nativeCode: string): PortoStatus | undefined {
    const provider = providerId.trim().toLowerCase();
    const table =
        {
            laposte,
            ukrposhta,
            swisspost,
            deutschepost,
        }[provider] ?? {};
    return table[nativeCode] ?? table[nativeCode.toUpperCase()] ?? table[nativeCode.toLowerCase()];
}

export function buildEventId(
    providerId: string,
    trackingNumber: string,
    providerCode: string,
    options?: {
        nativeId?: unknown;
        nativeSequence?: unknown;
        nativeIndex?: number;
        occurredAt?: string;
    },
): string {
    const nativeId = normalizedIdentity(options?.nativeId);
    const nativeSequence = normalizedIdentity(options?.nativeSequence);
    const discriminator =
        nativeId !== undefined
            ? `id:${nativeId}`
            : nativeSequence !== undefined
              ? `sequence:${nativeSequence}`
              : options?.nativeIndex !== undefined
                ? `index:${options.nativeIndex}:time:${options.occurredAt ?? ""}`
                : `time:${options?.occurredAt ?? ""}`;
    const raw = `${providerId}:${trackingNumber}:${providerCode}:${discriminator}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function normalizedIdentity(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const text = String(value).trim();
    return text || undefined;
}

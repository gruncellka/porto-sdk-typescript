/**
 * Deutsche Post shipment tracking (Sendungsverfolgung wire). Not Internetmarke.
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import { sanitizeProviderPayload } from "../../../provider-payload.js";
import type { Transport } from "../../../transport/http-client.js";
import type { TrackingEvent, TrackingStatus } from "../../../types/index.js";
import { assembleTracking, mapEvent } from "../../tracking/adapter.js";
import type { TrackingAdapter } from "../../tracking/adapter.js";

export class Adapter implements TrackingAdapter {
    readonly providerId = "deutschepost";
    readonly supportsTracking = true;
    readonly wire = "shipment";

    constructor(
        private readonly baseUrl: string,
        private readonly http: Transport,
    ) {}

    async track(trackingNumber: string): Promise<TrackingStatus> {
        const url = `${this.baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(trackingNumber)}`;
        const response = await this.http.request({
            method: "GET",
            url,
            headers: { Accept: "application/json" },
        });
        if (response.status === 404) {
            throw new PortoError(
                "Tracking number was not found.",
                PortoErrorCode.PORTO_TRACKING_NOT_FOUND,
                404,
                { tracking_number: trackingNumber },
                false,
                this.providerId,
                this.wire,
            );
        }
        if (response.status >= 400) {
            throw new PortoError(
                "Shipment tracking request failed.",
                PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
                response.status,
                undefined,
                response.status >= 500,
                this.providerId,
                this.wire,
            );
        }
        const payload = (await response.json()) as unknown;
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
            throw new PortoError(
                "Shipment tracking returned an unexpected payload.",
                PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
                502,
                undefined,
                false,
                this.providerId,
                this.wire,
            );
        }
        return snapshot(trackingNumber, payload as Record<string, unknown>);
    }
}

function snapshot(trackingNumber: string, payload: Record<string, unknown>): TrackingStatus {
    const receivedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const rows = Array.isArray(payload.events) ? [...payload.events] : [];
    if (payload.currentEvent !== null && typeof payload.currentEvent === "object") {
        rows.push(payload.currentEvent);
    }
    const history: TrackingEvent[] = [];
    const seen = new Set<string>();
    for (const [index, row] of rows.entries()) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
        const record = row as Record<string, unknown>;
        const code = String(record.historicalState ?? record.state ?? record.code ?? "").trim();
        if (!code) continue;
        // occurredAt/occurred_at are compatibility fixture aliases, not DP wire fields.
        const event = mapEvent({
            providerId: "deutschepost",
            trackingNumber,
            nativeCode: code,
            nativeLabel: optionalString(record.shortStatus ?? record.status ?? record.label),
            occurredAt: record.timestamp ?? record.occurredAt ?? record.occurred_at,
            receivedAt,
            nativeId: record.eventId ?? record.id,
            nativeSequence: record.sequence ?? record.step,
            nativeIndex: index,
            location: optionalString(record.location),
            description: optionalString(record.status ?? record.description),
        });
        if (!seen.has(event.eventId)) {
            seen.add(event.eventId);
            history.push(event);
        }
    }
    const assembled = assembleTracking(history);
    const sanitized = sanitizeProviderPayload(payload);
    return {
        trackingNumber,
        providerId: "deutschepost",
        status: assembled.status,
        lastUpdate: assembled.lastUpdate,
        statusChangedAt: assembled.statusChangedAt,
        pollReceivedAt: receivedAt,
        location: assembled.location,
        history,
        providerRaw:
            sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized)
                ? (sanitized as Record<string, unknown>)
                : undefined,
    };
}

function optionalString(value: unknown): string | undefined {
    if (value == null) return undefined;
    const text = String(value).trim();
    return text || undefined;
}

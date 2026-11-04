import { PortoError, PortoErrorCode } from "../../errors.js";
import type { PortoStatus, TrackingEvent, TrackingStatus } from "../../types/index.js";
import { Adapter as Shipment } from "../deutschepost/tracking/shipment.js";
import { buildEventId, mapNativeStatus } from "./acl.js";
import { normalizeOccurredAt } from "./time.js";

export interface TrackingAdapter {
    providerId: string;
    supportsTracking: boolean;
    track(trackingNumber: string): Promise<TrackingStatus>;
}

export class UnsupportedTrackingAdapter implements TrackingAdapter {
    readonly providerId: string;
    readonly wire: string;
    readonly supportsTracking = false;
    private readonly reason: string;

    constructor(providerId: string, options?: { wire?: string; reason?: string }) {
        this.providerId = providerId.trim().toLowerCase();
        this.wire = options?.wire ?? "none";
        this.reason = options?.reason ?? "Tracking is not supported for this provider wire.";
    }

    async track(trackingNumber: string): Promise<TrackingStatus> {
        throw new PortoError(
            this.reason,
            PortoErrorCode.PORTO_TRACKING_UNSUPPORTED,
            501,
            {
                provider_id: this.providerId,
                wire: this.wire,
                tracking_number: trackingNumber,
            },
            false,
            this.providerId,
            this.wire,
        );
    }
}

export class StubTrackingAdapter implements TrackingAdapter {
    readonly providerId: string;
    readonly supportsTracking = false;

    constructor(providerId: string) {
        this.providerId = providerId.trim().toLowerCase();
    }

    async track(trackingNumber: string): Promise<TrackingStatus> {
        throw new PortoError(
            `Live tracking is not yet wired for ${this.providerId}.`,
            PortoErrorCode.PORTO_TRACKING_UNSUPPORTED,
            501,
            {
                provider_id: this.providerId,
                tracking_number: trackingNumber,
            },
            false,
            this.providerId,
        );
    }
}

export function mapEvent(args: {
    providerId: string;
    trackingNumber: string;
    nativeCode: string;
    nativeLabel?: string | null;
    occurredAt?: unknown;
    receivedAt: string;
    nativeId?: unknown;
    nativeSequence?: unknown;
    nativeIndex?: number;
    location?: string;
    description?: string;
}): TrackingEvent {
    const status = mapNativeStatus(args.providerId, args.nativeCode);
    const occurred = normalizeOccurredAt(args.occurredAt);
    const eventId = buildEventId(args.providerId, args.trackingNumber, args.nativeCode, {
        nativeId: args.nativeId,
        nativeSequence: args.nativeSequence,
        nativeIndex: args.nativeIndex,
        occurredAt: occurred?.value,
    });
    const event: TrackingEvent = {
        eventId,
        providerId: args.providerId,
        providerCode: args.nativeCode,
        providerLabel: args.nativeLabel ?? undefined,
        receivedAt: args.receivedAt,
        status,
        location: args.location,
        description: args.description,
    };
    if (occurred) {
        event.occurredAt = occurred.value;
        event.occurredKind = occurred.kind;
    }
    return event;
}

export interface TrackingAssembly {
    status?: PortoStatus;
    lastUpdate?: string;
    statusChangedAt?: string;
    location?: string;
}

export function assembleTracking(history: TrackingEvent[]): TrackingAssembly {
    const latest = history.at(-1);
    const mapped = history.filter(
        (event): event is TrackingEvent & { status: PortoStatus } => event.status !== undefined,
    );
    const current = mapped.at(-1);
    let changed = current;
    if (current) {
        for (let index = mapped.length - 2; index >= 0; index -= 1) {
            const event = mapped[index];
            if (!event || event.status !== current.status) break;
            changed = event;
        }
    }
    return {
        status: current?.status,
        lastUpdate: latest?.occurredAt,
        statusChangedAt: changed?.occurredAt,
        location: latest?.location,
    };
}

/** Provider wire key (Deutsche Post Sendungsverfolgung). */
export const SHIPMENT_WIRE_ID = "shipment";

export function trackingWireId(
    wires: Record<string, { baseUrl?: string | null }> | null | undefined,
): string | null {
    if (!wires || !(SHIPMENT_WIRE_ID in wires)) return null;
    const base = (wires[SHIPMENT_WIRE_ID]?.baseUrl ?? "").trim();
    if (!base) return null;
    return SHIPMENT_WIRE_ID;
}

export function getTrackingAdapter(
    providerId: string,
    options?: {
        wireId?: string | null;
        dataPath?: string | null;
        baseUrl?: string | null;
        httpClient?: import("../../transport/http-client.js").Transport | null;
    },
): TrackingAdapter {
    const provider = providerId.trim().toLowerCase();
    const wire = (options?.wireId ?? "").trim().toLowerCase();

    if (!wire) {
        return new UnsupportedTrackingAdapter(provider, {
            wire: "none",
            reason: "No tracking wire is configured.",
        });
    }

    if (provider === "deutschepost" && wire === "internetmarke") {
        return new UnsupportedTrackingAdapter(provider, {
            wire: "internetmarke",
            reason:
                "The internetmarke wire does not poll tracking events. " +
                "Use the shipment wire when a base URL is set.",
        });
    }

    if (provider === "deutschepost" && wire === SHIPMENT_WIRE_ID) {
        const base = (options?.baseUrl ?? "").trim();
        if (!base || !options?.httpClient) {
            return new UnsupportedTrackingAdapter(provider, {
                wire: SHIPMENT_WIRE_ID,
                reason: "Tracking requires an explicit shipment base URL.",
            });
        }
        return new Shipment(base, options.httpClient);
    }

    return new StubTrackingAdapter(provider);
}

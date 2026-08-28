import { PortoError, PortoErrorCode } from "../../errors.js";
import { type TrackingEvent, TrackingState, type TrackingStatus } from "../../types/index.js";
import { buildEventId, mapNativeStatus } from "./acl.js";

export type TrackingKind = "shipment" | "stamp";

export interface TrackingAdapter {
    providerId: string;
    supportsTracking: boolean;
    trackingKind: TrackingKind;
    track(trackingNumber: string): Promise<TrackingStatus>;
}

export class UnsupportedTrackingAdapter implements TrackingAdapter {
    readonly providerId: string;
    readonly wire: string;
    readonly trackingKind: TrackingKind;
    readonly supportsTracking = false;
    private readonly reason: string;

    constructor(
        providerId: string,
        options?: { wire?: string; trackingKind?: TrackingKind; reason?: string },
    ) {
        this.providerId = providerId.trim().toLowerCase();
        this.wire = options?.wire ?? "none";
        this.trackingKind = options?.trackingKind ?? "stamp";
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
                tracking_kind: this.trackingKind,
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
    readonly trackingKind: TrackingKind;
    readonly supportsTracking = false;

    constructor(providerId: string, trackingKind: TrackingKind = "shipment") {
        this.providerId = providerId.trim().toLowerCase();
        this.trackingKind = trackingKind;
    }

    async track(trackingNumber: string): Promise<TrackingStatus> {
        throw new PortoError(
            `Live tracking is not yet wired for ${this.providerId}.`,
            PortoErrorCode.PORTO_TRACKING_UNSUPPORTED,
            501,
            {
                provider_id: this.providerId,
                tracking_kind: this.trackingKind,
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
    occurredAt: string;
    receivedAt: string;
    location?: string;
    description?: string;
}): TrackingEvent {
    const status = mapNativeStatus(args.providerId, args.nativeCode) ?? TrackingState.IN_TRANSIT;
    const eventId = buildEventId(
        args.providerId,
        args.trackingNumber,
        args.nativeCode,
        args.occurredAt,
    );
    return {
        eventId,
        providerId: args.providerId,
        providerCode: args.nativeCode,
        providerLabel: args.nativeLabel ?? undefined,
        occurredAt: args.occurredAt,
        receivedAt: args.receivedAt,
        status,
        location: args.location,
        description: args.description,
    };
}

export function getTrackingAdapter(
    providerId: string,
    options?: { wireId?: string | null; dataPath?: string | null },
): TrackingAdapter {
    const provider = providerId.trim().toLowerCase();
    const wire = (options?.wireId ?? "").trim().toLowerCase();

    if (provider === "deutschepost" && wire === "internetmarke") {
        return new UnsupportedTrackingAdapter(provider, {
            wire: "internetmarke",
            trackingKind: "stamp",
            reason:
                "Internetmarke stamp marks do not support shipment tracking. " +
                "Use a Sendungsverfolgung wire when available.",
        });
    }

    return new StubTrackingAdapter(provider, "shipment");
}

/**
 * Core type definitions for Porto SDK (public surface SoT for field shapes).
 * Runtime validation: schemas/ Zod models typed against these interfaces.
 */

export interface Dimensions {
    length: number;
    width: number;
    height: number;
    thickness?: number;
}

export interface Address {
    name: string;
    street?: string;
    houseNumber?: string;
    postBox?: string;
    postalCode: string;
    locality: string;
    countryCode: string;
    regionCode?: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    data?: unknown;
}

export interface MarkRequest {
    destination?: Address;
    origin?: Address;
    value: number;
    idempotencyKey?: string;
    /** Internal catalog product code for the active wire. */
    wireCode?: number | string;
}

export enum TrackingState {
    CREATED = "created",
    IN_TRANSIT = "in_transit",
    OUT_FOR_DELIVERY = "out_for_delivery",
    DELIVERED = "delivered",
    RETURNED = "returned",
    UNDELIVERABLE = "undeliverable",
}

export interface TrackingEvent {
    eventId: string;
    providerId: string;
    providerCode?: string;
    providerLabel?: string;
    occurredAt: string;
    receivedAt: string;
    status: TrackingState;
    location?: string;
    description?: string;
}

export interface TrackingStatus {
    trackingNumber: string;
    providerId: string;
    trackingKind: "shipment" | "stamp";
    status: TrackingState;
    lastUpdate: string;
    pollReceivedAt: string;
    location?: string;
    nextSteps?: string[];
    estimatedDelivery?: string;
    history: TrackingEvent[];
}

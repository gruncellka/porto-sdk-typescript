/**
 * Branded identifiers that must not be swapped at type-check time.
 */

export type ProviderId = string & { readonly __brand: "ProviderId" };
export type WireId = string & { readonly __brand: "WireId" };
export type TrackingNumber = string & { readonly __brand: "TrackingNumber" };
export type ExternalMarkId = string & { readonly __brand: "ExternalMarkId" };

export function providerId(value: string): ProviderId {
    return value.trim().toLowerCase() as ProviderId;
}

export function wireId(value: string): WireId {
    return value.trim().toLowerCase() as WireId;
}

export function trackingNumber(value: string): TrackingNumber {
    return value.trim() as TrackingNumber;
}

export function externalMarkId(value: string): ExternalMarkId {
    return value.trim() as ExternalMarkId;
}

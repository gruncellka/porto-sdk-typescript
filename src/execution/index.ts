/**
 * Execution types — Porto (resolved decision) vs PortoMark (provider result).
 */

import { raiseDataInvalid } from "../errors/domains/data.js";
import type { Porto } from "../services/porto-resolver.js";
import type { Address, MarkRequest } from "../types/index.js";

export type MarkType = "stamp" | "label";
export type TrackingMode = "none" | "optional" | "included";
export type MarkOutputMime = "image/png" | "application/pdf";

export const DEFAULT_MARK_OUTPUT_MIME: MarkOutputMime = "image/png";

function optionalWireId(value?: string | null): string | undefined {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

export interface ExecutionParameters {
    /** Optional correlation token for provider wires (e.g. X-Request-ID). */
    requestId?: string;
    idempotencyKey?: string;
    outputMime?: MarkOutputMime;
    credentials?: Record<string, string>;
    wire?: string;
}

export interface PortoMarkRequest {
    porto: Porto;
    sender?: Address;
    recipient?: Address;
    idempotency?: string;
    mime?: MarkOutputMime;
}

export interface PortoMark {
    id: string;
    content: string;
    contentType: MarkOutputMime;
    externalId?: string;
    trackingNumber?: string;
    amount: number;
    currency: string;
    provider: string;
    wire: string;
    generatedAt: string;
}

export interface MarkExecution {
    porto?: Porto;
    request: MarkRequest;
    preCalculatedPrice?: number;
    markProfileId?: string;
    allowedMimeTypes: string[];
    zoneId?: string;
    productId?: string;
    wireCode?: number | string;
    markType?: MarkType;
    tracking?: TrackingMode;
    /** PortoProduct from prepare — execute must not re-resolve. */
    resolvedProduct?: import("../data/entities/products.js").PortoProduct;
}

export type PortoMarkResultInput = {
    content: string;
    contentType: MarkOutputMime;
    amount: number;
    currency?: string;
    externalId?: string | null;
    trackingNumber?: string | null;
    generatedAt?: string;
};

/** Mint a PortoMark. Adapters must call createBoundMarkFactory(provider, wire).newMark. */
export function buildPortoMark(
    provider: string,
    wire: string,
    input: PortoMarkResultInput,
): PortoMark {
    if (!input.content?.trim()) {
        throw new Error("PortoMark.content must be non-empty");
    }
    if (input.amount < 0) {
        throw new Error("PortoMark.amount must be >= 0");
    }
    return {
        id: crypto.randomUUID(),
        content: input.content,
        contentType: input.contentType,
        externalId: optionalWireId(input.externalId),
        trackingNumber: optionalWireId(input.trackingNumber),
        amount: input.amount,
        currency: input.currency ?? "EUR",
        provider,
        wire,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
    };
}

export function createBoundMarkFactory(provider: string, wire: string) {
    return {
        newMark(input: PortoMarkResultInput): PortoMark {
            return buildPortoMark(provider, wire, input);
        },
    };
}

export function parseMarkType(value?: string | null): MarkType;
export function parseMarkType(
    value: string | null | undefined,
    allowNone: true,
): MarkType | undefined;
export function parseMarkType(value?: string | null, allowNone?: boolean): MarkType | undefined {
    if (value == null || !String(value).trim()) {
        if (allowNone) return undefined;
        raiseDataInvalid("Missing mark type");
    }
    const token = String(value).trim();
    if (token === "stamp" || token === "label") return token;
    raiseDataInvalid(`Unknown mark type: ${token}`, { details: { mark_type: token } });
}

export function parseTrackingMode(value?: string | null): TrackingMode;
export function parseTrackingMode(
    value: string | null | undefined,
    allowNone: true,
): TrackingMode | undefined;
export function parseTrackingMode(
    value?: string | null,
    allowNone?: boolean,
): TrackingMode | undefined {
    if (value == null || !String(value).trim()) {
        if (allowNone) return undefined;
        raiseDataInvalid("Missing tracking mode");
    }
    const token = String(value).trim();
    if (token === "none" || token === "optional" || token === "included") return token;
    raiseDataInvalid(`Unknown tracking mode: ${token}`, { details: { tracking: token } });
}

export function markWire(mark: PortoMark): string {
    return (mark.wire ?? "").trim().toLowerCase();
}

export function validateOutputMime(
    requested: string,
    allowed: string[],
    defaultMime: MarkOutputMime = DEFAULT_MARK_OUTPUT_MIME,
): string {
    if (allowed.includes(requested)) return requested;
    if (allowed.includes(defaultMime)) return defaultMime;
    return allowed[0] ?? requested;
}

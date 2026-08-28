import type { MarkType, TrackingMode } from "../execution/index.js";
import type { ServiceKind } from "../kinds.js";
import type { DeliveryHint } from "./resolution/index.js";

export interface ProductIndemnityOption {
    tier: string;
    maxAmount: number;
}

/** Priced add-on available for a product × destination zone (from options()). */
export interface ServiceOption {
    id: string;
    kind: ServiceKind | null;
    name: string;
    label?: string | null;
    amount: number | null;
    currency: string;
    combinableWith?: string[] | null;
}

export interface ProductOption {
    id: string;
    providerId: string;
    name: string;
    allowedEnvelopeIds: string[];
    markType: MarkType | null;
    tracking: TrackingMode | null;
    maxWeight?: number | null;
    indemnity?: ProductIndemnityOption | null;
    amount?: number | null;
    currency: string;
    deliveryHint?: DeliveryHint | null;
    /** Applicable add-ons for this product × options() zone. */
    services: ServiceOption[];
}

export interface ListProductOptionsInput {
    countryCode: string;
    weight: number;
    envelopeId?: string | null;
}

export type AdviceAction = "KEEP" | "AUTO_UPGRADE";

export type AdviceReason = "weight_over" | "larger_than_needed";

export interface RecommendProductForWeightInput {
    weight: number;
    selectedProductId?: string | null;
    /** Restrict candidates (e.g. UI peer set). Omit = all provider products. */
    candidateProductIds?: readonly string[] | null;
}

/** Catalog weight advice — hard AUTO_UPGRADE or soft larger_than_needed. */
export interface Advice {
    action: AdviceAction;
    selectedProductId: string | null;
    effectiveProductId: string | null;
    suggestedProductId: string | null;
    reason: AdviceReason | null;
    selectedMaxWeight: number | null;
    suggestedMaxWeight: number | null;
    selectedProductName: string | null;
    suggestedProductName: string | null;
}

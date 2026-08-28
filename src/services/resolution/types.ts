/**
 * Resolution types — shared across resolution primitives.
 * Catalog identity is concrete `id`. Service/feature `kind` is grouping only.
 */

import type { DeliveryHint, DeliveryPreference } from "./delivery-resolver.js";

export type { DeliveryHint, DeliveryPreference };

/** Inputs shared by ProductResolver / PriceResolver helpers. */
export interface ResolvedInput {
    zone_id: string;
    weight_tier_id: string;
    product_id?: string | null;
    envelope_id?: string | null;
    delivery_preference?: DeliveryPreference | null;
    indemnity_tier?: string | null;
}

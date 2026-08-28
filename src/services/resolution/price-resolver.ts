/**
 * Price Resolver — product × zone × weight_tier catalog lookup.
 */

import type { PortoDataLoader, PortoPricing } from "../../data/loader.js";
import type { ResolvedInput } from "./types.js";

export class PriceResolver {
    constructor(private readonly loader: PortoDataLoader) {}

    /**
     * Resolve price for product given ResolvedInput.
     * Lookup: product_id + zone_id + weight_tier_id
     */
    resolve(input: ResolvedInput, productId: string): PortoPricing | null {
        return this.loader.getPriceByProductZoneWeightTier(
            productId,
            input.zone_id,
            input.weight_tier_id,
        );
    }
}

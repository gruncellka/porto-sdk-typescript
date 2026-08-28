/**
 * Feature Resolver - Resolves features for product and zone.
 *
 * Resolution primitive: product_id + zone_id -> features.
 */

import type { Feature } from "../../data/entities/features.js";
import type { PortoDataLoader } from "../../data/loader.js";

export interface FeatureResolutionResult {
    isValid: boolean;
    data: { features: Feature[] };
}

export class FeatureResolver {
    constructor(private readonly loader: PortoDataLoader) {}

    resolve(productId: string, zoneId: string): FeatureResolutionResult {
        const features = this.loader.getFeaturesForProduct(productId);
        const zoneFeatures = this.loader.getFeaturesForZone(zoneId);
        const allFeatures = [...features, ...zoneFeatures];
        return { isValid: true, data: { features: allFeatures } };
    }
}

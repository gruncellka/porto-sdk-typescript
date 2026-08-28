/**
 * Dimension Resolver - Resolves dimensions for product.
 *
 * Resolution primitive: product_id -> dimensions.
 */

import type { PortoDataLoader } from "../../data/loader.js";

export interface DimensionResolutionResult {
    isValid: boolean;
    data: { dimensions: unknown[] };
}

export class DimensionResolver {
    constructor(private readonly loader: PortoDataLoader) {}

    resolve(productId: string): DimensionResolutionResult {
        const dimensions = this.loader.getDimensionsForProduct(productId);
        return { isValid: true, data: { dimensions } };
    }
}

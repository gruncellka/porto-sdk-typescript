/**
 * Dimensions Entity Loader
 *
 * Handles loading and querying dimensions entity.
 */

import { BaseEntityLoader, type EntityData } from "./base";

export class DimensionsLoader extends BaseEntityLoader {
    private dimensions: EntityData[] = [];

    load(data: EntityData): void {
        /** Transform dimensions JSON to dimension objects */
        this.dimensions = data.dimensions || [];
    }

    getData(): EntityData[] {
        /** Get all dimensions */
        return this.dimensions;
    }

    /**
     * Get dimension by ID
     */
    getDimension(dimensionId: string): EntityData | null {
        return this.dimensions.find((d) => d.id === dimensionId) || null;
    }

    /**
     * Get dimensions for a product based on product's envelope_ids
     *
     * @param productId - Product ID (for logging/debugging)
     * @param productEnvelopeIds - List of dimension IDs from product
     * @returns List of dimension objects matching product's envelope_ids
     */
    getDimensionsForProduct(productId: string, productEnvelopeIds: string[]): EntityData[] {
        return this.dimensions.filter((d) => productEnvelopeIds.includes(d.id));
    }

    getAllDimensions(): EntityData[] {
        /** Get all dimensions */
        return this.dimensions;
    }
}

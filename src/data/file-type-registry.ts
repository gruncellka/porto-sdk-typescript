/** Metadata-driven dispatch from porto-data file_type to entity loaders. */

import type { EntityData } from "./entities/base";

export interface FileLoadHandlers {
    loadProducts: (data: EntityData) => void;
    loadZones: (data: EntityData) => void;
    loadWeightTiers: (data: EntityData) => void;
    loadWeights: (data: EntityData) => void;
    loadPrices: (data: EntityData) => void;
    loadProductPrices: (data: EntityData) => void;
    loadServicePrices: (data: EntityData) => void;
    loadDimensions: (data: EntityData) => void;
    loadFeatures: (data: EntityData) => void;
    loadServices: (data: EntityData) => void;
    loadRestrictions: (data: EntityData) => void;
    loadEnvelopes: (data: EntityData) => void;
    loadLayouts: (data: EntityData) => void;
    loadAddresses: (data: EntityData) => void;
    loadMarks: (data: EntityData) => void;
    loadProviders: (data: EntityData) => void;
    loadMarkets: (data: EntityData) => void;
    loadJurisdictions: (data: EntityData) => void;
    loadRules: (data: EntityData) => void;
}

const SKIP_FILE_TYPES = new Set(["graph", "execution", "integrations", "integration"]);

export class FileTypeRegistry {
    constructor(private readonly handlers: FileLoadHandlers) {}

    dispatch(fileType: string, data: EntityData): { handled: boolean; skipped?: boolean } {
        if (SKIP_FILE_TYPES.has(fileType)) {
            return { handled: true, skipped: true };
        }

        const route: Record<string, (payload: EntityData) => void> = {
            products: this.handlers.loadProducts,
            zones: this.handlers.loadZones,
            weight_tiers: this.handlers.loadWeightTiers,
            weights: this.handlers.loadWeights,
            prices: this.handlers.loadPrices,
            product_prices: this.handlers.loadProductPrices,
            service_prices: this.handlers.loadServicePrices,
            dimensions: this.handlers.loadDimensions,
            features: this.handlers.loadFeatures,
            services: this.handlers.loadServices,
            restrictions: this.handlers.loadRestrictions,
            envelopes: this.handlers.loadEnvelopes,
            layouts: this.handlers.loadLayouts,
            addresses: this.handlers.loadAddresses,
            marks: this.handlers.loadMarks,
            providers: this.handlers.loadProviders,
            markets: this.handlers.loadMarkets,
            jurisdictions: this.handlers.loadJurisdictions,
            provider_rules: this.handlers.loadRules,
        };

        const handler = route[fileType];
        if (!handler) {
            return { handled: false };
        }
        handler(data);
        return { handled: true };
    }
}

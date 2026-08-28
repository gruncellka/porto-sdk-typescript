import type {
    PortoPricing,
    PortoProduct,
    PortoWeightTier,
    PortoZone,
    ResolutionGraph,
} from "./loader";

/** Service price entry from prices.json */
export interface PortoServicePrice {
    service_id: string;
    [key: string]: unknown;
}

export interface PortoDataRegistries {
    dimensions: any[];
    products: PortoProduct[];
    prices: PortoPricing[];
    zones: PortoZone[];
    weightTiers: PortoWeightTier[];
    services: any[];
    features: any[];
    restrictions: any[];
    resolutionGraph: ResolutionGraph;
    servicePrices: PortoServicePrice[];
}

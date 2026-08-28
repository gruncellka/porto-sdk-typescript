import type { DeliveryHint } from "./resolution/index.js";

/** Internal catalog quote. Not a public ProviderClient type. */
export interface Estimate {
    productId: string;
    zoneId: string;
    weightTierId: string;
    weight: number;
    amount: number;
    currency: string;
    deliveryHint?: DeliveryHint | null;
}

export interface EstimateForProductInput {
    productId: string;
    countryCode: string;
    weight: number;
}

/**
 * Pricing — public consumer price from destination facts.
 */

import type { PortoResolver } from "./porto-resolver.js";
import type { PriceComponent } from "./resolution/quote.js";
import type { DeliveryPreference } from "./resolution/types.js";

export interface Pricing {
    productId: string;
    zoneId: string;
    weight: number;
    amount: number;
    currency: string;
    components: PriceComponent[];
}

export interface PriceInput {
    weight: number;
    countryCode: string;
    productId?: string;
    envelopeId?: string;
    indemnityTier?: string;
    services?: import("../kinds.js").ServiceKind[];
    serviceIds?: string[];
    deliveryPreference?: DeliveryPreference;
}

export async function price(resolver: PortoResolver, input: PriceInput): Promise<Pricing> {
    const porto = await resolver.resolve({
        countryCode: input.countryCode,
        weight: input.weight,
        productId: input.productId,
        envelopeId: input.envelopeId,
        indemnityTier: input.indemnityTier,
        services: input.services,
        serviceIds: input.serviceIds,
        deliveryPreference: input.deliveryPreference,
    });
    return {
        productId: porto.product.id,
        zoneId: porto.zone.id,
        weight: input.weight,
        amount: porto.amount,
        currency: porto.currency,
        components: [...porto.components],
    };
}

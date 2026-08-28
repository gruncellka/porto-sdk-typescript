/**
 * Compose an authoritative catalog quote from product + bound service rows.
 */

import { raisePriceNotFound } from "../../errors/domains/resolution.js";

export type PriceComponentKind = "product" | "service";

export interface PriceComponent {
    kind: PriceComponentKind;
    id: string;
    amount: number;
}

export interface ComposedQuote {
    amount: number;
    components: PriceComponent[];
}

export function composeQuote(input: {
    productId: string;
    productAmount: number;
    zoneId: string;
    weightTierId: string;
    serviceIds: readonly string[];
    lookupServicePrice: (serviceId: string, zoneId: string) => number | null;
}): ComposedQuote {
    const components: PriceComponent[] = [
        { kind: "product", id: input.productId, amount: input.productAmount },
    ];
    const seen = new Set<string>();
    for (const raw of input.serviceIds) {
        const serviceId = String(raw ?? "").trim();
        if (!serviceId || seen.has(serviceId)) continue;
        seen.add(serviceId);
        const price = input.lookupServicePrice(serviceId, input.zoneId);
        if (price == null) {
            raisePriceNotFound(`No price for service ${serviceId} / ${input.zoneId}`, {
                productId: input.productId,
                zoneId: input.zoneId,
                weightTierId: input.weightTierId,
                statusCode: 422,
                details: { service_id: serviceId },
            });
        }
        components.push({ kind: "service", id: serviceId, amount: price });
    }
    return {
        amount: components.reduce((sum, row) => sum + row.amount, 0),
        components,
    };
}

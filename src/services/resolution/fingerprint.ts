/** Resolution fingerprint — mirrors porto-data CI delivery validator. */

import type { PortoProduct } from "../../data/entities/products";

export function deliveryZoneSignature(
    product: PortoProduct,
    zoneId: string,
): [unknown, unknown, unknown, unknown] | null {
    for (const entry of product.delivery ?? []) {
        if (entry.zones.includes(zoneId)) {
            return [entry.span, entry.days_min ?? null, entry.days_max, entry.weekdays ?? null];
        }
    }
    return null;
}

export function resolutionFingerprint(
    product: PortoProduct,
    zoneId: string,
): [unknown, unknown, ReadonlySet<string>, unknown] {
    const tier = product.indemnity?.tier ?? null;
    const featuresKey = new Set(product.included_features ?? []);
    return [deliveryZoneSignature(product, zoneId), tier, featuresKey, product.tracking ?? null];
}

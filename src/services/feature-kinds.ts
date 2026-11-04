/**
 * Purchased FeatureKind values from bound catalog services.
 */

import { raiseDataInvalid } from "../errors/domains/data.js";
import type { FeatureKind } from "../kinds.js";

type FeatureKindSource = {
    getService(serviceId: string): { features?: readonly string[] } | null;
    getFeature(featureId: string): { kind: FeatureKind } | null;
};

/** Catalog order. Duplicate kinds collapse. Missing feature id fails closed. */
export function featureKindsForServiceIds(
    loader: FeatureKindSource,
    serviceIds: readonly string[] | null | undefined,
): FeatureKind[] {
    const kinds: FeatureKind[] = [];
    const seen = new Set<string>();
    for (const raw of serviceIds ?? []) {
        const serviceId = String(raw ?? "").trim();
        if (!serviceId) continue;
        const service = loader.getService(serviceId);
        if (!service) {
            raiseDataInvalid(`Unknown service: ${serviceId}`, {
                path: "services",
                details: { service_id: serviceId },
            });
        }
        for (const featureId of service.features ?? []) {
            const fid = String(featureId).trim();
            if (!fid) continue;
            const feature = loader.getFeature(fid);
            if (!feature) {
                raiseDataInvalid(`Unknown feature: ${fid}`, {
                    path: "services.features",
                    details: { service_id: serviceId, feature_id: fid },
                });
            }
            if (seen.has(feature.kind)) continue;
            seen.add(feature.kind);
            kinds.push(feature.kind);
        }
    }
    return kinds;
}

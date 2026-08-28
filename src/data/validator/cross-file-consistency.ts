/**
 * Cross-file consistency validation.
 * - Every service_price.service_id must exist in services
 * - available_services is a separate contract (resolution_graph.global_settings)
 */

import { DataError, PortoErrorCode } from "../../errors";
import type { PortoDataRegistries } from "../registries";

function dataError(message: string): never {
    throw new DataError(message, PortoErrorCode.PORTO_DATA_INVALID, 500);
}

export function validateCrossFileConsistency(registries: PortoDataRegistries): void {
    if (!registries.resolutionGraph) {
        throw new DataError(
            "resolution_graph is missing from registries. Ensure graph.json is loaded and mapped in porto-data.",
            PortoErrorCode.PORTO_DATA_INVALID,
            500,
        );
    }
    const graph = registries.resolutionGraph;
    const dimensionIds = new Set(registries.dimensions.map((d) => String(d.id)));
    const productIds = new Set(registries.products.map((p) => p.id));
    const zoneIds = new Set(registries.zones.map((z) => z.id));
    const weightTierIds = new Set(registries.weightTiers.map((w) => w.id));
    const serviceIds = new Set(registries.services.map((s) => String(s.id)));
    const featureIds = new Set<string>();
    for (const feature of registries.features) {
        if (feature?.id != null) featureIds.add(String(feature.id));
        const portoId = feature?.porto_id ?? feature?.portoId;
        if (portoId != null) featureIds.add(String(portoId));
    }

    for (const product of registries.products) {
        if (product.weight_tier != null && !weightTierIds.has(product.weight_tier)) {
            dataError(
                `Product '${product.id}' references unknown weight tier '${product.weight_tier}'.`,
            );
        }
        for (const zoneId of product.zones ?? []) {
            if (!zoneIds.has(zoneId)) {
                dataError(`Product '${product.id}' references unknown zone '${zoneId}'.`);
            }
        }
        for (const envelopeId of product.envelope_ids ?? []) {
            if (dimensionIds.size > 0 && !dimensionIds.has(envelopeId)) {
                dataError(`Product '${product.id}' references unknown envelope '${envelopeId}'.`);
            }
        }
    }

    for (const price of registries.prices) {
        if (!productIds.has(price.product_id)) {
            dataError(`Price entry references unknown product '${price.product_id}'.`);
        }
        if (!zoneIds.has(price.zone)) {
            dataError(`Price entry references unknown zone '${price.zone}'.`);
        }
        if (!weightTierIds.has(price.weight_tier)) {
            dataError(`Price entry references unknown weight tier '${price.weight_tier}'.`);
        }
    }

    // Contract: every service_price.service_id must exist in services
    for (const sp of registries.servicePrices) {
        const serviceId = String(sp.service_id);
        if (!serviceIds.has(serviceId)) {
            dataError(
                `Service price entry references unknown service '${serviceId}' (must exist in services).`,
            );
        }
    }

    // Separate contract: available_services in resolution_graph must reference existing services
    const configuredServiceIds = new Set<string>(
        ((graph.global_settings?.available_services as unknown[] | undefined) || []).map(
            (s: unknown) => String(s),
        ),
    );
    for (const serviceId of configuredServiceIds) {
        if (!serviceIds.has(serviceId)) {
            dataError(
                `resolution_graph.global_settings.available_services references unknown service '${serviceId}'.`,
            );
        }
    }

    for (const service of registries.services) {
        for (const featureId of service.features || []) {
            if (!featureIds.has(String(featureId))) {
                dataError(`Service '${service.id}' references unknown feature '${featureId}'.`);
            }
        }
    }

    for (const [productId, links] of Object.entries(graph.links || {})) {
        if (!productIds.has(productId)) {
            dataError(`data_links references unknown product '${productId}'.`);
        }
        for (const zoneId of links.zones || []) {
            if (!zoneIds.has(zoneId)) {
                dataError(
                    `resolution_graph for product '${productId}' references unknown zone '${zoneId}'.`,
                );
            }
        }
        for (const weightTierId of links.weight_tiers || []) {
            if (!weightTierIds.has(weightTierId)) {
                dataError(
                    `resolution_graph for product '${productId}' references unknown weight tier '${weightTierId}'.`,
                );
            }
        }
    }
}

/**
 * Thin catalog/loader façade for resolution catalog reads.
 */

import type { PortoEnvelope } from "../../data/entities/envelopes.js";
import type { Service } from "../../data/entities/services.js";
import type {
    PortoDataLoader,
    PortoPricing,
    PortoProduct,
    PortoWeightTier,
    PortoZone,
} from "../../data/loader.js";
import { raiseDataNotFound } from "../../errors/domains/data.js";
import type { ServiceKind } from "../../kinds.js";
import type { ServiceOption } from "../product-option-types.js";
import { ServiceResolver } from "./service-resolver.js";

export class PortoCatalog {
    private _serviceResolver: ServiceResolver;

    constructor(
        private loader: PortoDataLoader,
        serviceResolver?: ServiceResolver,
    ) {
        this._serviceResolver = serviceResolver ?? new ServiceResolver(loader);
    }

    listProducts(_countryFrom?: string, _countryTo?: string): PortoProduct[] {
        return this.loader.getAllProducts();
    }

    getProduct(productId: string): PortoProduct | undefined {
        return this.loader.getProduct(productId);
    }

    getProductConstraints(productId: string): Record<string, unknown> {
        const product = this.loader.getProduct(productId);
        if (!product) {
            raiseDataNotFound(`Product not found: ${productId}`, { entityId: productId });
        }
        const tier = product.weight_tier
            ? this.loader.getWeightTier(product.weight_tier)
            : undefined;
        let maxWeight = tier?.max_weight ?? null;
        if (maxWeight == null) {
            const link = this.loader.resolutionGraph.links?.[product.id];
            const tierIds = link?.weight_tiers ?? [];
            let max = 0;
            for (const tierId of tierIds) {
                const wt = this.loader.getWeightTier(tierId);
                if (wt?.max_weight != null && wt.max_weight > max) max = wt.max_weight;
            }
            maxWeight = max > 0 ? max : null;
        }
        return {
            product_id: product.id,
            allowed_envelope_ids: [...product.envelope_ids],
            min_weight: 0,
            max_weight: maxWeight,
        };
    }

    getGraph(): Record<string, unknown> {
        const graph = this.loader.resolutionGraph;
        return {
            links: graph.links ?? {},
            unit: graph.unit ?? {},
        };
    }

    listDestinationCountries(): Array<{ code: string; zone_id: string }> {
        const byCode = new Map<string, string>();
        for (const zone of this.loader.getAllZones()) {
            for (const rawCode of zone.country_codes) {
                const code = rawCode.trim().toUpperCase();
                if (code.length === 2 && !byCode.has(code)) {
                    byCode.set(code, zone.id);
                }
            }
        }
        return Array.from(byCode.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, zone_id]) => ({ code, zone_id }));
    }

    listZones(): PortoZone[] {
        return this.loader.getAllZones();
    }

    listDimensions(): Array<{
        id?: string;
        size?: { width?: number; height?: number; thickness?: number };
    }> {
        return this.loader.getAllDimensions() as Array<{
            id?: string;
            size?: { width?: number; height?: number; thickness?: number };
        }>;
    }

    listEnvelopes(): PortoEnvelope[] {
        return this.loader.listEnvelopes();
    }

    listWeightTiers(): PortoWeightTier[] {
        return this.loader.getAllWeightTiers();
    }

    getWeightTier(weightTierId: string): PortoWeightTier | null {
        return this.loader.getWeightTier(weightTierId) ?? null;
    }

    getPriceByProductZoneWeightTier(
        productId: string,
        zoneId: string,
        weightTierId: string,
    ): PortoPricing | null {
        return this.loader.getPriceByProductZoneWeightTier(productId, zoneId, weightTierId);
    }

    getServicePrice(serviceId: string, zoneId?: string | null): number | null {
        return this.loader.getServicePrice(serviceId, zoneId) ?? null;
    }

    getService(serviceId: string): Service | null {
        return this.loader.getService(serviceId);
    }

    servicesOfKind(kind: ServiceKind): Service[] {
        return this.loader.getAllServices().filter((row) => row.kind === kind);
    }

    listServiceOptionsForProductZone(productId: string, zoneId: string): ServiceOption[] {
        const product = this.getProduct(productId);
        if (!product) return [];

        const graph = this.getGraph();
        const unit = graph.unit as { currency?: string } | undefined;
        const currency = (unit?.currency ?? "EUR").toUpperCase();

        const resolved = this._serviceResolver.resolve(productId, zoneId);
        const rows = resolved.data.services ?? [];
        const out: ServiceOption[] = [];
        for (const row of rows) {
            const id = row.id;
            if (!id) continue;
            const price = this.getServicePrice(id, zoneId);
            out.push({
                id,
                name: row.name || id,
                label: row.label ?? null,
                kind: row.kind ?? null,
                amount: price ?? null,
                currency,
                combinableWith: row.combinable_with ?? null,
            });
        }
        return out;
    }

    listWireIds(): string[] {
        const wireEdges = this.loader.resolutionGraph.wire_edges ?? {};
        return Object.keys(wireEdges).sort();
    }
}

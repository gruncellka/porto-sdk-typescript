/**
 * Product Resolver — data-driven product selection using the resolution graph.
 * Catalog identity is concrete `id`. Envelope filters physical fit.
 */

import type { PortoDataLoader, PortoProduct } from "../../data/loader.js";
import { PortoError, PortoErrorCode } from "../../errors.js";
import type { ServiceKind } from "../../kinds.js";
import { type DeliveryPreference, DeliveryResolver } from "./delivery-resolver.js";
import { resolutionFingerprint } from "./fingerprint.js";
import {
    bindRequestedServices,
    productMatchesUnmatchedKind,
    raiseServiceUnsupported,
} from "./service-resolver.js";
import type { ResolvedInput } from "./types.js";

function envelopeMatches(product: PortoProduct, envelopeId?: string | null): boolean {
    if (!envelopeId) return true;
    const wanted = envelopeId.trim().toUpperCase();
    const allowed = (product.envelope_ids ?? []).map((id) => id.toUpperCase());
    if (allowed.length === 0) return true;
    return allowed.includes(wanted);
}

function compareSpeedSortKeys(
    left: readonly [number, number],
    right: readonly [number, number],
): number {
    if (left[0] !== right[0]) return left[0] - right[0];
    return left[1] - right[1];
}

export class ProductResolver {
    private readonly deliveryResolver: DeliveryResolver;

    constructor(
        private readonly loader: PortoDataLoader,
        providerId: string,
    ) {
        this.deliveryResolver = new DeliveryResolver(loader, providerId);
    }

    findCandidates(
        zoneId: string,
        weightTierId: string,
        envelopeId?: string | null,
    ): PortoProduct[] {
        const index = this.loader.resolutionIndex;
        if (index) {
            const candidates: PortoProduct[] = [];
            for (const productId of index.candidates(zoneId, weightTierId)) {
                const product = this.loader.getProduct(productId);
                if (product && envelopeMatches(product, envelopeId)) candidates.push(product);
            }
            return candidates;
        }

        const candidates: PortoProduct[] = [];
        for (const product of this.loader.getAllProducts()) {
            if (!this.isResolvableProduct(product)) continue;
            if (!envelopeMatches(product, envelopeId)) continue;
            if (this.isValidCombination(product.id, zoneId, weightTierId)) {
                candidates.push(product);
            }
        }
        return candidates;
    }

    resolve(input: ResolvedInput): PortoProduct | undefined {
        const candidates = this.findCandidates(
            input.zone_id,
            input.weight_tier_id,
            input.envelope_id,
        );
        return this.selectProduct(candidates, input.zone_id, input.weight_tier_id, {
            productId: input.product_id,
            deliveryPreference: input.delivery_preference,
            indemnityTier: input.indemnity_tier,
            strategy: this.loader.resolutionGraph.strategy,
        });
    }

    applyServiceTokens(
        candidates: PortoProduct[],
        tokens: string[] | null | undefined,
        options: {
            indemnityTier?: string | null;
            zoneId: string;
            weightTierId: string;
            kinds?: string[] | null;
            serviceIds?: string[] | null;
        },
    ): { candidates: PortoProduct[]; serviceIds: string[]; services: ServiceKind[] } {
        const productId = candidates.length === 1 ? candidates[0]?.id : undefined;
        const { bound, selectedKinds, unmatched } = bindRequestedServices(this.loader, {
            kinds: options.kinds,
            serviceIds: options.serviceIds ?? tokens,
            zoneId: options.zoneId,
            productId,
        });
        let narrowed = candidates;
        for (const kind of unmatched) {
            const filtered = narrowed.filter((product) =>
                productMatchesUnmatchedKind(this.loader, product, kind),
            );
            if (filtered.length === 0) {
                raiseServiceUnsupported(kind, {
                    zoneId: options.zoneId,
                    productId,
                });
            }
            narrowed = filtered;
        }
        if (unmatched.some((k) => k === "registered")) {
            const indemnified = narrowed.filter((p) => p.indemnity);
            const tiers = new Set(indemnified.map((p) => p.indemnity?.tier).filter(Boolean));
            if (indemnified.length > 0 && !options.indemnityTier && tiers.size > 1) {
                throw new PortoError(
                    "Multiple registered products match; set indemnity_tier",
                    PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS,
                    400,
                    {
                        zone: options.zoneId,
                        weight_tier: options.weightTierId,
                        candidate_ids: indemnified.map((p) => p.id),
                    },
                );
            }
        }
        return { candidates: narrowed, serviceIds: bound, services: selectedKinds };
    }

    selectProduct(
        candidates: PortoProduct[],
        zoneId: string,
        weightTierId: string,
        options?: {
            productId?: string | null;
            deliveryPreference?: DeliveryPreference | null;
            indemnityTier?: string | null;
            strategy?: string | null;
        },
    ): PortoProduct | undefined {
        if (candidates.length === 0) return undefined;

        let narrowed = candidates;
        if (options?.productId) {
            narrowed = narrowed.filter((p) => p.id === options.productId);
            if (narrowed.length === 0) return undefined;
        }

        if (options?.indemnityTier) {
            narrowed = narrowed.filter((p) => p.indemnity?.tier === options.indemnityTier);
            if (narrowed.length === 0) return undefined;
        }

        if (narrowed.length === 1) return narrowed[0];

        let preference = options?.deliveryPreference ?? undefined;
        const strategy = options?.strategy ?? this.loader.resolutionGraph.strategy;
        if (!preference && strategy === "speed") preference = "fastest";
        else if (!preference && strategy === "min") preference = "cheapest";

        if (preference) {
            const selected = this.selectByPreference(narrowed, zoneId, weightTierId, preference);
            if (selected) return selected;
        }

        throw new PortoError(
            "Multiple products match zone and weight tier",
            PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS,
            400,
            {
                zone: zoneId,
                weight_tier: weightTierId,
                candidate_ids: narrowed.map((p) => p.id),
            },
        );
    }

    isValidCombination(productId: string, zoneId: string, weightTierId: string): boolean {
        const index = this.loader.resolutionIndex;
        if (index) {
            return index.isValidEdge(productId, zoneId, weightTierId);
        }
        return this.checkLinks(productId, zoneId, weightTierId, this.getLinks());
    }

    candidateFacts(product: PortoProduct, zoneId: string) {
        const hint = this.deliveryResolver.resolve(product, zoneId);
        return {
            product_id: product.id,
            delivery_hint: hint,
            fingerprint: resolutionFingerprint(product, zoneId),
            included_features: [...(product.included_features ?? [])],
            indemnity: product.indemnity
                ? { tier: product.indemnity.tier, max_amount: product.indemnity.max_amount }
                : null,
            tracking: product.tracking ?? null,
        };
    }

    private selectByPreference(
        candidates: PortoProduct[],
        zoneId: string,
        weightTierId: string,
        preference: DeliveryPreference,
    ): PortoProduct | undefined {
        if (preference === "cheapest") {
            return this.selectCheapest(candidates, zoneId, weightTierId);
        }
        if (preference === "fastest") {
            return candidates.reduce((best, current) =>
                compareSpeedSortKeys(
                    this.speedSortKey(current, zoneId, "fastest"),
                    this.speedSortKey(best, zoneId, "fastest"),
                ) < 0
                    ? current
                    : best,
            );
        }
        if (preference === "economy") {
            return candidates.reduce((best, current) =>
                compareSpeedSortKeys(
                    this.speedSortKey(current, zoneId, "economy"),
                    this.speedSortKey(best, zoneId, "economy"),
                ) > 0
                    ? current
                    : best,
            );
        }
        return undefined;
    }

    private selectCheapest(
        candidates: PortoProduct[],
        zoneId: string,
        weightTierId: string,
    ): PortoProduct | undefined {
        let best: PortoProduct | undefined;
        let bestPrice: number | undefined;

        for (const product of candidates) {
            const pricing = this.loader.getPriceByProductZoneWeightTier(
                product.id,
                zoneId,
                weightTierId,
            );
            if (pricing && (bestPrice === undefined || pricing.price < bestPrice)) {
                best = product;
                bestPrice = pricing.price;
            }
        }

        return best;
    }

    private isResolvableProduct(product: PortoProduct): boolean {
        const index = this.loader.resolutionIndex;
        if (index?.hasGraphEdge(product.id)) {
            return true;
        }
        return Boolean(
            product.mark_type === "stamp" ||
                product.mark_type === "label" ||
                product.envelope_ids?.length,
        );
    }

    private speedSortKey(
        product: PortoProduct,
        zoneId: string,
        mode: "fastest" | "economy",
    ): readonly [number, number] {
        const hint = this.deliveryResolver.resolve(product, zoneId);
        if (!hint) {
            return mode === "fastest" ? [999, 999] : [-1, -1];
        }
        const daysMin = hint.daysMin ?? hint.daysMax;
        return [hint.daysMax, daysMin];
    }

    private getLinks(): Record<string, { zones?: string[]; weight_tiers?: string[] }> {
        return this.loader.resolutionGraph.links || {};
    }

    private checkLinks(
        productId: string,
        zoneId: string,
        weightTierId: string,
        links: Record<string, { zones?: string[]; weight_tiers?: string[] }>,
    ): boolean {
        const productLinks = links[productId] || {};
        const validZones = productLinks.zones || [];
        const validTiers = productLinks.weight_tiers || [];
        return validZones.includes(zoneId) && validTiers.includes(weightTierId);
    }
}

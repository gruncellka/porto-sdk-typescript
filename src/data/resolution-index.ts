/** Graph-indexed product lookup from graph.edges.products: (zone, weight_tier) → product ids. */

import type { PortoProduct } from "./entities/products";

type GraphLinks = Record<string, { zones?: string[]; weight_tiers?: string[] }>;

export class ResolutionIndex {
    private readonly byEdge = new Map<string, string[]>();
    private readonly graphProductIds = new Set<string>();
    private readonly tiersByZone = new Map<string, Set<string>>();

    static build(links: GraphLinks, _products: PortoProduct[]): ResolutionIndex {
        const index = new ResolutionIndex();
        for (const [productId, edge] of Object.entries(links)) {
            index.graphProductIds.add(productId);
            for (const zoneId of edge.zones ?? []) {
                for (const tierId of edge.weight_tiers ?? []) {
                    const key = `${zoneId}:${tierId}`;
                    const bucket = index.byEdge.get(key) ?? [];
                    bucket.push(productId);
                    index.byEdge.set(key, bucket);
                    const tiers = index.tiersByZone.get(zoneId) ?? new Set<string>();
                    tiers.add(tierId);
                    index.tiersByZone.set(zoneId, tiers);
                }
            }
        }
        return index;
    }

    candidates(zoneId: string, weightTierId: string): string[] {
        return [...(this.byEdge.get(`${zoneId}:${weightTierId}`) ?? [])];
    }

    weightTierIds(zoneId: string): string[] {
        return [...(this.tiersByZone.get(zoneId) ?? [])];
    }

    isValidEdge(productId: string, zoneId: string, weightTierId: string): boolean {
        return (this.byEdge.get(`${zoneId}:${weightTierId}`) ?? []).includes(productId);
    }

    hasGraphEdge(productId: string): boolean {
        return this.graphProductIds.has(productId);
    }
}

/**
 * Weight Tier Resolver - Resolves weight_tier_id from weight in grams.
 *
 * Uses lookup_rules.weight_resolution: find tier where min <= weight <= max.
 */

import type { PortoDataLoader } from "../../data/loader.js";

export class WeightTierResolver {
    constructor(private readonly loader: PortoDataLoader) {}

    resolve(weight: number): string | undefined {
        const weightTiers = this.loader.getAllWeightTiers();
        const sorted = [...weightTiers].sort((a, b) => a.max_weight - b.max_weight);
        for (let i = 0; i < sorted.length; i++) {
            const tier = sorted[i];
            const minWeight = i === 0 ? 0 : sorted[i - 1].max_weight + 1;
            if (minWeight <= weight && weight <= tier.max_weight) {
                return tier.id;
            }
        }
        return undefined;
    }
}

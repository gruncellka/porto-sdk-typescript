/** Weight tiers entity loader */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoWeightTier {
    id: string;
    max_weight: number;
    /** Tier lower bound in grams (`weights.json` `min`), surfaced in resolution output. */
    min?: number;
}

export class WeightTiersLoader extends BaseEntityLoader {
    private weightTiers: PortoWeightTier[] = [];

    load(data: EntityData): void {
        const weightTiersData = data.weight_tiers ?? {};
        this.weightTiers = Object.entries(weightTiersData as Record<string, EntityData>).map(
            ([tierId, tierData]) => ({
                id: tierId,
                max_weight: Number(tierData.max ?? tierData.max_weight ?? 0),
                min: Number(tierData.min ?? 0),
            }),
        );
    }

    getData(): PortoWeightTier[] {
        return this.weightTiers;
    }

    getWeightTier(tierId: string): PortoWeightTier | undefined {
        return this.weightTiers.find((wt) => wt.id === tierId);
    }

    getAllWeightTiers(): PortoWeightTier[] {
        return this.weightTiers;
    }
}

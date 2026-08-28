/**
 * Features Entity Loader
 */

import { type FeatureKind, parseFeatureKind } from "../../kinds.js";
import { type Requirement, parseRequiresList } from "../../requires.js";
import { BaseEntityLoader, type EntityData } from "./base";

export interface Feature {
    id: string;
    kind: FeatureKind;
    name: string;
    label: string;
    description: string;
    requires: Requirement[];
    product_ids: string[];
    zone_ids: string[];
}

function parseFeature(row: EntityData): Feature {
    const productIds = row.product_ids;
    const zoneIds = row.zone_ids;
    return {
        id: String(row.id),
        kind: parseFeatureKind(row.kind, "features.kind"),
        name: String(row.name ?? row.id),
        label: String(row.label ?? row.name ?? row.id),
        description: String(row.description ?? ""),
        requires: parseRequiresList(row.requires, "features.requires"),
        product_ids: Array.isArray(productIds) ? productIds.map(String) : [],
        zone_ids: Array.isArray(zoneIds) ? zoneIds.map(String) : [],
    };
}

export class FeaturesLoader extends BaseEntityLoader {
    private features: Feature[] = [];

    load(data: EntityData): void {
        this.features = (data.features || []).map((row: EntityData) => parseFeature(row));
    }

    getData(): Feature[] {
        return this.features;
    }

    getFeature(featureId: string): Feature | null {
        return this.features.find((f) => f.id === featureId) || null;
    }

    getFeaturesForProduct(productId: string): Feature[] {
        return this.features.filter((item) => item.product_ids.includes(productId));
    }

    getFeaturesForZone(zoneId: string): Feature[] {
        return this.features.filter((item) => item.zone_ids.includes(zoneId));
    }

    getAllFeatures(): Feature[] {
        return this.features;
    }
}

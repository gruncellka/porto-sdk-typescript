/**
 * Services Entity Loader
 */

import { type ServiceKind, parseServiceKind } from "../../kinds.js";
import { type Requirement, parseRequiresList } from "../../requires.js";
import { BaseEntityLoader, type EntityData } from "./base";

export interface Service {
    id: string;
    kind: ServiceKind;
    name: string;
    label: string;
    description: string;
    features: string[];
    requires: Requirement[];
    supported_zones: string[];
    combinable_with?: string[] | null;
    product_ids: string[];
}

function parseService(row: EntityData): Service {
    const combinable = row.combinable_with;
    const productIds = row.product_ids;
    return {
        id: String(row.id),
        kind: parseServiceKind(row.kind, "services.kind"),
        name: String(row.name ?? row.id),
        label: String(row.label ?? row.name ?? row.id),
        description: String(row.description ?? ""),
        features: Array.isArray(row.features) ? row.features.map(String).filter(Boolean) : [],
        requires: parseRequiresList(row.requires, "services.requires"),
        supported_zones: Array.isArray(row.supported_zones)
            ? row.supported_zones.map(String).filter(Boolean)
            : [],
        combinable_with: Array.isArray(combinable) ? combinable.map(String) : null,
        product_ids: Array.isArray(productIds) ? productIds.map(String) : [],
    };
}

export class ServicesLoader extends BaseEntityLoader {
    private services: Service[] = [];

    load(data: EntityData): void {
        this.services = (data.services || []).map((row: EntityData) => parseService(row));
    }

    getData(): Service[] {
        return this.services;
    }

    getService(serviceId: string): Service | null {
        return this.services.find((s) => s.id === serviceId) || null;
    }

    getServicesForProduct(productId: string): Service[] {
        return this.services.filter(
            (item) => item.product_ids.length === 0 || item.product_ids.includes(productId),
        );
    }

    getServicesForZone(zoneId: string): Service[] {
        return this.services.filter(
            (s) => s.supported_zones.length === 0 || s.supported_zones.includes(zoneId),
        );
    }

    getAllServices(): Service[] {
        return this.services;
    }
}

/**
 * Canonical Porto JSON mapping for CLI --json.
 * Mirrors the public Porto object field-for-field — not a separate CLI DTO.
 */

import type { Feature } from "../data/entities/features.js";
import type { PortoProduct } from "../data/entities/products.js";
import type { Service } from "../data/entities/services.js";
import type { PortoWeightTier } from "../data/entities/weight-tiers.js";
import type { PortoZone } from "../data/entities/zones.js";
import type { Porto } from "../services/porto-resolver.js";
import type { DeliveryHint } from "../services/resolution/delivery-resolver.js";
import type { PriceComponent } from "../services/resolution/quote.js";
import type {
    JurisdictionInstrument,
    LegalRestriction,
    Restrictions,
    RoutingRestriction,
} from "../services/restrictions/types.js";

/** Top-level keys on canonical CLI/SDK Porto JSON (camelCase). */
export const PORTO_JSON_KEYS = [
    "product",
    "zone",
    "weightTier",
    "amount",
    "currency",
    "components",
    "features",
    "availableServices",
    "isValid",
    "warnings",
    "restrictions",
    "deliveryHint",
    "markType",
    "tracking",
    "requires",
    "services",
    "serviceIds",
] as const;

function serializeJurisdictionInstrument(row: JurisdictionInstrument): Record<string, unknown> {
    return {
        jurisdiction: row.jurisdiction,
        reference: row.reference,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
    };
}

function serializeLegalRestriction(row: LegalRestriction): Record<string, unknown> {
    return {
        impact: row.impact,
        countryCode: row.countryCode,
        regionCode: row.regionCode ?? null,
        partial: row.partial,
        jurisdictions: row.jurisdictions.map(serializeJurisdictionInstrument),
        reason: row.reason,
        description: row.description,
    };
}

function serializeRoutingRestriction(row: RoutingRestriction): Record<string, unknown> {
    return {
        impact: row.impact,
        countryCode: row.countryCode,
        regionCode: row.regionCode ?? null,
        partial: row.partial,
        authority: row.authority,
        reference: row.reference,
        reason: row.reason,
        description: row.description,
    };
}

function serializeRestrictions(restrictions: Restrictions): Record<string, unknown> {
    return {
        impact: restrictions.impact,
        legal: restrictions.legal.map(serializeLegalRestriction),
        routing: restrictions.routing.map(serializeRoutingRestriction),
    };
}

function serializePortoProduct(product: PortoProduct): Record<string, unknown> {
    return {
        id: product.id,
        name: product.name,
        envelope_ids: product.envelope_ids,
        zones: product.zones,
        weight_tier: product.weight_tier ?? null,
        effective_from: product.effective_from,
        effective_to: product.effective_to,
        provider_mappings: product.provider_mappings ?? null,
        mark_type: product.mark_type ?? null,
        tracking: product.tracking ?? null,
        label: product.label ?? null,
        delivery: product.delivery,
        included_features: product.included_features,
        indemnity: product.indemnity ?? null,
        requires: [...product.requires],
    };
}

function serializePortoZone(zone: PortoZone): Record<string, unknown> {
    return {
        id: zone.id,
        name: zone.name,
        description: zone.description,
        country_codes: zone.country_codes,
        label: zone.label ?? null,
    };
}

function serializePortoWeightTier(weightTier: PortoWeightTier): Record<string, unknown> {
    return {
        id: weightTier.id,
        max_weight: weightTier.max_weight,
        ...(weightTier.min != null ? { min: weightTier.min } : {}),
    };
}

function serializePriceComponent(component: PriceComponent): Record<string, unknown> {
    return {
        kind: component.kind,
        id: component.id,
        amount: component.amount,
    };
}

function serializeFeature(feature: Feature): Record<string, unknown> {
    return {
        id: feature.id,
        kind: feature.kind,
        name: feature.name,
        label: feature.label,
        description: feature.description,
        requires: [...feature.requires],
        product_ids: feature.product_ids,
        zone_ids: feature.zone_ids,
    };
}

function serializeService(service: Service): Record<string, unknown> {
    return {
        id: service.id,
        kind: service.kind,
        name: service.name,
        label: service.label,
        description: service.description,
        features: [...service.features],
        requires: [...service.requires],
        supported_zones: [...service.supported_zones],
        combinable_with: service.combinable_with ?? null,
        product_ids: [...service.product_ids],
    };
}

function serializeDeliveryHint(hint: DeliveryHint): Record<string, unknown> {
    return {
        span: hint.span,
        daysMax: hint.daysMax,
        daysMin: hint.daysMin ?? null,
        workingDays: {
            market: hint.workingDays.market,
            weekdays: hint.workingDays.weekdays,
            excludePublicHolidays: hint.workingDays.excludePublicHolidays,
        },
    };
}

export function serializePorto(porto: Porto): Record<string, unknown> {
    return {
        product: serializePortoProduct(porto.product),
        zone: serializePortoZone(porto.zone),
        weightTier: serializePortoWeightTier(porto.weightTier),
        amount: porto.amount,
        currency: porto.currency,
        components: porto.components.map(serializePriceComponent),
        features: porto.features.map(serializeFeature),
        availableServices: porto.availableServices.map(serializeService),
        isValid: porto.isValid,
        warnings: [...porto.warnings],
        restrictions: serializeRestrictions(porto.restrictions),
        deliveryHint: porto.deliveryHint != null ? serializeDeliveryHint(porto.deliveryHint) : null,
        markType: porto.markType ?? null,
        tracking: porto.tracking ?? null,
        requires: [...porto.requires],
        services: [...porto.services],
        serviceIds: [...porto.serviceIds],
    };
}

/** Presentation projection for styled resolve output — not the public Porto contract. */
export function portoHumanSummary(porto: Porto): Record<string, unknown> {
    const summary: Record<string, unknown> = {
        product: { id: porto.product.id, name: porto.product.name },
        zone: { id: porto.zone.id, name: porto.zone.name },
        price: { amount: porto.amount, currency: porto.currency },
        tracking: porto.tracking ?? null,
        restrictions: serializeRestrictions(porto.restrictions),
    };
    if (porto.warnings.length > 0) {
        summary.warnings = [...porto.warnings];
    }
    return summary;
}

export function assertPortoJsonShape(payload: Record<string, unknown>): void {
    const keys = Object.keys(payload).sort();
    const expected = [...PORTO_JSON_KEYS].sort();
    if (keys.join("\0") !== expected.join("\0")) {
        throw new Error(
            `Porto JSON shape mismatch.\nexpected: ${expected.join(", ")}\nactual:   ${keys.join(", ")}`,
        );
    }
    if ("price" in payload) {
        throw new Error("Porto JSON must not use CLI-only price nest");
    }
}

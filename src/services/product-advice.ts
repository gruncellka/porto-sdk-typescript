/**
 * Catalog weight → product recommendation (hard AUTO_UPGRADE / soft larger_than_needed).
 * Reads max_weight from porto-data via PortoResolver — apps must not fork this policy.
 */

import type { PortoResolver } from "./porto-resolver.js";
import type {
    Advice,
    AdviceReason,
    RecommendProductForWeightInput,
} from "./product-option-types.js";

type CatalogProduct = {
    id: string;
    name: string;
    max_weight: number | null;
};

function catalogProducts(
    resolver: PortoResolver,
    candidateProductIds?: readonly string[] | null,
): CatalogProduct[] {
    const providerId = resolver.providerId;
    const allow =
        candidateProductIds != null && candidateProductIds.length > 0
            ? new Set(candidateProductIds)
            : null;
    const rows: CatalogProduct[] = [];
    for (const product of resolver.listProducts()) {
        if (allow && !allow.has(product.id)) continue;
        const constraints = resolver.getProductConstraints(product.id);
        const maxWeight = constraints.max_weight;
        rows.push({
            id: product.id,
            name: product.name,
            max_weight:
                typeof maxWeight === "number"
                    ? maxWeight
                    : maxWeight == null
                      ? null
                      : Number(maxWeight),
        });
    }
    return rows.sort(
        (a, b) =>
            (a.max_weight ?? Number.MAX_SAFE_INTEGER) - (b.max_weight ?? Number.MAX_SAFE_INTEGER),
    );
}

function eligibleForWeight(product: CatalogProduct, weight: number): boolean {
    return product.max_weight == null || weight <= product.max_weight;
}

/** Smallest catalog product whose max_weight still covers `weight`. */
export function suggestProductForWeight(
    resolver: PortoResolver,
    weight: number,
    candidateProductIds?: readonly string[] | null,
): CatalogProduct | null {
    const eligible = catalogProducts(resolver, candidateProductIds).filter((p) =>
        eligibleForWeight(p, weight),
    );
    return eligible[0] ?? null;
}

/**
 * Recommend product for billing weight.
 * Hard: selected max exceeded + heavier peer → AUTO_UPGRADE.
 * Soft: selected heavier than needed → KEEP + larger_than_needed.
 */
export function recommendProductForWeight(
    resolver: PortoResolver,
    input: RecommendProductForWeightInput,
): Advice {
    const weight = input.weight;
    const selectedId = input.selectedProductId?.trim() || null;
    const products = catalogProducts(resolver, input.candidateProductIds);
    const suggested = suggestProductForWeight(resolver, weight, input.candidateProductIds);

    const selected = selectedId ? (products.find((row) => row.id === selectedId) ?? null) : null;

    if (!selected) {
        const fallback = suggested ?? products[0] ?? null;
        const effectiveId = fallback?.id ?? null;
        const upgrade = effectiveId != null && effectiveId !== selectedId ? "AUTO_UPGRADE" : "KEEP";
        return {
            action: upgrade,
            selectedProductId: selectedId,
            effectiveProductId: effectiveId,
            suggestedProductId: suggested?.id ?? null,
            reason: upgrade === "AUTO_UPGRADE" ? "weight_over" : null,
            selectedMaxWeight: null,
            suggestedMaxWeight: suggested?.max_weight ?? null,
            selectedProductName: null,
            suggestedProductName: suggested?.name ?? null,
        };
    }

    const weightOver = selected.max_weight != null && weight > selected.max_weight;

    if (weightOver) {
        const upgrade =
            suggested != null && suggested.id !== selected.id
                ? ("AUTO_UPGRADE" as const)
                : ("KEEP" as const);
        return {
            action: upgrade,
            selectedProductId: selected.id,
            effectiveProductId: upgrade === "AUTO_UPGRADE" ? (suggested?.id ?? null) : selected.id,
            suggestedProductId: suggested?.id ?? null,
            reason: "weight_over",
            selectedMaxWeight: selected.max_weight,
            suggestedMaxWeight: suggested?.max_weight ?? null,
            selectedProductName: selected.name,
            suggestedProductName: suggested?.name ?? null,
        };
    }

    let reason: AdviceReason | null = null;
    if (
        suggested &&
        suggested.id !== selected.id &&
        suggested.max_weight != null &&
        selected.max_weight != null &&
        selected.max_weight > suggested.max_weight
    ) {
        reason = "larger_than_needed";
    }

    return {
        action: "KEEP",
        selectedProductId: selected.id,
        effectiveProductId: selected.id,
        suggestedProductId: suggested?.id ?? null,
        reason,
        selectedMaxWeight: selected.max_weight,
        suggestedMaxWeight: suggested?.max_weight ?? null,
        selectedProductName: selected.name,
        suggestedProductName: suggested?.name ?? null,
    };
}

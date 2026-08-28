import { PortoError, PortoErrorCode } from "../errors.js";
import { raiseTooHeavy } from "../errors/domains/resolution.js";
import type { PortoResolver } from "./porto-resolver.js";
import type { Estimate, EstimateForProductInput } from "./product-estimates.js";
import type {
    ListProductOptionsInput,
    ProductIndemnityOption,
    ProductOption,
} from "./product-option-types.js";

function productAllowedForEnvelope(
    allowedEnvelopeIds: string[],
    envelopeId: string | null | undefined,
): boolean {
    if (!envelopeId) return true;
    const formatKey = envelopeId.trim().toUpperCase();
    if (!allowedEnvelopeIds.length) return true;
    return allowedEnvelopeIds.some((id) => id.toUpperCase() === formatKey);
}

function providerCurrency(resolver: PortoResolver): string {
    const graph = resolver.getGraph();
    const unit = graph.unit as { currency?: string } | undefined;
    return unit?.currency ?? "EUR";
}

function quoteCurrency(
    resolver: PortoResolver,
    pricing: { currency?: string | null } | null | undefined,
): string {
    const fromRow = pricing?.currency?.trim();
    if (fromRow) return fromRow.toUpperCase();
    return providerCurrency(resolver);
}

function indemnityFromFacts(
    indemnity: { tier: string; max_amount: number } | null | undefined,
): ProductIndemnityOption | null {
    if (!indemnity) return null;
    return { tier: indemnity.tier, maxAmount: indemnity.max_amount };
}

export function listProductOptions(
    resolver: PortoResolver,
    input: ListProductOptionsInput,
): ProductOption[] {
    const zone = resolver.resolveZone(input.countryCode.trim().toUpperCase());
    const weightTierId = resolver.weightTierResolver.resolve(input.weight);
    if (!weightTierId) return [];

    const productResolver = resolver.productResolver;
    const providerId = resolver.providerId;
    const options: ProductOption[] = [];

    for (const product of resolver.listProducts()) {
        const constraints = resolver.getProductConstraints(product.id);
        const allowed = (constraints.allowed_envelope_ids as string[]) ?? [];
        if (!productAllowedForEnvelope(allowed, input.envelopeId)) continue;
        if (!productResolver.isValidCombination(product.id, zone.id, weightTierId)) continue;

        const pricing = resolver.getPriceByProductZoneWeightTier(product.id, zone.id, weightTierId);
        const facts = productResolver.candidateFacts(product, zone.id);
        const maxWeight = constraints.max_weight as number | null | undefined;

        options.push({
            id: product.id,
            providerId: providerId,
            name: product.name,
            allowedEnvelopeIds: allowed,
            markType: product.mark_type ?? null,
            tracking: product.tracking ?? null,
            maxWeight: maxWeight ?? null,
            indemnity: indemnityFromFacts(facts.indemnity),
            amount: pricing?.price ?? null,
            currency: quoteCurrency(resolver, pricing),
            deliveryHint: facts.delivery_hint ?? null,
            services: resolver.listServiceOptionsForProductZone(product.id, zone.id),
        });
    }

    return options;
}

export function estimateForProduct(
    resolver: PortoResolver,
    input: EstimateForProductInput,
): Estimate {
    const zone = resolver.resolveZone(input.countryCode.trim().toUpperCase());
    const weightTierId = resolver.weightTierResolver.resolve(input.weight);
    if (!weightTierId) {
        raiseTooHeavy(`Weight ${input.weight} does not match any weight tier`, {
            weight: input.weight,
            statusCode: 400,
        });
    }

    const product = resolver.getProduct(input.productId);
    if (!product) {
        throw new PortoError(
            `Unknown product: ${input.productId}`,
            PortoErrorCode.PORTO_DATA_NOT_FOUND,
            404,
        );
    }

    if (!resolver.productResolver.isValidCombination(product.id, zone.id, weightTierId)) {
        throw new PortoError(
            `Product ${input.productId} not valid for zone ${zone.id} and weight tier ${weightTierId}`,
            PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
            422,
        );
    }

    const pricing = resolver.getPriceByProductZoneWeightTier(product.id, zone.id, weightTierId);
    if (!pricing) {
        throw new PortoError(
            `No tariff for ${input.productId} / ${zone.id} / ${weightTierId}`,
            PortoErrorCode.PORTO_PRICE_NOT_FOUND,
            404,
        );
    }

    const facts = resolver.productResolver.candidateFacts(product, zone.id);
    return {
        productId: product.id,
        zoneId: zone.id,
        weightTierId: weightTierId,
        weight: input.weight,
        amount: pricing.price,
        currency: quoteCurrency(resolver, pricing),
        deliveryHint: facts.delivery_hint ?? null,
    };
}

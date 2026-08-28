/**
 * PortoResolver — which Porto applies?
 *
 * ONE pipeline for all providers: restriction → zone → weight_tier → product → price → enrich.
 * Does not own format Match (EnvelopeResolver) or wire/mark binding (ExecutionBinding).
 */

import type { CacheConfig } from "../config.js";
import type { PostalResolutionContext } from "../data/context.js";
import type { PortoEnvelope } from "../data/entities/envelopes.js";
import type { Feature } from "../data/entities/features.js";
import type { Service } from "../data/entities/services.js";
import type { PortoPricing, PortoProduct, PortoWeightTier, PortoZone } from "../data/loader.js";
import type { PortoDataLoader } from "../data/loader.js";
import type { DomainIds } from "../data/validator.js";
import { PortoError, PortoErrorCode } from "../errors.js";
import { raiseDataNotFound } from "../errors/domains/data.js";
import {
    raiseDestinationInvalid,
    raisePriceNotFound,
    raiseProductNotFound,
    raiseTooHeavy,
} from "../errors/domains/resolution.js";
import type { MarkType, TrackingMode } from "../execution/index.js";
import type { ServiceKind } from "../kinds.js";
import { type Requirement, merge as mergeRequires, tokens as requireTokens } from "../requires.js";
import { seconds } from "../time.js";
import type { Dimensions } from "../types/index.js";
import { resolveMarkProfileId } from "./mark-resolution.js";
import type { ServiceOption } from "./product-option-types.js";
import {
    type DeliveryHint,
    type DeliveryPreference,
    DeliveryResolver,
    FeatureResolver,
    PortoCatalog,
    ProductResolver,
    ResolutionCache,
    ServiceResolver,
    WeightTierResolver,
    ZoneResolver,
    validateServiceSelection,
} from "./resolution/index.js";
import type { PriceComponent } from "./resolution/quote.js";
import { composeQuote } from "./resolution/quote.js";
import type { Restrictions } from "./restrictions/index.js";
import { forDestination } from "./restrictions/index.js";

export interface ResolutionRequest {
    countryCode: string;
    weight: number;
    productId?: string;
    envelopeId?: string;
    dimensions?: Dimensions;
    deliveryPreference?: DeliveryPreference;
    indemnityTier?: string;
    services?: ServiceKind[];
    serviceIds?: string[];
}

interface ResolutionResult<T> {
    isValid: boolean;
    data?: T;
    errors?: string[];
    warnings?: string[];
    [key: string]: any;
}

export interface Porto {
    product: PortoProduct;
    zone: PortoZone;
    weightTier: PortoWeightTier;
    amount: number;
    currency: string;
    components: PriceComponent[];
    features: Feature[];
    availableServices: Service[];
    isValid: boolean;
    warnings: string[];
    restrictions: Restrictions;
    deliveryHint?: DeliveryHint;
    markType?: MarkType;
    tracking?: TrackingMode;
    requires: readonly Requirement[];
    services: readonly ServiceKind[];
    serviceIds: readonly string[];
}

export class PortoResolver {
    private cache: ResolutionCache;
    readonly catalog: PortoCatalog;

    private _productResolver: ProductResolver;
    private _weightTierResolver: WeightTierResolver;
    private _zoneResolver: ZoneResolver;
    private _featureResolver: FeatureResolver;
    private _serviceResolver: ServiceResolver;
    private _deliveryResolver: DeliveryResolver;

    /** @internal SDK tests and product-options only — not for app reach-through. */
    get dataLoader(): PortoDataLoader {
        return this.context.loader;
    }

    /** @internal For pricing via PriceResolver */
    /** @internal SDK tests and product-options only — not for app reach-through */
    get productResolver(): ProductResolver {
        return this._productResolver;
    }

    /** @internal For weight tier resolution */
    get weightTierResolver(): WeightTierResolver {
        return this._weightTierResolver;
    }

    get providerId(): string {
        return this.context.providerId;
    }

    constructor(
        private context: PostalResolutionContext,
        private validator: DomainIds,
        cacheConfig?: Partial<CacheConfig>,
    ) {
        const defaultConfig: CacheConfig = {
            enabled: true,
            ttl: seconds(300),
            maxSize: 1000,
        };
        this.cache = new ResolutionCache({ ...defaultConfig, ...cacheConfig });
        const loader = context.loader;
        this._productResolver = new ProductResolver(loader, context.providerId);
        this._deliveryResolver = new DeliveryResolver(loader, context.providerId);
        this._weightTierResolver = new WeightTierResolver(loader);
        this._zoneResolver = new ZoneResolver(validator);
        this._featureResolver = new FeatureResolver(loader);
        this._serviceResolver = new ServiceResolver(loader);
        this.catalog = new PortoCatalog(loader, this._serviceResolver);
    }

    async resolve(request: ResolutionRequest): Promise<Porto> {
        const cacheKey = this.cache.generateKey(this.context.providerId, request);

        const cached = this.cache.get<Porto>(cacheKey);
        if (cached) {
            return cached;
        }

        const envelopeId = this.envelopeIdFromRequest(request);

        // 1. Country-level restriction facts — same payload as restrictions.check(country).
        // Region drill-down is only via restrictions.check(country, region).
        const destinationRestrictions = forDestination(this.dataLoader, request.countryCode, null, {
            providerId: this.context.providerId,
        });

        // 2. Zone resolution
        const zoneResult = this.resolveZoneInternal(request.countryCode);
        if (!zoneResult.isValid) {
            raiseDestinationInvalid(`Invalid country code: ${request.countryCode}`, {
                countryCode: request.countryCode,
                statusCode: 400,
                details: { errors: zoneResult.errors },
            });
        }
        const zone = zoneResult.data?.zone;
        if (!zone) {
            raiseDestinationInvalid(`Invalid country code: ${request.countryCode}`, {
                countryCode: request.countryCode,
                statusCode: 400,
                details: { errors: zoneResult.errors },
            });
        }

        // 3. Weight tier resolution
        const weightTierId = this._weightTierResolver.resolve(request.weight);
        if (!weightTierId) {
            raiseTooHeavy(`Weight ${request.weight}g does not match any weight tier`, {
                weight: request.weight,
                statusCode: 400,
            });
        }

        const weightTier = this.dataLoader.getWeightTier(weightTierId);
        if (!weightTier) {
            raiseDataNotFound(`Weight tier ${weightTierId} not found`, {
                entityId: weightTierId,
            });
        }

        if (request.weight > weightTier.max_weight) {
            raiseTooHeavy(`Weight ${request.weight}g exceeds limit ${weightTier.max_weight}g`, {
                weight: request.weight,
                maxWeight: weightTier.max_weight,
                statusCode: 400,
            });
        }

        // 4–5. Product discovery and selection
        let product: PortoProduct;
        let mappedServiceIds: string[] = [];
        let selectedKinds: ServiceKind[] = [];
        if (request.productId) {
            const explicit = this.dataLoader.getProduct(request.productId);
            if (!explicit) {
                raiseProductNotFound(
                    `Invalid productId=${request.productId} for zone=${zone.id}, weight_tier=${weightTierId}`,
                    {
                        zoneId: zone.id,
                        weightTierId,
                        productId: request.productId,
                        statusCode: 400,
                    },
                );
            }
            if (!this._productResolver.isValidCombination(explicit.id, zone.id, weightTierId)) {
                this.raiseUnresolvedProduct({
                    zoneId: zone.id,
                    weightTierId,
                    weight: request.weight,
                    message: `Invalid productId=${request.productId} for zone=${zone.id}, weight_tier=${weightTierId}`,
                    productId: request.productId,
                });
            }
            let candidates = [explicit];
            try {
                const applied = this._productResolver.applyServiceTokens(candidates, null, {
                    indemnityTier: request.indemnityTier,
                    zoneId: zone.id,
                    weightTierId,
                    kinds: request.services,
                    serviceIds: request.serviceIds,
                });
                candidates = applied.candidates;
                mappedServiceIds = applied.serviceIds;
                selectedKinds = applied.services;
            } catch (error) {
                if (
                    error instanceof PortoError &&
                    error.code === PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS
                ) {
                    this.enrichAmbiguousError(error, candidates, zone.id);
                }
                throw error;
            }
            if (candidates.length === 0) {
                this.raiseUnresolvedProduct({
                    zoneId: zone.id,
                    weightTierId,
                    weight: request.weight,
                    message: `Invalid productId=${request.productId} for zone=${zone.id}, weight_tier=${weightTierId}`,
                    productId: request.productId,
                });
            }
            product = candidates[0]!;
        } else {
            let candidates = this._productResolver.findCandidates(
                zone.id,
                weightTierId,
                envelopeId,
            );
            try {
                const applied = this._productResolver.applyServiceTokens(candidates, null, {
                    indemnityTier: request.indemnityTier,
                    zoneId: zone.id,
                    weightTierId,
                    kinds: request.services,
                    serviceIds: request.serviceIds,
                });
                candidates = applied.candidates;
                mappedServiceIds = applied.serviceIds;
                selectedKinds = applied.services;
            } catch (error) {
                if (
                    error instanceof PortoError &&
                    error.code === PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS
                ) {
                    this.enrichAmbiguousError(error, candidates, zone.id);
                }
                throw error;
            }
            if (candidates.length === 0) {
                const validProducts = Object.keys(this.dataLoader.resolutionGraph.links || {});
                this.raiseUnresolvedProduct({
                    zoneId: zone.id,
                    weightTierId,
                    weight: request.weight,
                    message: `No product for zone=${zone.id}, weight_tier=${weightTierId}`,
                    details: { available_products: validProducts },
                });
            }
            try {
                const selected = this._productResolver.selectProduct(
                    candidates,
                    zone.id,
                    weightTierId,
                    {
                        deliveryPreference: request.deliveryPreference,
                        indemnityTier: request.indemnityTier,
                        strategy: this.dataLoader.resolutionGraph.strategy,
                    },
                );
                if (!selected) {
                    this.raiseUnresolvedProduct({
                        zoneId: zone.id,
                        weightTierId,
                        weight: request.weight,
                        message: `No product for zone=${zone.id}, weight_tier=${weightTierId}`,
                    });
                }
                product = selected;
            } catch (error) {
                if (
                    error instanceof PortoError &&
                    error.code === PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS
                ) {
                    this.enrichAmbiguousError(error, candidates, zone.id);
                }
                throw error;
            }
        }

        const deliveryHint = this._deliveryResolver.resolve(product, zone.id);

        // 6. Base price lookup
        const pricing = this.dataLoader.getPriceByProductZoneWeightTier(
            product.id,
            zone.id,
            weightTierId,
        );
        if (!pricing) {
            raisePriceNotFound(`No price for ${product.id} / ${zone.id} / ${weightTierId}`, {
                productId: product.id,
                zoneId: zone.id,
                weightTierId,
                statusCode: 500,
            });
        }

        // 7. Currency from price row (international USD) or graph default
        const currency =
            (typeof pricing.currency === "string" && pricing.currency.trim()
                ? pricing.currency.trim().toUpperCase()
                : null) ??
            this.dataLoader.resolutionGraph.unit?.currency ??
            "EUR";

        // 8. Features and services
        const featuresResult = this._featureResolver.resolve(product.id, zone.id);
        const servicesResult = this._serviceResolver.resolve(product.id, zone.id);

        if (mappedServiceIds.length) {
            this.validateServiceSelection(mappedServiceIds, product.id, zone.id);
        }
        const { requires } = this.bindRequires(
            product,
            featuresResult.data?.features,
            mappedServiceIds,
            zone.id,
        );
        const profile = this.resolvedMarkProfile(zone.id, mappedServiceIds);

        const quote = composeQuote({
            productId: product.id,
            productAmount: pricing.price,
            zoneId: zone.id,
            weightTierId,
            serviceIds: mappedServiceIds,
            lookupServicePrice: (serviceId, zoneId) => this.getServicePrice(serviceId, zoneId),
        });

        const porto: Porto = {
            product,
            zone,
            weightTier,
            amount: quote.amount,
            currency,
            components: quote.components,
            features: (featuresResult.data?.features ?? []) as Feature[],
            availableServices: servicesResult.data?.services ?? [],
            isValid: true,
            warnings: [],
            restrictions: destinationRestrictions,
            deliveryHint: deliveryHint,
            markType: profile?.mark_type ?? product.mark_type,
            tracking: product.tracking,
            requires: [...requires].sort(),
            services: selectedKinds,
            serviceIds: mappedServiceIds,
        };

        this.cache.set(cacheKey, porto);
        return porto;
    }

    private resolvedMarkProfile(zoneId: string, serviceIds?: string[] | null) {
        const graph = this.dataLoader.resolutionGraph;
        const fallback = this.dataLoader.getDefaultMarkProfile();
        const profileId = resolveMarkProfileId({
            markEdges: graph.mark_edges ?? {},
            zoneId,
            serviceIds,
            defaultProfileId: fallback?.id ?? null,
        });
        if (profileId) {
            const found = this.dataLoader.getMarkProfile(profileId);
            if (found) return found;
        }
        return fallback;
    }

    private bindRequires(
        product: PortoProduct,
        features: unknown,
        serviceIds: string[] | undefined,
        zoneId: string,
    ): { requires: Set<Requirement>; services: string[] } {
        const groups: Array<Iterable<string>> = [product.requires ?? []];
        const featureRows = Array.isArray(features) ? features : [];
        for (const feat of featureRows) {
            if (feat && typeof feat === "object") {
                const rec = feat as Record<string, unknown>;
                groups.push(requireTokens(rec));
                const fid = rec.id;
                if (fid) {
                    const row = this.dataLoader.getFeature(String(fid));
                    if (row) groups.push(requireTokens(row));
                }
            }
        }
        const selected: string[] = [];
        const seen = new Set<string>();
        for (const raw of serviceIds ?? []) {
            const sid = String(raw || "").trim();
            if (!sid || seen.has(sid)) continue;
            seen.add(sid);
            selected.push(sid);
        }
        for (const sid of selected) {
            const svc = this.dataLoader.getService(sid);
            if (svc) {
                groups.push(requireTokens(svc));
                const fids = svc.features;
                if (Array.isArray(fids)) {
                    for (const fid of fids) {
                        const row = this.dataLoader.getFeature(String(fid));
                        if (row) groups.push(requireTokens(row));
                    }
                }
            }
        }
        const profile = this.resolvedMarkProfile(zoneId, selected.length ? selected : serviceIds);
        if (profile) groups.push(profile.requires ?? []);
        return { requires: mergeRequires(...groups), services: selected };
    }

    private resolveZoneInternal(countryCode: string): ResolutionResult<{ zone: PortoZone }> {
        const result = this._zoneResolver.resolve(countryCode);
        if (!result.isValid) {
            return { isValid: false, errors: result.errors };
        }
        return {
            isValid: true,
            data: result.data,
        };
    }

    private envelopeIdFromRequest(request: ResolutionRequest): string | undefined {
        if (request.envelopeId) return request.envelopeId.trim();
        const dims = request.dimensions;
        if (!dims) return undefined;
        for (const envelope of this.dataLoader.listEnvelopes()) {
            const same = dims.length === envelope.width && dims.width === envelope.height;
            const swapped = dims.length === envelope.height && dims.width === envelope.width;
            if (same || swapped) return envelope.id;
        }
        return undefined;
    }

    resolveZone(countryCode: string): PortoZone {
        const result = this.validator.validateCountryCode(countryCode);
        const zone = (result.data as { zone?: PortoZone } | undefined)?.zone;
        if (!result.isValid || !zone) {
            throw new Error(`Invalid country code: ${countryCode}`);
        }
        return zone;
    }

    getSupportedZones(productId?: string, envelopeId?: string): PortoZone[] {
        const links = this.dataLoader.resolutionGraph?.links ?? {};
        const zoneIds = new Set<string>();
        const wantedEnvelope = envelopeId?.trim().toUpperCase();
        for (const [graphProductId, productLinks] of Object.entries(links)) {
            const product = this.dataLoader.getProduct(graphProductId);
            if (!product) continue;
            if (productId && product.id !== productId) continue;
            if (wantedEnvelope) {
                const allowed = (product.envelope_ids ?? []).map((id) => id.toUpperCase());
                if (allowed.length > 0 && !allowed.includes(wantedEnvelope)) continue;
            }
            const zones = productLinks?.zones ?? [];
            zones.forEach((z: string) => zoneIds.add(z));
        }
        return Array.from(zoneIds)
            .map((zoneId) => this.dataLoader.getZone(zoneId))
            .filter((zone): zone is PortoZone => zone !== undefined);
    }

    private maxGraphWeightForZone(zoneId: string): number | undefined {
        const index = this.dataLoader.resolutionIndex;
        if (!index) return undefined;
        let maxSeen: number | undefined;
        for (const tierId of index.weightTierIds(zoneId)) {
            const tier = this.dataLoader.getWeightTier(tierId);
            if (!tier) continue;
            if (maxSeen === undefined || tier.max_weight > maxSeen) {
                maxSeen = tier.max_weight;
            }
        }
        return maxSeen;
    }

    private raiseUnresolvedProduct(options: {
        zoneId: string;
        weightTierId: string;
        weight: number;
        message: string;
        productId?: string;
        details?: Record<string, unknown>;
    }): never {
        const maxWeight = this.maxGraphWeightForZone(options.zoneId);
        if (maxWeight !== undefined && options.weight > maxWeight) {
            raiseTooHeavy(`Weight ${options.weight}g exceeds limit ${maxWeight}g`, {
                weight: options.weight,
                maxWeight,
                statusCode: 400,
            });
        }
        raiseProductNotFound(options.message, {
            zoneId: options.zoneId,
            weightTierId: options.weightTierId,
            productId: options.productId,
            statusCode: 400,
            details: options.details,
        });
    }

    private enrichAmbiguousError(
        error: PortoError,
        candidates: PortoProduct[],
        zoneId: string,
    ): void {
        const details = {
            ...(typeof error.details === "object" && error.details
                ? (error.details as Record<string, unknown>)
                : {}),
            candidates: candidates.map((product) => {
                const facts = this._productResolver.candidateFacts(product, zoneId);
                return {
                    product_id: facts.product_id,
                    delivery_hint: facts.delivery_hint,
                    fingerprint: facts.fingerprint,
                    included_features: facts.included_features,
                    indemnity: facts.indemnity,
                    tracking: facts.tracking,
                };
            }),
        };
        (error as { details?: unknown }).details = details;
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheStats() {
        return {
            size: this.cache.size(),
            maxSize: this.cache.maxSize(),
        };
    }

    listProducts(_countryFrom?: string, _countryTo?: string): PortoProduct[] {
        return this.catalog.listProducts(_countryFrom, _countryTo);
    }

    listDimensions(): Array<{
        id?: string;
        size?: { width?: number; height?: number; thickness?: number };
    }> {
        return this.catalog.listDimensions();
    }

    listZones(): PortoZone[] {
        return this.catalog.listZones();
    }

    listWeightTiers(): PortoWeightTier[] {
        return this.catalog.listWeightTiers();
    }

    listEnvelopes(): PortoEnvelope[] {
        return this.catalog.listEnvelopes();
    }

    getWeightTier(weightTierId: string): PortoWeightTier | null {
        return this.catalog.getWeightTier(weightTierId);
    }

    getPriceByProductZoneWeightTier(
        productId: string,
        zoneId: string,
        weightTierId: string,
    ): PortoPricing | null {
        return this.catalog.getPriceByProductZoneWeightTier(productId, zoneId, weightTierId);
    }

    getServicePrice(serviceId: string, zoneId?: string | null): number | null {
        return this.catalog.getServicePrice(serviceId, zoneId);
    }

    getService(serviceId: string): Service | null {
        return this.catalog.getService(serviceId);
    }

    servicesOfKind(kind: ServiceKind): Service[] {
        return this.catalog.servicesOfKind(kind);
    }

    /**
     * Optional add-on services for a product + zone (priced rows for Compose UI).
     */
    listServiceOptionsForProductZone(productId: string, zoneId: string): ServiceOption[] {
        return this.catalog.listServiceOptionsForProductZone(productId, zoneId);
    }

    /**
     * Catalog-backed gate: selected add-on ids must exist for product×zone and
     * satisfy porto-data `combinable_with` (both sides when declared).
     * Empty selection is valid. Unknown id → PORTO_DATA_NOT_FOUND.
     */
    validateServiceSelection(
        serviceIds: readonly string[] | null | undefined,
        productId: string,
        zoneId: string,
    ): void {
        const options = this.listServiceOptionsForProductZone(productId, zoneId);
        validateServiceSelection(serviceIds, options);
    }

    getProduct(productId: string): PortoProduct | undefined {
        return this.catalog.getProduct(productId);
    }

    getProductConstraints(productId: string): Record<string, unknown> {
        return this.catalog.getProductConstraints(productId);
    }

    getGraph(): Record<string, unknown> {
        return this.catalog.getGraph();
    }

    listDestinationCountries(): Array<{ code: string; zone_id: string }> {
        return this.catalog.listDestinationCountries();
    }

    getDeliveryHint(productId: string, zoneId: string): DeliveryHint | null {
        const product = this.getProduct(productId);
        if (!product) return null;
        return this._deliveryResolver.resolve(product, zoneId) ?? null;
    }

    listWireIds(): string[] {
        return this.catalog.listWireIds();
    }
}

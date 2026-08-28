import {
    getDefaultWireId,
    getExecutionAdapter,
    resolveActiveWireFor,
    supportsBilling,
    supportsExecution,
} from "./adapters/execution-registry.js";
import { getTrackingAdapter } from "./adapters/tracking/adapter.js";
import type { TrackingAdapter } from "./adapters/tracking/adapter.js";
import type { PortoClient } from "./client.js";
import { type ProviderRuntimeConfig, normalizeProviderId } from "./config.js";
import type { PortoDataLoader } from "./data/loader.js";
import { DomainIds } from "./data/validator.js";
import type {
    ExecutionParameters,
    MarkExecution,
    PortoMark,
    PortoMarkRequest,
} from "./execution/index.js";
import type { FeatureKind, ServiceKind } from "./kinds.js";
import type { FetchMarkBytesOptions } from "./mark-content.js";
import { BillingService } from "./services/billing.js";
import { JurisdictionsService } from "./services/jurisdictions.js";
import { PortoExecution } from "./services/porto-execution.js";
import type { Porto, PortoResolver, ResolutionRequest } from "./services/porto-resolver.js";
import { type PriceInput, type Pricing, price as lookupPrice } from "./services/pricing.js";
import { recommendProductForWeight } from "./services/product-advice.js";
import type { Estimate, EstimateForProductInput } from "./services/product-estimates.js";
import type { ListProductOptionsInput } from "./services/product-option-types.js";
import type { Advice, RecommendProductForWeightInput } from "./services/product-option-types.js";
import { listProductOptions } from "./services/product-options.js";
import { estimateForProduct } from "./services/product-options.js";
import { ProviderCapabilitiesService } from "./services/provider-capabilities.js";
import { RestrictionsService } from "./services/restrictions/index.js";
import { TrackingService } from "./services/tracking.js";
import { LetterValidationService } from "./services/validation.js";
import { type CapabilityState, capabilityState } from "./states.js";

export interface ProviderCapabilities {
    providerId: string;
    mark: CapabilityState;
    wallet: CapabilityState;
    track: CapabilityState;
    trackingKind: "shipment" | "stamp";
}

export class ProviderClient {
    readonly providerId: string;
    readonly track: TrackingService;
    readonly wallet: BillingService;
    readonly restrictions: RestrictionsService;
    /** @internal */
    readonly _resolver: PortoResolver;

    private readonly runtime: ProviderRuntimeConfig;
    private readonly dataLoader: PortoDataLoader;
    private readonly dataPath: string;
    private readonly trackingAdapter: TrackingAdapter;
    private readonly execution: PortoExecution;

    constructor(args: {
        root: PortoClient;
        providerId: string;
        runtime: ProviderRuntimeConfig;
        dataLoader: PortoDataLoader;
        dataPath: string;
        resolver: PortoResolver;
    }) {
        this.providerId = normalizeProviderId(args.providerId);
        this.runtime = args.runtime;
        this.dataLoader = args.dataLoader;
        this.dataPath = args.dataPath;

        const validator = new DomainIds(args.dataLoader);
        const portoResolver = args.resolver;

        const wireId =
            resolveActiveWireFor(this.providerId, this.runtime.wires, this.dataPath) ??
            getDefaultWireId(this.providerId, this.dataPath);

        const executionAdapter = getExecutionAdapter(
            this.providerId,
            this.runtime.wires,
            undefined,
            this.dataPath,
            args.root._sharedHttp(),
        );
        if (
            executionAdapter &&
            typeof (
                executionAdapter as { setCountryCode3Lookup?: (fn: (c: string) => string) => void }
            ).setCountryCode3Lookup === "function"
        ) {
            (
                executionAdapter as unknown as {
                    setCountryCode3Lookup: (fn: (c: string) => string) => void;
                }
            ).setCountryCode3Lookup((code) =>
                new JurisdictionsService(args.dataLoader).countryCode3(code),
            );
        }
        this.trackingAdapter = getTrackingAdapter(this.providerId, {
            wireId,
            dataPath: this.dataPath,
        });

        const validation = new LetterValidationService(portoResolver, validator, args.root.address);
        const portoExecution = new PortoExecution(
            args.dataLoader,
            executionAdapter,
            portoResolver,
            validation,
        );
        this.execution = portoExecution;
        this.track = new TrackingService(this.trackingAdapter);
        this.restrictions = new RestrictionsService(args.dataLoader, this.providerId);
        this.wallet = new BillingService(args.root, {
            providerId: this.providerId,
            wires: this.runtime.wires,
            adapter: executionAdapter,
        });
        this._resolver = portoResolver;
    }

    resolve(input: ResolutionRequest): Promise<Porto> {
        return this._resolver.resolve({
            countryCode: input.countryCode,
            weight: input.weight,
            envelopeId: input.envelopeId,
            productId: input.productId,
            services: input.services,
            serviceIds: input.serviceIds,
            deliveryPreference: input.deliveryPreference,
            indemnityTier: input.indemnityTier,
            dimensions: input.dimensions,
        });
    }

    price(input: PriceInput): Promise<Pricing> {
        return lookupPrice(this._resolver, input);
    }

    options(input: ListProductOptionsInput) {
        return listProductOptions(this._resolver, {
            countryCode: input.countryCode,
            weight: input.weight,
            envelopeId: input.envelopeId,
        });
    }

    estimate(input: EstimateForProductInput): Estimate {
        return estimateForProduct(this._resolver, input);
    }

    advise(input: RecommendProductForWeightInput): Advice {
        return recommendProductForWeight(this._resolver, input);
    }

    prepare(request: PortoMarkRequest): Promise<MarkExecution> {
        return this.execution.prepare(request);
    }

    bytes(
        mark: PortoMark,
        options?: Omit<FetchMarkBytesOptions, "httpClient" | "normalize">,
    ): Promise<Uint8Array> {
        return this.execution.bytes(mark, options);
    }

    /** @internal */
    _prepare(...args: Parameters<PortoExecution["prepare"]>) {
        return this.execution.prepare(...args);
    }

    mark(
        request: PortoMarkRequest | PortoMarkRequest[],
        execution?: ExecutionParameters,
    ): Promise<PortoMark | PortoMark[]> {
        if (Array.isArray(request)) {
            return this.execution.mark(request, execution);
        }
        return this.execution.mark(request, execution);
    }

    capabilities(): ProviderCapabilities {
        const wires = this.runtime.wires;
        const canMark = supportsExecution(this.providerId, "mark", {
            wires,
            dataPath: this.dataPath,
        });
        const canWallet = supportsBilling(this.providerId, "wallet", {
            wires,
            dataPath: this.dataPath,
        });

        return {
            providerId: this.providerId,
            mark: capabilityState({ supported: canMark }),
            track: capabilityState({ supported: this.trackingAdapter.supportsTracking }),
            wallet: capabilityState({ supported: canWallet }),
            trackingKind: this.trackingAdapter.trackingKind,
        };
    }

    can(feature: FeatureKind, context?: Record<string, unknown>): boolean {
        return new ProviderCapabilitiesService(this.dataLoader).can(
            this.providerId,
            feature,
            context,
        );
    }
}

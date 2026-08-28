/**
 * Porto SDK - Main export
 */

export { PortoClient } from "./client";
export { ProviderClient } from "./provider-client";
export type { ProviderCapabilities } from "./provider-client";
export type {
    PortoConfig,
    CacheConfig,
    WireConfig,
    ProviderRuntimeConfig,
    TransportConfig,
} from "./config";
export { CapabilityState } from "./states.js";
export { PortoError, PortoErrorCode } from "./errors";
export type { Address, Dimensions, TrackingStatus } from "./types/index";
export type {
    ExecutionParameters,
    PortoMark,
    PortoMarkRequest,
    MarkType,
    TrackingMode,
    MarkOutputMime,
} from "./execution/index";
export type {
    ProductOption,
    ServiceOption,
    Advice,
} from "./services/product-option-types.js";
export type { Estimate } from "./services/product-estimates.js";
export type { MarkExecution } from "./execution/index.js";
export type { ResolutionRequest, Porto } from "./services/porto-resolver.js";
export type { DeliveryHint, WorkingDaysHint } from "./services/resolution/delivery-resolver.js";
export type { Pricing, PriceInput } from "./services/pricing.js";
export type { PriceComponent } from "./services/resolution/quote.js";
export type { Balance } from "./adapters/protocols/execution.js";
export type {
    AdvisoryMatch,
    EnvelopeGeometry,
    Envelope,
    EnvelopeLayout,
    EnvelopeMark,
    EnvelopeMarkFact,
    EnvelopeRect,
    EnvelopeSheet,
    EnvelopeSize,
    Match,
    NoMatch,
    StrictMatch,
} from "./envelopes/types.js";
export type { Envelopes, EnvelopeIdentity } from "./services/envelope-resolver.js";
export type {
    JurisdictionInstrument,
    LegalRestriction,
    Restrictions,
    RestrictionImpact,
    RestrictionJurisdiction,
    RoutingRestriction,
} from "./services/restrictions/index.js";
export type { ServiceKind, FeatureKind } from "./kinds.js";
export type { Requirement } from "./requires.js";

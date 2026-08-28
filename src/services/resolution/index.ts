/**
 * Resolution primitives — shared building blocks for `PortoResolver.resolve`.
 * Catalog identity is concrete `id`. Service/feature `kind` is grouping only.
 */

export type {
    ResolvedInput,
    DeliveryHint,
    DeliveryPreference,
} from "./types.js";
export { DeliveryResolver } from "./delivery-resolver.js";
export { PriceResolver } from "./price-resolver.js";
export { composeQuote, type ComposedQuote, type PriceComponent } from "./quote.js";
export { ProductResolver } from "./product-resolver.js";
export { WeightTierResolver } from "./weight-tier-resolver.js";
export { ZoneResolver } from "./zone-resolver.js";
export { FeatureResolver } from "./feature-resolver.js";
export { DimensionResolver } from "./dimension-resolver.js";
export {
    ServiceResolver,
    resolveServiceToken,
    bindRequestedServices,
    validateServiceSelection,
} from "./service-resolver.js";
export { ResolutionCache } from "./cache.js";
export { PortoCatalog } from "./catalog.js";

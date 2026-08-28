/**
 * Entity loaders for porto-data
 *
 * Each entity has its own loader class that handles:
 * - Loading and transforming JSON data
 * - Entity-specific query methods
 * - Entity-specific business logic
 */

export { BaseEntityLoader } from "./base";
export type { EntityData } from "./base";
export type { PortoPricing } from "./prices";
export { PricesLoader } from "./prices";
export { DimensionsLoader } from "./dimensions";
export { FeaturesLoader, type Feature } from "./features";
export { ServicesLoader, type Service } from "./services";
export { RestrictionsLoader } from "./restrictions";
export { EnvelopesLoader, type PortoEnvelope } from "./envelopes";
export { LayoutsLoader, type EnvelopeLayout, type LayoutRect } from "./layouts";
export { AddressesLoader, type AddressForm, type AddressFormKind } from "./addresses";
export { MarksLoader, type MarkAssetSize, type MarkCalibration, type MarkProfile } from "./marks";
export { ProvidersLoader, type PortoProvider } from "./providers";
export { MarketsLoader, type PortoMarket, type WorkingDays } from "./markets";
export {
    ProductsLoader,
    type PortoProduct,
    type DeliveryEntry,
    type ProductIndemnity,
} from "./products";
export { ZonesLoader, type PortoZone } from "./zones";
export { WeightTiersLoader, type PortoWeightTier } from "./weight-tiers";

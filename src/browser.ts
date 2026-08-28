/**
 * Browser entry — same PortoClient API; SDK embeds catalog from @gruncellka/porto-data.
 *
 * Apps must not import porto-data JSON. Override with `embeddedFiles` only for tests.
 */

import { embeddedPortoDataFilesFor } from "./browser/embedded-porto-data.js";
import { PortoClient as NodePortoClient } from "./client.js";
import type { PortoConfig } from "./config.js";
import { DEFAULT_PROVIDER, normalizeProviderId } from "./config.js";
import { ConfigurationError, PortoErrorCode } from "./errors/index.js";

export type { PortoConfig, CacheConfig, WireConfig, TransportConfig } from "./config.js";
export {
    PortoError,
    PortoErrorCode,
    ValidationError,
    AuthenticationError,
    TransportError,
    ProviderError,
    ConfigurationError,
    DataError,
} from "./errors.js";
export type { Match, StrictMatch, AdvisoryMatch, NoMatch } from "./envelopes/types.js";
export type {
    EnvelopeGeometry,
    Envelope,
    EnvelopeLayout,
    EnvelopeMark,
    EnvelopeMarkFact,
    EnvelopeRect,
    EnvelopeSheet,
    EnvelopeSize,
} from "./envelopes/types.js";
export type { Address, Dimensions } from "./types/index.js";
export { embeddedPortoDataFilesFor } from "./browser/embedded-porto-data.js";
export type { Envelopes, EnvelopeIdentity } from "./services/envelope-resolver.js";
export type { ProductOption, ServiceOption } from "./services/product-option-types.js";
export type {
    JurisdictionInstrument,
    LegalRestriction,
    RestrictionImpact,
    RestrictionJurisdiction,
    Restrictions,
    RoutingRestriction,
} from "./services/restrictions/index.js";
export type { DeliveryHint, WorkingDaysHint } from "./services/resolution/delivery-resolver.js";

export class BrowserPortoClient extends NodePortoClient {
    constructor(config: PortoConfig = {}) {
        const catalog =
            Object.keys(config.providers ?? {})[0] ?? normalizeProviderId(DEFAULT_PROVIDER);
        const embeddedFiles =
            config.embeddedFiles && Object.keys(config.embeddedFiles).length > 0
                ? config.embeddedFiles
                : embeddedPortoDataFilesFor(catalog);
        if (!embeddedFiles || Object.keys(embeddedFiles).length === 0) {
            throw new ConfigurationError(
                "Browser PortoClient requires an embedded porto-data catalog " +
                    "(SDK embed missing — pass embeddedFiles for tests).",
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
            );
        }
        super({
            ...config,
            embeddedFiles,
            cache: config.cache ?? { enabled: true, ttl: 300, maxSize: 500 },
        });
    }
}

/** Browser runtime — same PortoClient API; catalog embedded by the SDK. */
export { BrowserPortoClient as PortoClient };

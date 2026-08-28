/**
 * Compose legal + routing strategies into a public Restrictions result.
 */

import type { PortoDataLoader } from "../../data/loader.js";
import * as impactMod from "./impact.js";
import * as legalMod from "./legal.js";
import * as routingMod from "./routing.js";
import type { Restrictions } from "./types.js";

function toUtcDate(source: Date): Date {
    return new Date(
        Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate(), 0, 0, 0, 0),
    );
}

export function forDestination(
    loader: PortoDataLoader,
    countryCode: string,
    regionCode?: string | null,
    options?: { providerId?: string; asOf?: Date },
): Restrictions {
    const today = toUtcDate(options?.asOf ?? new Date());
    const jurisdictions = loader.providerJurisdictionTokens(options?.providerId);
    const catalog = loader.restrictionsCatalog();
    const legal = legalMod.resolve(catalog.legal, countryCode, regionCode, {
        jurisdictions,
        today,
    });
    const routing = routingMod.resolve(catalog.routing, countryCode, regionCode);
    return {
        impact: impactMod.resolve(legal, routing, { regionPrecise: Boolean(regionCode) }),
        legal,
        routing,
    };
}

/** Thin façade over porto-data restrictions for `client.restrictions`. */
export class RestrictionsService {
    constructor(
        private readonly loader: PortoDataLoader,
        private readonly providerId?: string,
    ) {}

    check(countryCode: string, regionCode?: string | null): Restrictions {
        return forDestination(this.loader, countryCode, regionCode, {
            providerId: this.providerId ?? this.loader.providerId,
        });
    }
}

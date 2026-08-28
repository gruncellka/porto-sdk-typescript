/**
 * Public destination-restriction package for `client.restrictions`.
 */

export type {
    JurisdictionInstrument,
    LegalRestriction,
    RestrictionImpact,
    RestrictionJurisdiction,
    Restrictions,
    RoutingRestriction,
} from "./types.js";

export { forDestination, RestrictionsService } from "./check.js";

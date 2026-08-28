/**
 * Public restriction result types.
 */

export type RestrictionJurisdiction = "EU" | "CH" | "UA";
export type RestrictionImpact = "block" | "warn";

/** In-force legal instrument under a jurisdictions.json identifier. */
export interface JurisdictionInstrument {
    jurisdiction: RestrictionJurisdiction;
    reference: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
}

export interface LegalRestriction {
    impact: RestrictionImpact;
    countryCode: string;
    regionCode?: string;
    partial: boolean;
    jurisdictions: JurisdictionInstrument[];
    reason: string;
    description: string;
}

export interface RoutingRestriction {
    impact: "warn";
    countryCode: string;
    regionCode?: string;
    partial: boolean;
    authority: string;
    reference: string;
    reason: string;
    description: string;
}

/** Resolved destination restriction result (not a catalog dump). */
export interface Restrictions {
    impact: RestrictionImpact | null;
    legal: LegalRestriction[];
    routing: RoutingRestriction[];
}

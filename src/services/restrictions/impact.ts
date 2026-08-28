/**
 * Aggregate machine impact from resolved restriction leaves.
 */

import type { LegalRestriction, RestrictionImpact, RoutingRestriction } from "./types.js";

export function resolve(
    legal: LegalRestriction[],
    routing: RoutingRestriction[],
    options: { regionPrecise: boolean },
): RestrictionImpact | null {
    if (legal.length === 0 && routing.length === 0) return null;
    if (!options.regionPrecise) return "warn";
    if (legal.some((item) => item.impact === "block")) return "block";
    return "warn";
}

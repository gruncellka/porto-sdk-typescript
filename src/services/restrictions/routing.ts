/**
 * Routing restriction applicability (destination geography only).
 */

import type { EntityData } from "../../data/entities/base.js";
import type { RoutingRestriction } from "./types.js";

export function resolve(
    catalog: Record<string, EntityData>,
    countryCode: string,
    regionCode?: string | null,
): RoutingRestriction[] {
    const country = String(countryCode).toUpperCase();
    const region = regionCode ? regionCode.toUpperCase() : null;
    const payload = catalog[country];
    if (!payload) return [];

    const authority = typeof payload.authority === "string" ? payload.authority : "";
    const reference = typeof payload.reference === "string" ? payload.reference : "";
    const reason = typeof payload.reason === "string" ? payload.reason : "";
    const description = typeof payload.description === "string" ? payload.description : "";
    const regions =
        payload.regions && typeof payload.regions === "object" && !Array.isArray(payload.regions)
            ? (payload.regions as Record<string, EntityData>)
            : {};

    if (Object.keys(regions).length === 0) {
        return [
            {
                impact: "warn",
                countryCode: country,
                partial: false,
                authority,
                reference,
                reason,
                description,
            },
        ];
    }

    if (region) {
        if (!(region in regions)) return [];
        const row = regions[region] ?? {};
        return [
            {
                impact: "warn",
                countryCode: country,
                regionCode: region,
                partial: row.partial === true,
                authority,
                reference,
                reason,
                description,
            },
        ];
    }

    return Object.entries(regions).map(([code, row]) => ({
        impact: "warn" as const,
        countryCode: country,
        regionCode: code,
        partial: row?.partial === true,
        authority,
        reference,
        reason,
        description,
    }));
}

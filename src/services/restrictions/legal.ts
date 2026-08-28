/**
 * Legal restriction applicability (provider → jurisdiction → destination).
 */

import type { EntityData } from "../../data/entities/base.js";
import { remainingJurisdictionMap } from "../../data/entities/restrictions.js";
import type {
    JurisdictionInstrument,
    LegalRestriction,
    RestrictionImpact,
    RestrictionJurisdiction,
} from "./types.js";

const KNOWN = new Set<RestrictionJurisdiction>(["EU", "CH", "UA"]);

function jurisdictionsFlat(raw: Record<string, EntityData[]>): JurisdictionInstrument[] {
    const items: JurisdictionInstrument[] = [];
    for (const [key, instruments] of Object.entries(raw)) {
        const jurisdiction = key.toUpperCase();
        if (!KNOWN.has(jurisdiction as RestrictionJurisdiction)) continue;
        for (const item of instruments) {
            items.push({
                jurisdiction: jurisdiction as RestrictionJurisdiction,
                reference: typeof item.reference === "string" ? item.reference : null,
                effectiveFrom: typeof item.effective_from === "string" ? item.effective_from : null,
                effectiveTo: typeof item.effective_to === "string" ? item.effective_to : null,
            });
        }
    }
    return items;
}

function itemImpact(partial: boolean): RestrictionImpact {
    return partial ? "warn" : "block";
}

export function resolve(
    catalog: Record<string, EntityData>,
    countryCode: string,
    regionCode: string | null | undefined,
    options: { jurisdictions: Iterable<string> | null; today: Date },
): LegalRestriction[] {
    const country = String(countryCode).toUpperCase();
    const region = regionCode ? regionCode.toUpperCase() : null;
    const payload = catalog[country];
    if (!payload) return [];

    const regions =
        payload.regions && typeof payload.regions === "object" && !Array.isArray(payload.regions)
            ? (payload.regions as Record<string, EntityData>)
            : {};

    if (Object.keys(regions).length > 0) {
        if (region && !(region in regions)) return [];
        const candidates = region ? { [region]: regions[region] } : regions;
        const out: LegalRestriction[] = [];
        for (const [code, row] of Object.entries(candidates)) {
            const remaining = remainingJurisdictionMap(
                row.jurisdictions &&
                    typeof row.jurisdictions === "object" &&
                    !Array.isArray(row.jurisdictions)
                    ? (row.jurisdictions as Record<string, EntityData[]>)
                    : {},
                options.jurisdictions,
                options.today,
            );
            if (Object.keys(remaining).length === 0) continue;
            const partial = row.partial === true;
            out.push({
                impact: itemImpact(partial),
                countryCode: country,
                regionCode: code,
                partial,
                jurisdictions: jurisdictionsFlat(remaining),
                reason: typeof row.reason === "string" ? row.reason : "",
                description: typeof row.description === "string" ? row.description : "",
            });
        }
        return out;
    }

    const remaining = remainingJurisdictionMap(
        payload.jurisdictions &&
            typeof payload.jurisdictions === "object" &&
            !Array.isArray(payload.jurisdictions)
            ? (payload.jurisdictions as Record<string, EntityData[]>)
            : {},
        options.jurisdictions,
        options.today,
    );
    if (Object.keys(remaining).length === 0) return [];
    return [
        {
            impact: "block",
            countryCode: country,
            partial: false,
            jurisdictions: jurisdictionsFlat(remaining),
            reason: typeof payload.reason === "string" ? payload.reason : "",
            description: typeof payload.description === "string" ? payload.description : "",
        },
    ];
}

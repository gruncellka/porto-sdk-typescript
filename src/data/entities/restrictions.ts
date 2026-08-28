/**
 * Restrictions entity loader — policy/restrictions.json.
 */

import { raiseDataInvalid } from "../../errors/domains/data.js";
import { BaseEntityLoader, type EntityData } from "./base";

const JURISDICTIONS = new Set(["EU", "CH", "UA"]);
const COUNTRY_KEY = /^[A-Z]{2}$/;
const REGION_KEY = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

function parseDate(value: unknown): Date | null {
    if (typeof value !== "string" || value.trim().length === 0) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function toUtcDate(source: Date): Date {
    return new Date(
        Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate(), 0, 0, 0, 0),
    );
}

function inForce(bounds: EntityData, today: Date): boolean {
    const from = parseDate(bounds.effective_from);
    const to = parseDate(bounds.effective_to);
    if (from && from > today) return false;
    if (to && to < today) return false;
    return true;
}

function requireObject(
    value: unknown,
    message: string,
    details?: Record<string, unknown>,
): EntityData {
    if (!value || typeof value !== "object") {
        raiseDataInvalid(message, details ? { details } : undefined);
    }
    return value as EntityData;
}

function requireText(value: unknown, field: string, country: string): string {
    if (typeof value !== "string" || !value.trim()) {
        raiseDataInvalid(`restriction for ${country} is missing ${field}`, {
            details: { country_code: country, field },
        });
    }
    return value;
}

function normalizeInstrument(raw: unknown, country: string): EntityData {
    const instrument = requireObject(
        raw,
        `legal restriction for ${country} has a non-object jurisdiction instrument`,
        { country_code: country },
    );
    if ("impact" in instrument || "jurisdiction" in instrument) {
        raiseDataInvalid(
            `legal restriction for ${country} has an invalid jurisdiction instrument field`,
            { details: { country_code: country } },
        );
    }
    return {
        reference: typeof instrument.reference === "string" ? instrument.reference : null,
        effective_from:
            typeof instrument.effective_from === "string" ? instrument.effective_from : null,
        effective_to: typeof instrument.effective_to === "string" ? instrument.effective_to : null,
    };
}

function normalizeJurisdictionMap(raw: unknown, country: string): Record<string, EntityData[]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0) {
        raiseDataInvalid(`legal restriction for ${country} is missing jurisdictions`, {
            details: { country_code: country },
        });
    }
    const jurisdictions: Record<string, EntityData[]> = {};
    for (const [key, instruments] of Object.entries(raw as EntityData)) {
        if (!JURISDICTIONS.has(key)) {
            raiseDataInvalid(`legal restriction for ${country} has an unknown jurisdiction`, {
                details: { country_code: country, jurisdiction: key },
            });
        }
        if (!Array.isArray(instruments) || instruments.length === 0) {
            raiseDataInvalid(`legal restriction for ${country} is missing jurisdictions`, {
                details: { country_code: country, jurisdiction: key },
            });
        }
        jurisdictions[key] = instruments.map((item) => normalizeInstrument(item, country));
    }
    return jurisdictions;
}

function normalizeLegalRegions(raw: unknown, country: string): Record<string, EntityData> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0) {
        raiseDataInvalid(`legal restriction for ${country} is missing regions`, {
            details: { country_code: country },
        });
    }
    const regions: Record<string, EntityData> = {};
    for (const [code, payload] of Object.entries(raw as EntityData)) {
        if (!REGION_KEY.test(code)) {
            raiseDataInvalid(`legal restriction for ${country} has an invalid region key`, {
                details: { country_code: country },
            });
        }
        const region = requireObject(
            payload,
            `legal restriction for ${country} has a non-object region`,
            { country_code: country },
        );
        if ("frameworks" in region) {
            raiseDataInvalid(
                `legal restriction for ${country} must use jurisdictions, not frameworks`,
                { details: { country_code: country, region_code: code } },
            );
        }
        if ("region_code" in region || "jurisdiction" in region) {
            raiseDataInvalid(`legal restriction for ${country} has an invalid region field`, {
                details: { country_code: country, region_code: code },
            });
        }
        const normalized: EntityData = {
            jurisdictions: normalizeJurisdictionMap(region.jurisdictions, country),
            reason: requireText(region.reason, "reason", country),
            description: requireText(region.description, "description", country),
        };
        if ("partial" in region) {
            if (region.partial !== true) {
                raiseDataInvalid(`restriction for ${country} has invalid region partial`, {
                    details: { country_code: country, region_code: code },
                });
            }
            normalized.partial = true;
        }
        regions[code] = normalized;
    }
    return regions;
}

function normalizeGeoRegions(
    raw: unknown,
    country: string,
    collection: "routing" = "routing",
): Record<string, EntityData> {
    if (raw == null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) {
        raiseDataInvalid(`${collection} restriction for ${country} has a non-object regions`, {
            details: { country_code: country },
        });
    }
    const regions: Record<string, EntityData> = {};
    for (const [code, payload] of Object.entries(raw as EntityData)) {
        if (!REGION_KEY.test(code)) {
            raiseDataInvalid(`${collection} restriction for ${country} has an invalid region key`, {
                details: { country_code: country },
            });
        }
        const region = requireObject(
            payload ?? {},
            `${collection} restriction for ${country} has a non-object region`,
            { country_code: country },
        );
        if ("frameworks" in region || "jurisdictions" in region || "region_code" in region) {
            raiseDataInvalid(
                `${collection} restriction for ${country} has an invalid region field`,
                {
                    details: { country_code: country, region_code: code },
                },
            );
        }
        const normalized: EntityData = {};
        if ("partial" in region) {
            if (region.partial !== true) {
                raiseDataInvalid(`restriction for ${country} has invalid region partial`, {
                    details: { country_code: country, region_code: code },
                });
            }
            normalized.partial = true;
        }
        regions[code] = normalized;
    }
    return regions;
}

function normalizeLegal(country: string, item: EntityData): EntityData {
    if ("country_code" in item) {
        raiseDataInvalid(`legal restriction for ${country} must not have country_code`, {
            details: { country_code: country },
        });
    }
    if ("frameworks" in item) {
        raiseDataInvalid(
            `legal restriction for ${country} must use jurisdictions, not frameworks`,
            { details: { country_code: country } },
        );
    }
    if ("regions" in item) {
        if ("jurisdictions" in item) {
            raiseDataInvalid(
                `legal restriction for ${country} must not mix country jurisdictions with regions`,
                { details: { country_code: country } },
            );
        }
        return { regions: normalizeLegalRegions(item.regions, country) };
    }
    return {
        jurisdictions: normalizeJurisdictionMap(item.jurisdictions, country),
        reason: requireText(item.reason, "reason", country),
        description: requireText(item.description, "description", country),
    };
}

function normalizeRouting(country: string, item: EntityData): EntityData {
    if ("frameworks" in item || "jurisdictions" in item || "country_code" in item) {
        raiseDataInvalid(`routing restriction for ${country} must not have jurisdictions`, {
            details: { country_code: country },
        });
    }
    const payload: EntityData = {
        authority: requireText(item.authority, "authority", country),
        reference: requireText(item.reference, "reference", country),
        reason: requireText(item.reason, "reason", country),
        description: requireText(item.description, "description", country),
    };
    const regions = normalizeGeoRegions(item.regions, country);
    if (Object.keys(regions).length > 0) payload.regions = regions;
    return payload;
}

const NORMALIZERS = {
    legal: normalizeLegal,
    routing: normalizeRouting,
} as const;

function loadCountryMap(raw: unknown, name: "legal" | "routing"): Record<string, EntityData> {
    if (raw == null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) {
        raiseDataInvalid(`restrictions.json ${name} must be an object keyed by country`);
    }
    const loaded: Record<string, EntityData> = {};
    for (const [country, payload] of Object.entries(raw as EntityData)) {
        if (!COUNTRY_KEY.test(country)) {
            raiseDataInvalid(`restrictions.json ${name} has an invalid country key`);
        }
        const row = requireObject(payload, `restrictions ${name}.${country} must be an object`, {
            country_code: country,
        });
        loaded[country] = NORMALIZERS[name](country, row);
    }
    return loaded;
}

export function remainingJurisdictionMap(
    jurisdictions: Record<string, EntityData[]>,
    providerJurisdictions: Iterable<string> | null | undefined,
    today: Date,
): Record<string, EntityData[]> {
    const tokens =
        providerJurisdictions == null
            ? null
            : new Set([...providerJurisdictions].map((token) => token.toUpperCase()));
    const remaining: Record<string, EntityData[]> = {};
    for (const [key, instruments] of Object.entries(jurisdictions)) {
        const jurisdiction = key.toUpperCase();
        if (tokens !== null && !tokens.has(jurisdiction)) continue;
        const kept = instruments.filter((item) => inForce(item, today));
        if (kept.length > 0) remaining[jurisdiction] = kept;
    }
    return remaining;
}

function selectLegal(
    payload: EntityData,
    regionCode: string | null,
    jurisdictions: Iterable<string> | null | undefined,
    today: Date,
): EntityData | null {
    const regions =
        payload.regions && typeof payload.regions === "object" && !Array.isArray(payload.regions)
            ? (payload.regions as Record<string, EntityData>)
            : {};
    if (Object.keys(regions).length > 0) {
        if (regionCode && !(regionCode in regions)) return null;
        const candidates = regionCode ? { [regionCode]: regions[regionCode] } : regions;
        const selected: Record<string, EntityData> = {};
        for (const [code, region] of Object.entries(candidates)) {
            const remaining = remainingJurisdictionMap(
                region.jurisdictions &&
                    typeof region.jurisdictions === "object" &&
                    !Array.isArray(region.jurisdictions)
                    ? (region.jurisdictions as Record<string, EntityData[]>)
                    : {},
                jurisdictions,
                today,
            );
            if (Object.keys(remaining).length === 0) continue;
            selected[code] = { ...region, jurisdictions: remaining };
        }
        if (Object.keys(selected).length === 0) return null;
        return { regions: selected };
    }
    const remaining = remainingJurisdictionMap(
        payload.jurisdictions &&
            typeof payload.jurisdictions === "object" &&
            !Array.isArray(payload.jurisdictions)
            ? (payload.jurisdictions as Record<string, EntityData[]>)
            : {},
        jurisdictions,
        today,
    );
    if (Object.keys(remaining).length === 0) return null;
    const { regions: _ignored, ...rest } = payload;
    return { ...rest, jurisdictions: remaining };
}

function selectGeo(payload: EntityData, regionCode: string | null): EntityData | null {
    const regions =
        payload.regions && typeof payload.regions === "object" && !Array.isArray(payload.regions)
            ? (payload.regions as Record<string, EntityData>)
            : {};
    if (Object.keys(regions).length === 0) return { ...payload };
    if (regionCode) {
        if (!(regionCode in regions)) return null;
        return { ...payload, regions: { [regionCode]: { ...regions[regionCode] } } };
    }
    const copied: Record<string, EntityData> = {};
    for (const [code, region] of Object.entries(regions)) copied[code] = { ...region };
    return { ...payload, regions: copied };
}

export class RestrictionsLoader extends BaseEntityLoader {
    private legal: Record<string, EntityData> = {};
    private routing: Record<string, EntityData> = {};
    private policyRaw: EntityData = {};

    load(data: EntityData): void {
        if ("operational" in data) {
            raiseDataInvalid("restrictions.json must not contain operational");
        }
        this.policyRaw = data;
        this.legal = loadCountryMap(data.legal, "legal");
        this.routing = loadCountryMap(data.routing, "routing");
    }

    getPolicyRaw(): EntityData {
        return this.policyRaw;
    }

    getData(): {
        legal: Record<string, EntityData>;
        routing: Record<string, EntityData>;
    } {
        return { legal: this.legal, routing: this.routing };
    }

    classifyRestrictions(
        countryCode: string,
        regionCode?: string | null,
        options?: { jurisdictions?: Iterable<string> | null; asOf?: Date },
    ): {
        legal: Record<string, EntityData>;
        routing: Record<string, EntityData>;
    } {
        const today = toUtcDate(options?.asOf ?? new Date());
        const normalizedCountry = String(countryCode).toUpperCase();
        const normalizedRegion = regionCode ? regionCode.toUpperCase() : null;
        const jurisdictions = options?.jurisdictions ?? null;
        const selected = {
            legal: {} as Record<string, EntityData>,
            routing: {} as Record<string, EntityData>,
        };

        const legal = this.legal[normalizedCountry];
        if (legal) {
            const projected = selectLegal(legal, normalizedRegion, jurisdictions, today);
            if (projected) selected.legal[normalizedCountry] = projected;
        }
        const routing = this.routing[normalizedCountry];
        if (routing) {
            const projected = selectGeo(routing, normalizedRegion);
            if (projected) selected.routing[normalizedCountry] = projected;
        }
        return selected;
    }
}

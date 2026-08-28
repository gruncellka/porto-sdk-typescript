/**
 * Jurisdiction reference data (EU/UN blocs, per-country timezones).
 */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoJurisdictions {
    jurisdictions: Record<string, unknown>;
}

export class JurisdictionsLoader extends BaseEntityLoader {
    private jurisdictions: PortoJurisdictions = { jurisdictions: {} };

    load(data: EntityData): void {
        this.jurisdictions = {
            jurisdictions: (data.jurisdictions as Record<string, unknown>) ?? {},
        };
    }

    getData(): PortoJurisdictions {
        return this.jurisdictions;
    }

    getJurisdiction(key: string): Record<string, unknown> | undefined {
        const row = this.jurisdictions.jurisdictions[key];
        return row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
    }

    euMembers(): Set<string> {
        const row = this.getJurisdiction("EU") ?? {};
        const members = row.members;
        const out = new Set<string>();
        if (Array.isArray(members)) {
            for (const item of members) {
                if (typeof item === "string") out.add(item.toUpperCase());
            }
        }
        return out;
    }

    /** IANA timezone for a country key; ignores symbolic blocs without country form. */
    getTimezoneForCountry(countryCode: string): string | undefined {
        const code = (countryCode || "").trim().toUpperCase();
        if (!code || code === "EU" || code === "UN") return undefined;
        const row = this.getJurisdiction(code);
        const tz = row?.timezone;
        return typeof tz === "string" && tz ? tz : undefined;
    }

    getTimezoneByCountry(): Record<string, string> {
        const mapping: Record<string, string> = {};
        for (const [key, entry] of Object.entries(this.jurisdictions.jurisdictions)) {
            const code = key.toUpperCase();
            if (code === "EU" || code === "UN" || !entry || typeof entry !== "object") {
                continue;
            }
            const tz = (entry as Record<string, unknown>).timezone;
            if (typeof tz === "string" && tz) {
                mapping[code] = tz;
            }
        }
        return mapping;
    }

    /** Sorted ISO 3166-1 alpha-2 country keys (excludes EU/UN blocs). */
    countryCodes(): string[] {
        const codes: string[] = [];
        for (const [key, entry] of Object.entries(this.jurisdictions.jurisdictions)) {
            const code = key.toUpperCase();
            if (code === "EU" || code === "UN" || !entry || typeof entry !== "object") {
                continue;
            }
            codes.push(code);
        }
        return codes.sort();
    }

    /** ISO 3166-1 alpha-3 for an alpha-2 country key (one-way). */
    getCountryCode3(countryCode: string): string | undefined {
        const code = (countryCode || "").trim().toUpperCase();
        if (!code || code === "EU" || code === "UN") return undefined;
        const row = this.getJurisdiction(code);
        const value = row?.country_code_3;
        if (typeof value === "string" && value.length === 3) {
            return value.toUpperCase();
        }
        return undefined;
    }
}

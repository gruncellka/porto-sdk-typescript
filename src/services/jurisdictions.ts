/**
 * Jurisdiction reference lookups (timezone, membership blocs, country codes).
 */

import type { PortoDataLoader } from "../data/loader.js";
import { raiseDestinationInvalid } from "../errors/domains/resolution.js";

const DEFAULT_TIMEZONE = "UTC";

/** Typed read surface over porto-data `policy/jurisdictions.json`. */
export class JurisdictionsService {
    constructor(private readonly loader: PortoDataLoader) {}

    /** IANA timezone for an ISO 3166-1 alpha-2 country (fallback `UTC`). */
    timezoneForCountry(countryCode: string): string {
        const code = (countryCode || "").trim().toUpperCase();
        if (!code) return DEFAULT_TIMEZONE;
        return this.loader.getTimezoneForCountry(code) || DEFAULT_TIMEZONE;
    }

    /** Map of uppercase country codes → IANA timezone ids. */
    timezoneByCountry(): Record<string, string> {
        return this.loader.getTimezoneByCountry();
    }

    /** Sorted ISO 3166-1 alpha-2 keys known to jurisdictions (excludes EU/UN). */
    countryCodes(): string[] {
        return this.loader.countryCodes();
    }

    /** ISO 3166-1 alpha-3 for an alpha-2 country (one-way; no reverse lookup). */
    countryCode3(countryCode: string): string {
        const code = (countryCode || "").trim().toUpperCase();
        const value = code ? this.loader.getCountryCode3(code) : undefined;
        if (!value) {
            raiseDestinationInvalid(`Unknown country code: ${countryCode}`, {
                countryCode: code || String(countryCode || ""),
                statusCode: 400,
            });
        }
        return value;
    }
}

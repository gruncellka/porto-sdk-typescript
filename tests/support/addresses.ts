/** Licko-style address fixtures from porto-features.
 *
 * Default country order: DE, UA, FR, CH, US.
 * `origin_DE` is the DE sender twin of `valid_DE`.
 */

import type { Address } from "../../src/types/index.js";
import { loadFixture } from "./artifact-recorder.js";

export const LICKO_COUNTRIES = ["DE", "UA", "FR", "CH", "US"] as const;
export type LickoCountry = (typeof LICKO_COUNTRIES)[number];

const ALPHA3: Record<LickoCountry, string> = {
    DE: "DEU",
    UA: "UKR",
    FR: "FRA",
    CH: "CHE",
    US: "USA",
};

export function loadAddressFixture(fixtureId: string): Record<string, unknown> {
    return loadFixture(`addresses/${fixtureId}.json`);
}

export function validAddressId(country: string): string {
    const code = country.trim().toUpperCase();
    if (!LICKO_COUNTRIES.includes(code as LickoCountry)) {
        throw new Error(
            `No licko address fixture for ${country}; use ${LICKO_COUNTRIES.join(", ")}`,
        );
    }
    return `valid_${code}`;
}

export function addressJson(fixtureId: string): Record<string, unknown> {
    const { id: _id, ...rest } = loadAddressFixture(fixtureId);
    return rest;
}

export function addressFromFixture(rawOrId: Record<string, unknown> | string): Address {
    const raw = typeof rawOrId === "string" ? loadAddressFixture(rawOrId) : rawOrId;
    return {
        name: String(raw.name ?? "Test"),
        street: String(raw.street ?? ""),
        houseNumber: String(raw.house_number ?? raw.houseNumber ?? "1"),
        postalCode: String(raw.postal_code ?? raw.postalCode ?? ""),
        locality: String(raw.locality ?? ""),
        countryCode: String(raw.country_code ?? raw.countryCode ?? ""),
        regionCode: raw.region_code ? String(raw.region_code) : undefined,
    };
}

export function lickoSender(): Address {
    return addressFromFixture("origin_DE");
}

export function lickoRecipient(country: LickoCountry = "DE"): Address {
    return addressFromFixture(validAddressId(country));
}

export function internetmarkeCartAddress(fixtureId: string): Record<string, string> {
    const raw = loadAddressFixture(fixtureId);
    const country = String(raw.country_code) as LickoCountry;
    const street = String(raw.street ?? "");
    const house = String(raw.house_number ?? "");
    return {
        name: String(raw.name),
        addressLine1: `${street} ${house}`.trim(),
        postalCode: String(raw.postal_code),
        city: String(raw.locality),
        country: ALPHA3[country],
    };
}

import { describe, expect, it } from "vitest";
import { PortoClient } from "../../src/browser.js";
import { PortoErrorCode } from "../../src/errors.js";

describe("JurisdictionsService.timezoneForCountry", () => {
    it("resolves DE → Europe/Berlin", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(client.jurisdictions.timezoneForCountry("DE")).toBe("Europe/Berlin");
        expect(client.jurisdictions.timezoneForCountry("de")).toBe("Europe/Berlin");
    });

    it("falls back to UTC for unknown country", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(client.jurisdictions.timezoneForCountry("ZZ")).toBe("UTC");
    });

    it("timezoneByCountry omits symbolic blocs", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const mapping = client.jurisdictions.timezoneByCountry();
        expect(mapping.DE).toBe("Europe/Berlin");
        expect(mapping.CH).toBe("Europe/Zurich");
        expect(mapping.EU).toBeUndefined();
        expect(mapping.UN).toBeUndefined();
    });
});

describe("JurisdictionsService.countryCode3", () => {
    it("maps alpha-2 to alpha-3", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(client.jurisdictions.countryCode3("IE")).toBe("IRL");
        expect(client.jurisdictions.countryCode3("BG")).toBe("BGR");
        expect(client.jurisdictions.countryCode3("US")).toBe("USA");
    });

    it("every country key has country_code_3", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const codes = client.jurisdictions.countryCodes();
        expect(codes.length).toBeGreaterThanOrEqual(100);
        for (const alpha2 of codes) {
            const alpha3 = client.jurisdictions.countryCode3(alpha2);
            expect(alpha3).toMatch(/^[A-Z]{3}$/);
        }
    });

    it("unknown alpha-2 raises PORTO_DESTINATION_INVALID", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        try {
            client.jurisdictions.countryCode3("ZZ");
            throw new Error("expected PortoError");
        } catch (err: unknown) {
            expect(err).toMatchObject({ code: PortoErrorCode.PORTO_DESTINATION_INVALID });
        }
    });
});

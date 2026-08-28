import { describe, expect, it } from "vitest";
import { LICKO_COUNTRIES, lickoRecipient, lickoSender } from "../support/addresses.js";

describe("licko address fixtures", () => {
    it("keeps country priority DE → UA → FR → CH → US", () => {
        expect(LICKO_COUNTRIES).toEqual(["DE", "UA", "FR", "CH", "US"]);
    });

    it("uses German origin for the sender", () => {
        const sender = lickoSender();
        expect(sender.countryCode).toBe("DE");
        expect(sender.name).toBe("Porto SDK");
    });

    it("loads recipients in priority order", () => {
        for (const country of LICKO_COUNTRIES) {
            const address = lickoRecipient(country);
            expect(address.countryCode).toBe(country);
            expect(address.locality).toBeTruthy();
            expect(address.postalCode).toBeTruthy();
        }
    });
});

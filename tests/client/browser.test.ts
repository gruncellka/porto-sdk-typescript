import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { boundProvider } from "../support/bound-provider.js";

describe("browser PortoClient", () => {
    it("lists envelopes for DE via embedded catalog (no app porto-data import)", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const rows = client.envelopes.list();
        const ids = new Set(rows.map((row) => String(row.id)));
        expect(ids.has("DL")).toBe(true);
        expect(ids.has("C5")).toBe(true);
    });

    it("reads C5 window from geometry, not from list()", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const c5 = client.envelopes.list().find((row) => row.id === "C5");
        expect(c5).toBeDefined();
        expect(Number(c5?.width)).toBe(229);
        expect(Number(c5?.height)).toBe(162);
        const geometry = client.envelopes.geometry("C5", "DE") as {
            window?: Record<string, number>;
        };
        expect(geometry.window).toEqual({ x: 20, y: 57, width: 90, height: 45 });
    });

    it("exposes paper fold hints per envelope (preparation sheets)", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const dl = client.envelopes.list().find((row) => row.id === "DL");
        const c5 = client.envelopes.list().find((row) => row.id === "C5");
        expect(dl?.sheets).toEqual(
            expect.arrayContaining([expect.objectContaining({ sheet: "A4", fold: "trifold" })]),
        );
        expect(c5?.sheets).toEqual(
            expect.arrayContaining([expect.objectContaining({ sheet: "A4", fold: "half" })]),
        );
        const geometry = client.envelopes.geometry("DL", "DE") as {
            sheets?: Array<{ sheet: string; fold: string }>;
        };
        expect(geometry.sheets?.some((s) => s.sheet === "A4" && s.fold === "trifold")).toBe(true);
    });

    it("resolves jurisdiction timezone from embedded jurisdictions", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(client.jurisdictions.timezoneForCountry("DE")).toBe("Europe/Berlin");
    });

    it("quotes postage via embedded catalog without Node require", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const estimate = await boundProvider(client).price({
            productId: "standardbrief",
            countryCode: "DE",
            weight: 20,
        });
        expect(estimate.productId).toBeTruthy();
        expect(estimate.amount).toBeGreaterThan(0);
        expect(estimate.currency).toBe("EUR");
    });

    it("binds catalog ids without a providers row", () => {
        const client = new PortoClient();
        expect(client.provider("deutschepost").providerId).toBe("deutschepost");
    });
});

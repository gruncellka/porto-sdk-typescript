import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/client.js";
import { boundProvider } from "../support/bound-provider.js";

describe("product options with service discovery", () => {
    it("includes priced ServiceOptions on ProductOption", () => {
        const bound = boundProvider(new PortoClient());
        const rows = bound.options({ countryCode: "DE", weight: 20, envelopeId: "DL" });
        const chosen = rows.find((row) => row.id === "standardbrief");
        expect(chosen).toBeDefined();
        const serviceIds = new Set(chosen!.services.map((svc) => svc.id));
        expect(serviceIds.has("einschreiben")).toBe(true);
        expect(serviceIds.has("einschreiben_rueckschein")).toBe(true);
        const einschreiben = chosen!.services.find((svc) => svc.id === "einschreiben");
        expect(einschreiben?.kind).toBe("registered");
        expect(einschreiben?.amount).toBeGreaterThan(0);
        expect(einschreiben?.currency).toBe("EUR");
    });

    it("pins ambiguous registered from discovered service id", async () => {
        const bound = boundProvider(new PortoClient());
        const rows = bound.options({ countryCode: "DE", weight: 20, envelopeId: "DL" });
        const chosen = rows.find((row) => row.id === "standardbrief")!;
        const pin = chosen.services.find(
            (svc) => svc.kind === "registered" && svc.id === "einschreiben",
        );
        expect(pin).toBeDefined();
        const porto = await bound.resolve({
            countryCode: "DE",
            weight: 20,
            envelopeId: "DL",
            productId: chosen.id,
            services: ["registered"],
            serviceIds: [pin!.id],
        });
        expect(porto.isValid).toBe(true);
        expect(porto.serviceIds).toContain("einschreiben");
        expect(porto.amount).toBe((chosen.amount ?? 0) + (pin!.amount ?? 0));
    });

    it("scopes service lists per product at the same destination", () => {
        const bound = boundProvider(new PortoClient(), "swisspost");
        const rows = bound.options({ countryCode: "CH", weight: 20 });
        expect(rows.length).toBeGreaterThan(1);
        for (const row of rows) {
            expect(Array.isArray(row.services)).toBe(true);
            expect(row.services.length).toBeGreaterThan(0);
            expect(row.services.every((svc) => Boolean(svc.id) && svc.currency === "CHF")).toBe(
                true,
            );
        }
        const [left, right] = rows;
        // Each ProductOption carries its own list (product × zone), not a shared global bag.
        expect(left!.services).not.toBe(right!.services);
    });
});

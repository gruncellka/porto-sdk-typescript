import { describe, expect, it, vi } from "vitest";

import { PortoClient } from "../../src/client.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { composeQuote } from "../../src/services/resolution/quote.js";
import { boundProvider } from "../support/bound-provider.js";

describe("authoritative quote composition", () => {
    it("resolve amount includes bound service and matches price()", async () => {
        const client = new PortoClient();
        const bound = boundProvider(client);
        const porto = await bound.resolve({
            countryCode: "DE",
            weight: 20,
            envelopeId: "DL",
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(porto.product.id).toBe("standardbrief");
        const product = porto.components.find((row) => row.kind === "product");
        const service = porto.components.find((row) => row.id === "einschreiben");
        expect(product?.amount).toBe(95);
        expect(service?.amount).toBeGreaterThan(0);
        expect(porto.amount).toBe((product?.amount ?? 0) + (service?.amount ?? 0));
        expect(porto.components.reduce((sum, row) => sum + row.amount, 0)).toBe(porto.amount);

        const pricing = await bound.price({
            countryCode: "DE",
            weight: 20,
            envelopeId: "DL",
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(pricing.amount).toBe(porto.amount);
        expect(pricing.currency).toBe(porto.currency);

        const prepared = await bound._prepare({ porto });
        expect(prepared.request.value).toBe(porto.amount);
        expect(prepared.preCalculatedPrice).toBe(porto.amount);
    });

    it("missing bound-service price fails closed", async () => {
        const client = new PortoClient();
        const bound = boundProvider(client);
        vi.spyOn(bound._resolver, "getServicePrice").mockReturnValue(null);
        await expect(
            bound.resolve({
                countryCode: "DE",
                weight: 20,
                envelopeId: "DL",
                services: ["registered"],
                serviceIds: ["einschreiben"],
            }),
        ).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_PRICE_NOT_FOUND,
            details: { service_id: "einschreiben" },
        });
        await expect(
            bound.price({
                countryCode: "DE",
                weight: 20,
                envelopeId: "DL",
                services: ["registered"],
                serviceIds: ["einschreiben"],
            }),
        ).rejects.toBeInstanceOf(PortoError);
    });

    it("explicit zero service price is a component", async () => {
        const client = new PortoClient();
        const bound = boundProvider(client);
        vi.spyOn(bound._resolver, "getServicePrice").mockReturnValue(0);
        const porto = await bound.resolve({
            countryCode: "DE",
            weight: 20,
            envelopeId: "DL",
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(porto.components.find((row) => row.id === "einschreiben")?.amount).toBe(0);
        expect(porto.amount).toBe(95);
    });

    it("composeQuote sums and fails closed", () => {
        const quote = composeQuote({
            productId: "standardbrief",
            productAmount: 95,
            zoneId: "domestic",
            weightTierId: "W0020",
            serviceIds: ["einschreiben"],
            lookupServicePrice: () => 265,
        });
        expect(quote.amount).toBe(360);

        expect(() =>
            composeQuote({
                productId: "standardbrief",
                productAmount: 95,
                zoneId: "domestic",
                weightTierId: "W0020",
                serviceIds: ["einschreiben"],
                lookupServicePrice: () => null,
            }),
        ).toThrow(PortoError);
    });
});

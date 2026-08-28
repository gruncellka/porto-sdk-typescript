import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/client.js";
import { PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";

describe("0.1.0 public ProviderClient contract", () => {
    describe("resolve happy path", () => {
        it("resolve without product pin", async () => {
            const bound = boundProvider(new PortoClient());
            const porto = await bound.resolve({ countryCode: "DE", weight: 20 });
            expect(porto.isValid).toBe(true);
            expect(porto.product?.id).toBeTruthy();
            expect(porto.amount).toBeGreaterThan(0);
            expect(porto.currency).toBe("EUR");
            expect(porto.restrictions).toBeDefined();
        });

        it("optional product pin", async () => {
            const bound = boundProvider(new PortoClient());
            const porto = await bound.resolve({
                countryCode: "DE",
                weight: 20,
                productId: "standardbrief",
            });
            expect(porto.product?.id).toBe("standardbrief");
            expect(porto.amount).toBeGreaterThan(0);
        });
    });

    describe("quote parity", () => {
        it("price amount equals resolve amount", async () => {
            const bound = boundProvider(new PortoClient());
            const porto = await bound.resolve({ countryCode: "DE", weight: 20 });
            const pricing = await bound.price({ countryCode: "DE", weight: 20 });
            expect(pricing.amount).toBe(porto.amount);
            expect(pricing.currency).toBe(porto.currency);
        });

        it("components sum to amount for bound service", async () => {
            const bound = boundProvider(new PortoClient());
            const porto = await bound.resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered_return_receipt"],
            });
            const total = porto.components.reduce((sum, row) => sum + row.amount, 0);
            expect(total).toBe(porto.amount);
            expect(porto.amount).toBeGreaterThan(0);
        });
    });

    describe("service kind binding", () => {
        it("unique kind binds without catalog pin", async () => {
            const bound = boundProvider(new PortoClient());
            const porto = await bound.resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered_return_receipt"],
            });
            expect(porto.services).toContain("registered_return_receipt");
            expect(porto.serviceIds).toContain("einschreiben_rueckschein");
        });

        it("ambiguous kind fails closed", async () => {
            const bound = boundProvider(new PortoClient());
            await expect(
                bound.resolve({ countryCode: "DE", weight: 20, services: ["registered"] }),
            ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_SERVICE_AMBIGUOUS });
        });

        it("unsupported kind fails closed", async () => {
            const bound = boundProvider(new PortoClient());
            await expect(
                bound.resolve({ countryCode: "DE", weight: 20, services: ["thickness"] }),
            ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_SERVICE_UNSUPPORTED });
        });

        it("incompatible service pins fail closed", async () => {
            const bound = boundProvider(new PortoClient());
            await expect(
                bound.resolve({
                    countryCode: "DE",
                    weight: 20,
                    services: ["registered"],
                    serviceIds: ["einschreiben", "einschreiben_einwurf"],
                }),
            ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_SERVICES_INCOMPATIBLE });
        });
    });

    describe("public verbs", () => {
        it("estimate, advise, prepare, bytes exist on ProviderClient", async () => {
            const bound = boundProvider(new PortoClient());
            const estimate = bound.estimate({
                productId: "standardbrief",
                countryCode: "DE",
                weight: 20,
            });
            expect(estimate.amount).toBeGreaterThan(0);

            const advice = bound.advise({ weight: 20, selectedProductId: "standardbrief" });
            expect(advice.action).toBeTruthy();

            const porto = await bound.resolve({
                countryCode: "DE",
                weight: 20,
                productId: "standardbrief",
            });
            const prepared = await bound.prepare({
                porto,
                recipient: {
                    name: "Recipient",
                    line1: "Turmstrasse 1",
                    postalCode: "10115",
                    city: "Berlin",
                    countryCode: "DE",
                },
            });
            expect(prepared.porto?.product.id).toBe("standardbrief");
        });
    });

    describe("price zone derivation", () => {
        it("price derives zone from countryCode", async () => {
            const bound = boundProvider(new PortoClient());
            const domestic = await bound.price({ countryCode: "DE", weight: 20 });
            const eu = await bound.price({ countryCode: "FR", weight: 20 });
            const world = await bound.price({ countryCode: "US", weight: 20 });
            expect(domestic.zoneId).toBe("domestic");
            expect(eu.zoneId).toBe("zone_1_eu");
            expect(world.zoneId).toBe("world");
            expect(domestic.amount).toBeGreaterThan(0);
            expect(eu.amount).toBeGreaterThan(domestic.amount);
            expect(world.amount).toBeGreaterThan(domestic.amount);
        });
    });
});

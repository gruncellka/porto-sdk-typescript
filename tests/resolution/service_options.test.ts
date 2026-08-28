import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";

describe("listServiceOptionsForProductZone (deutschepost)", () => {
    it("lists registered mail services for domestic standardbrief", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const zone = boundProvider(client)._resolver.resolveZone("DE");
        const options = boundProvider(client)._resolver.listServiceOptionsForProductZone(
            "standardbrief",
            zone.id,
        );
        const ids = options.map((row) => row.id);
        expect(ids).toContain("einschreiben");
        expect(ids).toContain("einschreiben_einwurf");
        const einschreiben = options.find((row) => row.id === "einschreiben");
        expect(einschreiben?.amount).toBeGreaterThan(0);
        // porto-data 0.7.0 services.json has no combinable_with; later catalogs declare it.
        if (einschreiben?.combinableWith) {
            expect(einschreiben.combinableWith).toEqual(["zusatzversicherung"]);
        }
        const switched = options.find((row) => row.id === "einschreiben_rueckschein");
        if (switched?.combinableWith) {
            expect(switched.combinableWith).toEqual(["zusatzversicherung"]);
        }
    });
});

describe("validateServiceSelection (deutschepost)", () => {
    const client = new PortoClient({ providers: { deutschepost: {} } });
    const zoneId = boundProvider(client)._resolver.resolveZone("DE").id;
    const resolver = boundProvider(client)._resolver;

    it("accepts empty selection", () => {
        expect(() => resolver.validateServiceSelection([], "standardbrief", zoneId)).not.toThrow();
        expect(() =>
            resolver.validateServiceSelection(undefined, "standardbrief", zoneId),
        ).not.toThrow();
    });

    it("accepts Einschreiben + Zusatzversicherung", () => {
        expect(() =>
            resolver.validateServiceSelection(
                ["einschreiben", "zusatzversicherung"],
                "standardbrief",
                zoneId,
            ),
        ).not.toThrow();
    });

    it("rejects two Einschreiben variants when catalog declares combinable_with", () => {
        const options = resolver.listServiceOptionsForProductZone("standardbrief", zoneId);
        const einschreiben = options.find((row) => row.id === "einschreiben");
        if (!einschreiben?.combinableWith) {
            expect(() =>
                resolver.validateServiceSelection(
                    ["einschreiben", "einschreiben_einwurf"],
                    "standardbrief",
                    zoneId,
                ),
            ).not.toThrow();
            return;
        }
        expect(() =>
            resolver.validateServiceSelection(
                ["einschreiben", "einschreiben_einwurf"],
                "standardbrief",
                zoneId,
            ),
        ).toThrow(PortoError);
        try {
            resolver.validateServiceSelection(
                ["einschreiben", "einschreiben_einwurf"],
                "standardbrief",
                zoneId,
            );
        } catch (err) {
            expect(err).toBeInstanceOf(PortoError);
            expect((err as PortoError).code).toBe(PortoErrorCode.PORTO_SERVICES_INCOMPATIBLE);
            expect((err as PortoError).details?.service_ids).toEqual([
                "einschreiben",
                "einschreiben_einwurf",
            ]);
        }
    });

    it("rejects unknown service id", () => {
        expect(() =>
            resolver.validateServiceSelection(["not_a_real_service"], "standardbrief", zoneId),
        ).toThrow(PortoError);
        try {
            resolver.validateServiceSelection(["not_a_real_service"], "standardbrief", zoneId);
        } catch (err) {
            expect(err).toBeInstanceOf(PortoError);
            expect((err as PortoError).code).toBe(PortoErrorCode.PORTO_DATA_NOT_FOUND);
        }
    });
});

describe("prepareMarkExecution service combinability (deutschepost)", () => {
    it("rejects incompatible serviceIds before binding when combinable_with is present", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const bound = boundProvider(client);
        const zoneId = bound._resolver.resolveZone("DE").id;
        const options = bound._resolver.listServiceOptionsForProductZone("standardbrief", zoneId);
        const einschreiben = options.find((row) => row.id === "einschreiben");
        const request = {
            countryCode: "DE",
            weight: 20,
            services: ["registered"] as const,
            serviceIds: ["einschreiben", "einschreiben_einwurf"],
        };
        if (!einschreiben?.combinableWith) {
            await expect(bound.resolve(request)).resolves.toMatchObject({
                product: { id: "standardbrief" },
            });
            return;
        }
        await expect(bound.resolve(request)).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_SERVICES_INCOMPATIBLE,
        });
    });

    it("accepts Einschreiben + Versicherung", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const bound = boundProvider(client);
        const resolution = await bound.resolve({
            countryCode: "DE",
            weight: 20,
            services: ["registered", "insurance"],
            serviceIds: ["einschreiben", "zusatzversicherung"],
        });
        const prepared = await bound._prepare({ porto: resolution });
        expect(prepared.productId).toBeTruthy();
        expect(prepared.request.value).toBe(resolution.amount);
        expect(prepared.preCalculatedPrice).toBe(resolution.amount);
        expect(prepared.preCalculatedPrice).toBeGreaterThan(95);
    });
});

import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";

describe("service kind vs catalog id bind", () => {
    it("fails closed when registered has more than one option and no pin", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        await expect(
            boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered"],
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_SERVICE_AMBIGUOUS });
        try {
            await boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered"],
            });
        } catch (err) {
            expect(err).toBeInstanceOf(PortoError);
            const details = (err as PortoError).details as {
                kind: string;
                candidates: Array<{ id: string }>;
            };
            expect(details.kind).toBe("registered");
            const ids = details.candidates.map((row) => row.id);
            expect(ids).toContain("einschreiben");
            expect(ids).toContain("einschreiben_einwurf");
        }
    });

    it("binds a chosen catalog id among registered options", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await boundProvider(client).resolve({
            countryCode: "DE",
            weight: 20,
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(porto.services).toEqual(["registered"]);
        expect(porto.serviceIds).toEqual(["einschreiben"]);
        expect(porto.availableServices.some((row) => row.id === "einschreiben")).toBe(true);
        expect(porto.availableServices.every((row) => typeof row.kind === "string")).toBe(true);
        expect(porto.features.every((row) => typeof row.kind === "string")).toBe(true);
    });

    it("rejects kind strings in serviceIds", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        await expect(
            boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered"],
                serviceIds: ["registered"],
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_DATA_INVALID });
    });

    it("can() takes FeatureKind only", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const bound = boundProvider(client);
        expect(bound.can("tracking")).toBe(true);
        expect(bound.can("sendungsnummer")).toBe(false);
        expect(bound.can("not_a_kind")).toBe(false);
    });

    it("fails closed when an explicit kind has no catalog or product match", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        await expect(
            boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["thickness"],
            }),
        ).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_SERVICE_UNSUPPORTED,
            details: expect.objectContaining({ kind: "thickness" }),
        });
    });

    it("matches La Poste registered kind via product capability", async () => {
        const client = new PortoClient({ providers: { laposte: {} } });
        const porto = await boundProvider(client, "laposte").resolve({
            countryCode: "FR",
            weight: 20,
            services: ["registered"],
            indemnityTier: "R1",
        });
        expect(porto.services).toEqual(["registered"]);
        expect(porto.product.indemnity?.tier).toBe("R1");
    });
});

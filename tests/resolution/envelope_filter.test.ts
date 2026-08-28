import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";

describe("envelope is a physical fit filter", () => {
    it("does not constrain candidates when envelope is absent", async () => {
        const porto = await boundProvider(
            new PortoClient({ providers: { deutschepost: {} } }),
        ).resolve({
            countryCode: "DE",
            weight: 20,
        });
        expect(porto.product.id).toBe("standardbrief");
    });

    it("drops a weight-unique product that does not fit the envelope", async () => {
        await expect(
            boundProvider(new PortoClient({ providers: { deutschepost: {} } })).resolve({
                countryCode: "DE",
                weight: 20,
                envelopeId: "C4",
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_PRODUCT_NOT_FOUND });
    });

    it("does not select among remaining products that share the envelope", async () => {
        await expect(
            boundProvider(new PortoClient({ providers: { laposte: {} } }), "laposte").resolve({
                countryCode: "FR",
                weight: 20,
                envelopeId: "DL",
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS });
    });

    it("resolves uniquely after the envelope filter (Ukrposhta)", async () => {
        const bound = boundProvider(new PortoClient({ providers: { ukrposhta: {} } }), "ukrposhta");
        const dl = await bound.resolve({
            countryCode: "UA",
            weight: 20,
            envelopeId: "DL",
        });
        expect(dl.product.id).toBe("lyst_standartnyi");
        const b4 = await bound.resolve({
            countryCode: "UA",
            weight: 20,
            envelopeId: "B4",
        });
        expect(b4.product.id).toBe("dokument");
    });
});

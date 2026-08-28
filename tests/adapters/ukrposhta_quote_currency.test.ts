import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/client.js";
import { boundProvider } from "../support/bound-provider.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

/**
 * Ukrposhta quote currency + Dokument flat domestic ladder (porto-data).
 */
describe("ukrposhta quote currency + dokument", () => {
    function client(): PortoClient {
        return new PortoClient({
            providers: { ukrposhta: {} },
            data: resolvePortoDataPathForTests(),
        });
    }

    it("world letter quotes USD amount with USD currency (not UAH)", async () => {
        const quote = await boundProvider(client(), "ukrposhta").price({
            productId: "lyst_standartnyi",
            countryCode: "DE",
            weight: 50,
        });
        expect(quote.amount).toBe(250);
        expect(quote.currency).toBe("USD");
    });

    it("dokument domestic is UAH 55.00 at letter weights", async () => {
        const bound = boundProvider(client(), "ukrposhta");
        const light = await bound.price({
            productId: "dokument",
            countryCode: "UA",
            weight: 50,
        });
        expect(light.amount).toBe(5500);
        expect(light.currency).toBe("UAH");
        expect(bound._resolver.getProductConstraints("dokument").max_weight).toBe(1000);
    });
});

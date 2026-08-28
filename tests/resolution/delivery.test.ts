import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/client.js";
import type { PostalResolutionContext } from "../../src/data/context.js";
import { PortoDataLoader } from "../../src/data/loader.js";
import { DomainIds } from "../../src/data/validator.js";
import { PortoErrorCode } from "../../src/errors.js";
import { PortoResolver } from "../../src/services/porto-resolver.js";
import { boundProvider } from "../support/bound-provider.js";
import { resolvePortoDataPathForTests, testLoaderOptions } from "../support/porto-data-path.js";

function resolver(provider: string): PortoResolver {
    const dataPath = resolvePortoDataPathForTests();
    const loader = new PortoDataLoader(dataPath, { provider, ...testLoaderOptions });
    const validator = new DomainIds(loader);
    const context: PostalResolutionContext = { loader, providerId: provider };
    return new PortoResolver(context, validator, { enabled: false });
}

describe("delivery resolution integration", () => {
    it("deutschepost domestic delivery_hint", async () => {
        const resolved = await resolver("deutschepost").resolve({
            countryCode: "DE",
            weight: 20,
        });
        expect(resolved.product.id).toBe("standardbrief");
        expect(resolved.deliveryHint).toBeDefined();
        expect(resolved.deliveryHint?.span).toBe("between");
        expect(resolved.deliveryHint?.daysMin).toBe(1);
        expect(resolved.deliveryHint?.daysMax).toBe(2);
        expect(resolved.deliveryHint?.workingDays.weekdays).toBe("mon_sat");
        expect(resolved.deliveryHint?.workingDays.market).toBe("DE");
    });

    it("deutschepost international delivery_hint", async () => {
        const resolved = await resolver("deutschepost").resolve({
            countryCode: "US",
            weight: 20,
        });
        expect(resolved.deliveryHint?.daysMax).toBe(12);
        expect(resolved.deliveryHint?.workingDays.market).toBe("DE");
    });

    it("laposte economy explicit product", async () => {
        const resolved = await resolver("laposte").resolve({
            countryCode: "FR",
            weight: 20,
            productId: "lettre_verte",
        });
        expect(resolved.product.id).toBe("lettre_verte");
        expect(resolved.deliveryHint?.span).toBe("within");
        expect(resolved.deliveryHint?.daysMax).toBe(3);
        expect(resolved.deliveryHint?.workingDays.weekdays).toBe("mon_fri");
    });

    it("laposte fast explicit product", async () => {
        const resolved = await resolver("laposte").resolve({
            countryCode: "FR",
            weight: 20,
            productId: "lettre_services_plus",
        });
        expect(resolved.product.id).toBe("lettre_services_plus");
        expect(resolved.deliveryHint?.span).toBe("between");
        expect(resolved.deliveryHint?.daysMin).toBe(1);
        expect(resolved.deliveryHint?.daysMax).toBe(2);
    });

    it("laposte ambiguous without hint", async () => {
        await expect(
            resolver("laposte").resolve({
                countryCode: "FR",
                weight: 20,
            }),
        ).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS,
        });
    });

    it("laposte fastest preference", async () => {
        const resolved = await resolver("laposte").resolve({
            countryCode: "FR",
            weight: 20,
            deliveryPreference: "fastest",
        });
        expect(resolved.product.id).toBe("lettre_services_plus");
    });

    it("swisspost fastest preference", async () => {
        const resolved = await resolver("swisspost").resolve({
            countryCode: "CH",
            weight: 20,
            deliveryPreference: "fastest",
        });
        expect(resolved.product.id).toBe("a_post_standardbrief");
    });

    it("swisspost economy preference", async () => {
        const resolved = await resolver("swisspost").resolve({
            countryCode: "CH",
            weight: 20,
            deliveryPreference: "economy",
        });
        expect(resolved.product.id).toBe("b_post_standardbrief");
    });

    it("client resolve includes delivery_hint", async () => {
        const client = new PortoClient({
            providers: { deutschepost: {} },
            data: resolvePortoDataPathForTests(),
            strictDataValidation: false,
        });
        const result = await boundProvider(client).resolve({
            countryCode: "DE",
            weight: 20,
        });
        expect(result.deliveryHint).toBeDefined();
        expect(result.deliveryHint?.daysMax).toBe(2);
        expect(result.product.id).toBe("standardbrief");
    });

    it("markets loader all providers", () => {
        const dataPath = resolvePortoDataPathForTests();
        const expected: Record<string, [string, string]> = {
            deutschepost: ["DE", "mon_sat"],
            laposte: ["FR", "mon_fri"],
            swisspost: ["CH", "mon_sat"],
            ukrposhta: ["UA", "mon_fri"],
        };
        for (const [provider, [country, weekdays]] of Object.entries(expected)) {
            const loader = new PortoDataLoader(dataPath, { provider, ...testLoaderOptions });
            const market = loader.getMarket(country);
            expect(market).toBeDefined();
            expect(market?.working_days.weekdays).toBe(weekdays);
        }
    });
});

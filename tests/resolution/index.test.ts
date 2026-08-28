import { describe, expect, it } from "vitest";
import type { PostalResolutionContext } from "../../src/data/context.js";
import { PortoDataLoader } from "../../src/data/loader.js";
import { DomainIds } from "../../src/data/validator.js";
import type { PortoError } from "../../src/errors.js";
import { PortoErrorCode } from "../../src/errors/codes.js";
import { PortoResolver } from "../../src/services/porto-resolver.js";
import { estimateForProduct } from "../../src/services/product-options.js";
import { resolvePortoDataPathForTests, testLoaderOptions } from "../support/porto-data-path.js";

function deutschepostResolver() {
    const dataPath = resolvePortoDataPathForTests();
    const loader = new PortoDataLoader(dataPath, {
        provider: "deutschepost",
        ...testLoaderOptions,
    });
    const validator = new DomainIds(loader);
    const context: PostalResolutionContext = { loader, providerId: "deutschepost" };
    return new PortoResolver(context, validator, { enabled: false });
}

describe("ResolutionIndex", () => {
    it("resolves DE standardbrief for domestic W0020", () => {
        const loader = new PortoDataLoader(resolvePortoDataPathForTests(), {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        const ids = loader.resolutionIndex?.candidates("domestic", "W0020") ?? [];
        expect(ids).toContain("standardbrief");
    });

    it("loads service_prices for einschreiben", () => {
        const loader = new PortoDataLoader(resolvePortoDataPathForTests(), {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        expect(loader.getServicePrice("einschreiben")).toBeNull();
        expect(loader.getServicePrice("einschreiben", "domestic")).toBe(265);
        expect(loader.getServicePrice("einschreiben", "world")).toBe(370);
        expect(loader.getServicePrice("einschreiben", "zone_1_eu")).toBe(370);
        expect(loader.getServicePrice("einschreiben", "zone_2_europe")).toBe(370);
        expect(loader.getServicePrice("einschreiben_einwurf")).toBe(235);
    });

    it("PortoResolver reads zoned einschreiben from catalog", () => {
        const resolver = deutschepostResolver();
        expect(resolver.getServicePrice("einschreiben")).toBeNull();
        expect(resolver.getServicePrice("einschreiben", "domestic")).toBe(265);
        expect(resolver.getServicePrice("einschreiben", "world")).toBe(370);
        expect(resolver.getServicePrice("einschreiben", "zone_1_eu")).toBe(370);
        expect(resolver.getServicePrice("einschreiben", "zone_2_europe")).toBe(370);
        expect(resolver.getServicePrice("einschreiben_einwurf")).toBe(235);
    });
});

describe("Deutsche Post maxibrief disambiguation", () => {
    it("resolves maxibrief for domestic W1000 (501 g)", async () => {
        const resolver = deutschepostResolver();
        const resolved = await resolver.resolve({
            countryCode: "DE",
            weight: 501,
        });
        expect(resolved.product.id).toBe("maxibrief");
        expect(resolved.zone.id).toBe("domestic");
        expect(resolved.weightTier.id).toBe("W1000");
    });

    it("resolves maxibrief for international W1000 (501 g)", async () => {
        const resolver = deutschepostResolver();
        const resolved = await resolver.resolve({
            countryCode: "FR",
            weight: 501,
        });
        expect(resolved.product.id).toBe("maxibrief");
        expect(resolved.zone.id).toBe("zone_1_eu");
    });

    it("resolves maxibrief_ausland for international W2000 (1001 g)", async () => {
        const resolver = deutschepostResolver();
        const resolved = await resolver.resolve({
            countryCode: "FR",
            weight: 1001,
        });
        expect(resolved.product.id).toBe("maxibrief_ausland");
        expect(resolved.zone.id).toBe("zone_1_eu");
        expect(resolved.weightTier.id).toBe("W2000");
    });

    it("maps weight over graph max to PORTO_TOO_HEAVY", async () => {
        const resolver = deutschepostResolver();
        await expect(
            resolver.resolve({
                countryCode: "DE",
                weight: 2500,
            }),
        ).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_TOO_HEAVY,
        } satisfies Partial<PortoError>);
    });

    it("maps estimate overweight to PORTO_TOO_HEAVY", () => {
        const resolver = deutschepostResolver();
        try {
            estimateForProduct(resolver, {
                productId: "standardbrief",
                countryCode: "DE",
                weight: 50000,
            });
            expect.unreachable("expected PortoError");
        } catch (err) {
            expect((err as PortoError).code).toBe(PortoErrorCode.PORTO_TOO_HEAVY);
        }
    });
});

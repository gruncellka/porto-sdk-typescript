import { describe, expect, it } from "vitest";

import type { ExecutionAdapter } from "../../src/adapters/protocols/execution.js";
import type { PostalResolutionContext } from "../../src/data/context.js";
import { PortoDataLoader } from "../../src/data/loader.js";
import { DomainIds } from "../../src/data/validator.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { buildPortoMark } from "../../src/execution/index.js";
import { PROOF_FEATURE_KINDS } from "../../src/kinds.js";
import { featureKindsForServiceIds } from "../../src/services/feature-kinds.js";
import { PortoExecution } from "../../src/services/porto-execution.js";
import { PortoResolver } from "../../src/services/porto-resolver.js";
import type { TrackingStatus } from "../../src/types/index.js";
import { resolvePortoDataPathForTests, testLoaderOptions } from "../support/porto-data-path.js";

type AssertNoFeatureKinds = "featureKinds" extends keyof TrackingStatus ? never : true;
const trackingStatusHasNoFeatureKinds: AssertNoFeatureKinds = true;

const rows: Record<string, string[]> = {
    einschreiben: ["tracking", "acceptance_proof"],
    einschreiben_einwurf: ["tracking"],
    einschreiben_rueckschein: [
        "tracking",
        "recipient_signature",
        "return_receipt",
        "delivery_proof",
    ],
};

const kinds: Record<string, "registered" | "registered_return_receipt"> = {
    einschreiben: "registered",
    einschreiben_einwurf: "registered",
    einschreiben_rueckschein: "registered_return_receipt",
};

function resolver(): PortoResolver {
    const loader = new PortoDataLoader(resolvePortoDataPathForTests(), {
        provider: "deutschepost",
        ...testLoaderOptions,
    });
    const context: PostalResolutionContext = { loader, providerId: "deutschepost" };
    return new PortoResolver(context, new DomainIds(loader), { enabled: false });
}

function resolve(serviceId?: string) {
    const kind = serviceId ? kinds[serviceId] : undefined;
    return resolver().resolve({
        countryCode: "DE",
        weight: 20,
        productId: "standardbrief",
        ...(serviceId && kind ? { serviceIds: [serviceId], services: [kind] } : {}),
    });
}

describe("purchased feature kinds", () => {
    it("locks the Deutsche Post catalog rows", async () => {
        const plain = await resolve();
        const bought = await resolve("einschreiben");
        expect(plain.featureKinds).toEqual([]);
        expect(plain.features.map((row) => row.id)).toEqual(bought.features.map((row) => row.id));
        for (const [serviceId, expected] of Object.entries(rows)) {
            expect((await resolve(serviceId)).featureKinds).toEqual(expected);
        }
    });

    it("shows kinds on options before purchase", async () => {
        const zoneId = (await resolve()).zone.id;
        const options = resolver().listServiceOptionsForProductZone("standardbrief", zoneId);
        const byId = new Map(options.map((row) => [row.id, row.featureKinds]));
        for (const [serviceId, expected] of Object.entries(rows)) {
            expect(byId.get(serviceId)).toEqual(expected);
        }
    });

    it("fails closed when a feature id is missing", () => {
        const loader = {
            getService: () => ({ features: ["missing_feature"] }),
            getFeature: () => null,
        };
        expect(() => featureKindsForServiceIds(loader, ["einschreiben"])).toThrow(PortoError);
        try {
            featureKindsForServiceIds(loader, ["einschreiben"]);
        } catch (error) {
            const err = error as PortoError;
            expect(err.code).toBe(PortoErrorCode.PORTO_DATA_INVALID);
            expect(err.details).toMatchObject({
                service_id: "einschreiben",
                feature_id: "missing_feature",
            });
        }
    });

    it("collapses duplicate kinds", () => {
        const loader = {
            getService: () => ({ features: ["sendungsnummer"] }),
            getFeature: () => ({ kind: "tracking" as const }),
        };
        expect(featureKindsForServiceIds(loader, ["einschreiben", "einschreiben_einwurf"])).toEqual(
            ["tracking"],
        );
    });

    it("keeps tracking out of the proof subset and off TrackingStatus", () => {
        expect(PROOF_FEATURE_KINDS).not.toContain("tracking");
        expect(trackingStatusHasNoFeatureKinds).toBe(true);
    });

    it("leaves featureKinds empty on a new mark", () => {
        const mark = buildPortoMark("deutschepost", "internetmarke", {
            content: "mark",
            contentType: "image/png",
            amount: 1,
            trackingNumber: "RR123",
        });
        expect(mark.featureKinds).toEqual([]);
        expect(mark.trackingNumber).toBe("RR123");
    });

    it("copies feature kinds onto the mark after execute", async () => {
        const loader = new PortoDataLoader(resolvePortoDataPathForTests(), {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        const adapter = {
            async mark() {
                return buildPortoMark("deutschepost", "internetmarke", {
                    content: "mark",
                    contentType: "image/png",
                    amount: 1,
                    trackingNumber: "RR123",
                });
            },
        } as unknown as ExecutionAdapter;
        const execution = new PortoExecution(loader, adapter);
        for (const porto of [await resolve(), await resolve("einschreiben_rueckschein")]) {
            const mark = await execution.execute(
                {
                    porto,
                    request: { value: porto.amount },
                    allowedMimeTypes: [],
                    resolvedProduct: porto.product,
                },
                0,
            );
            expect(mark.trackingNumber).toBe("RR123");
            expect(mark.featureKinds).toEqual(porto.featureKinds);
        }
    });
});

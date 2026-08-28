import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { PortoDataLoader } from "../../src/data/loader";
import { EnvelopeMatchService, JsonFormatCatalog } from "../../src/envelopes/match";
import { resolvePortoDataPathForTests } from "../support/porto-data-path";

describe("metadata loaders and envelope matching", () => {
    const loader = new PortoDataLoader(resolvePortoDataPathForTests(), {
        provider: "deutschepost",
    });

    it("lists providers including deutschepost", () => {
        const providers = loader.listProviders();
        expect(providers.some((p) => p.id === "deutschepost")).toBe(true);
    });

    it("lists envelopes including DL and C4", () => {
        const ids = new Set(loader.listEnvelopes().map((e) => e.id));
        expect(ids.has("DL")).toBe(true);
        expect(ids.has("C4")).toBe(true);
    });

    it("loads DL geometry from envelopes catalog", () => {
        const envelope = loader.getEnvelope("DL");
        expect(envelope).toBeDefined();
        expect(envelope?.width).toBe(220);
        expect(envelope?.height).toBe(110);
    });

    it("loads products with envelope_ids", () => {
        const product = loader.getProduct("standardbrief");
        expect(product).toBeDefined();
        expect(product?.envelope_ids).toContain("DL");
    });

    it("strict-matches DL for standardbrief", () => {
        const product = loader.getProduct("standardbrief");
        expect(product).toBeDefined();
        const match = new EnvelopeMatchService(
            new JsonFormatCatalog(loader.envelopesLoader),
        ).resolveById("DL", product!);
        expect(match.kind).toBe("strict_match");
    });

    it("advisory-matches C4 for standardbrief with regional_format", () => {
        const product = loader.getProduct("standardbrief");
        expect(product).toBeDefined();
        const match = new EnvelopeMatchService(
            new JsonFormatCatalog(loader.envelopesLoader),
        ).resolveById("C4", product!);
        expect(match.kind).toBe("advisory_match");
        if (match.kind === "advisory_match") {
            expect(match.advisoryOnly).toBe(true);
            expect(match.reason).toBe("regional_format");
        }
    });
});

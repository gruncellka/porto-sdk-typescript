import { describe, expect, it } from "vitest";

import type { PostalResolutionContext } from "../../src/data/context.js";
import { PortoDataLoader } from "../../src/data/loader.js";
import { DomainIds } from "../../src/data/validator.js";
import { ExecutionBinding } from "../../src/services/execution-binding.js";
import { PortoResolver } from "../../src/services/porto-resolver.js";
import { resolveWireCode } from "../../src/services/wire-resolution.js";
import { resolvePortoDataPathForTests, testLoaderOptions } from "../support/porto-data-path.js";

const dataPath = resolvePortoDataPathForTests();

function resolverFor(provider: string): PortoResolver {
    const loader = new PortoDataLoader(dataPath, { provider, ...testLoaderOptions });
    const validator = new DomainIds(loader);
    const context: PostalResolutionContext = { loader, providerId: provider };
    return new PortoResolver(context, validator, { enabled: false });
}

describe("wire resolution (porto-data 0.5.0)", () => {
    it("resolves Deutsche Post internetmarke base code", () => {
        const loader = new PortoDataLoader(dataPath, {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        const graph = loader.resolutionGraph;
        expect(graph.strategy).toBe("service");
        expect(
            resolveWireCode({
                wireEdges: graph.wire_edges ?? {},
                strategy: graph.strategy,
                wire: "internetmarke",
                productId: "standardbrief",
                zoneId: "domestic",
            }),
        ).toBe(1);
    });

    it("resolves service override on Deutsche Post", () => {
        const loader = new PortoDataLoader(dataPath, {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        const binding = new ExecutionBinding(loader);
        expect(
            binding.resolveWireCode({
                wire: "internetmarke",
                productId: "kompaktbrief",
                zoneId: "zone_1_eu",
                serviceIds: ["einschreiben"],
            }),
        ).toBe(11016);
    });

    it("lists wire ids on PortoResolver; binds codes via ExecutionBinding", () => {
        const resolver = resolverFor("deutschepost");
        expect(resolver.listWireIds()).toEqual(["internetmarke"]);
        const loader = new PortoDataLoader(dataPath, {
            provider: "deutschepost",
            ...testLoaderOptions,
        });
        const binding = new ExecutionBinding(loader);
        expect(
            binding.resolveWireCode({
                wire: "internetmarke",
                productId: "standardbrief",
                zoneId: "domestic",
                serviceIds: ["einschreiben"],
            }),
        ).toBe(1007);
    });

    it("loads La Poste strategy id and wire base equals product id", () => {
        const loader = new PortoDataLoader(dataPath, { provider: "laposte", ...testLoaderOptions });
        const graph = loader.resolutionGraph;
        expect(graph.strategy).toBe("id");
        const wire = graph.wire_edges?.mon_timbre_en_ligne ?? {};
        for (const [productId, zones] of Object.entries(wire)) {
            for (const [, entry] of Object.entries(zones)) {
                expect(entry.base).toBe(productId);
            }
        }
    });

    it("resolves Swiss Post webstamp catalog key", () => {
        const loader = new PortoDataLoader(dataPath, {
            provider: "swisspost",
            ...testLoaderOptions,
        });
        const graph = loader.resolutionGraph;
        expect(graph.strategy).toBe("speed");
        expect(
            resolveWireCode({
                wireEdges: graph.wire_edges ?? {},
                strategy: graph.strategy,
                wire: "webstamp",
                productId: "a_post_standardbrief",
                zoneId: "domestic",
            }),
        ).toBe("a_post_standardbrief");
    });

    it("resolves Ukrposhta min strategy string code", () => {
        const loader = new PortoDataLoader(dataPath, {
            provider: "ukrposhta",
            ...testLoaderOptions,
        });
        const graph = loader.resolutionGraph;
        expect(graph.strategy).toBe("min");
        expect(
            resolveWireCode({
                wireEdges: graph.wire_edges ?? {},
                strategy: graph.strategy,
                wire: "ukrposhta_ecom",
                productId: "lyst_standartnyi",
                zoneId: "domestic",
            }),
        ).toBe("letter");
    });
});

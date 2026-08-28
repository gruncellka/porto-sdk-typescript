import { describe, expect, it } from "vitest";

import { normalizeResolutionGraph } from "../../src/data/graph-normalize.js";

describe("normalizeResolutionGraph", () => {
    it("maps edges.products to links and preserves mark_edges", () => {
        const graph = normalizeResolutionGraph({
            file_type: "graph",
            unit: { weight: "g" },
            dependencies: {},
            edges: {
                products: {
                    standardbrief: {
                        zones: ["domestic"],
                        weight_tiers: ["W0020"],
                    },
                },
                marks: {
                    domestic: {
                        profile: "domestic",
                        services: { einschreiben: "registered" },
                    },
                },
            },
            services: ["einschreiben"],
        });
        expect(graph.links.standardbrief.zones).toEqual(["domestic"]);
        expect(graph.mark_edges.domestic.profile).toBe("domestic");
        expect(graph.services).toEqual(["einschreiben"]);
    });
});

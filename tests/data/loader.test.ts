import { describe, expect, it } from "vitest";

import { ValidatedPortoDataLoader } from "../../src/data/porto-data-loader";
import { PortoDataValidator } from "../../src/data/porto-data-validator";
import { resolvePortoDataPathForTests } from "../support/porto-data-path";

describe("ValidatedPortoDataLoader", () => {
    it("loads and validates mapped porto-data files", () => {
        const loader = new ValidatedPortoDataLoader(resolvePortoDataPathForTests(), true);
        const result = loader.load();
        expect(result.files["products.json"]).toBeTruthy();
        expect(result.registries.products.length).toBeGreaterThan(0);
        expect(["graph", "resolution_graph"]).toContain(
            result.registries.resolutionGraph.file_type,
        );
    });

    it("fails on cross-file reference mismatches", () => {
        const dataPath = resolvePortoDataPathForTests();
        const loader = new ValidatedPortoDataLoader(dataPath, true);
        const loaded = loader.load();
        const validator = new PortoDataValidator({
            dataPath,
            metadata: loaded.metadata,
            mappings: loaded.mappings,
            verifyChecksums: true,
        });
        const broken = {
            ...loaded.registries,
            products: loaded.registries.products.map((p, idx) =>
                idx === 0 ? { ...p, weight_tier: "MISSING_TIER" } : p,
            ),
        };
        expect(() => validator.validateCrossFileConsistency(broken)).toThrow();
    });
});

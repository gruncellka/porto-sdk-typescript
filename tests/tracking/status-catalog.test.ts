import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePortoFeaturesRoot } from "../../scripts/lib/resolve-porto-features-root.mjs";
import { PortoStatus, TrackingState } from "../../src/types/index.js";

describe("PortoStatus catalog", () => {
    it("matches statuses.json as a set with descriptions", () => {
        const path = join(resolvePortoFeaturesRoot(), "statuses.json");
        const doc = JSON.parse(readFileSync(path, "utf8")) as {
            codes: Array<{ code: string; description: string; domain: string }>;
        };
        const codes = doc.codes.map((row) => row.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(new Set(codes)).toEqual(new Set(Object.values(PortoStatus)));
        expect(codes.every((code) => !code.includes("_"))).toBe(true);
        expect(TrackingState).toBe(PortoStatus);
        for (const row of doc.codes) {
            expect(row.description.trim().length).toBeGreaterThan(0);
            expect(row.domain.trim().length).toBeGreaterThan(0);
        }
    });
});

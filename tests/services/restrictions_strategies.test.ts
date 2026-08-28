import { describe, expect, it } from "vitest";
import { resolve as resolveImpact } from "../../src/services/restrictions/impact.js";
import { resolve as resolveLegal } from "../../src/services/restrictions/legal.js";
import { resolve as resolveRouting } from "../../src/services/restrictions/routing.js";
import type { LegalRestriction } from "../../src/services/restrictions/types.js";

function legalRegion(args?: {
    partial?: boolean;
    jurisdictions?: Record<string, { reference: string; effective_from: string }[]>;
}) {
    const partial = args?.partial === true;
    const jurisdictions = args?.jurisdictions ?? {
        EU: [{ reference: "https://example.test/eu", effective_from: "2020-01-01" }],
        UA: [{ reference: "https://example.test/ua", effective_from: "2014-04-15" }],
    };
    return {
        jurisdictions,
        reason: "Regional legal restrictions apply.",
        description: partial
            ? "Applicable jurisdictional measures cover part of this region."
            : "Applicable jurisdictional measures cover this region.",
        ...(partial ? { partial: true as const } : {}),
    };
}

describe("restrictions strategies", () => {
    it("legal filters by jurisdiction", () => {
        const catalog = { UA: { regions: { "UA-14": legalRegion({ partial: true }) } } };
        const today = new Date("2026-01-01T00:00:00.000Z");
        const eu = resolveLegal(catalog, "UA", "UA-14", { jurisdictions: ["EU"], today });
        const ua = resolveLegal(catalog, "UA", "UA-14", { jurisdictions: ["UA"], today });
        expect(eu).toHaveLength(1);
        expect(eu[0].impact).toBe("warn");
        expect(eu[0].partial).toBe(true);
        expect(eu[0].jurisdictions[0].jurisdiction).toBe("EU");
        expect(eu[0].jurisdictions[0].reference).toBe("https://example.test/eu");
        expect(ua[0].jurisdictions[0].jurisdiction).toBe("UA");
        expect(ua[0].jurisdictions[0].reference).toBe("https://example.test/ua");
    });

    it("legal full region blocks", () => {
        const catalog = { UA: { regions: { "UA-43": legalRegion() } } };
        const found = resolveLegal(catalog, "UA", "UA-43", {
            jurisdictions: ["EU"],
            today: new Date("2026-01-01T00:00:00.000Z"),
        });
        expect(found[0].impact).toBe("block");
        expect(found[0].partial).toBe(false);
        expect(found[0].regionCode).toBe("UA-43");
    });

    it("routing is destination only", () => {
        const catalog = {
            CY: {
                authority: "CY",
                reference: "https://example.test/cy",
                reason: "forward",
                description: "test",
                regions: { "CY-01": { partial: true }, "CY-06": {} },
            },
        };
        const one = resolveRouting(catalog, "CY", "CY-01");
        expect(one).toEqual([
            {
                impact: "warn",
                countryCode: "CY",
                regionCode: "CY-01",
                partial: true,
                authority: "CY",
                reference: "https://example.test/cy",
                reason: "forward",
                description: "test",
            },
        ]);
    });

    it("impact country-only warns even with block items", () => {
        const legal: LegalRestriction[] = [
            {
                impact: "block",
                countryCode: "UA",
                regionCode: "UA-43",
                partial: false,
                jurisdictions: [],
                reason: "",
                description: "",
            },
            {
                impact: "warn",
                countryCode: "UA",
                regionCode: "UA-14",
                partial: true,
                jurisdictions: [],
                reason: "",
                description: "",
            },
        ];
        expect(resolveImpact(legal, [], { regionPrecise: false })).toBe("warn");
        expect(resolveImpact(legal, [], { regionPrecise: true })).toBe("block");
        expect(resolveImpact([], [], { regionPrecise: true })).toBeNull();
    });
});

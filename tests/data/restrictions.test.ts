import { describe, expect, it } from "vitest";
import { PortoClient } from "../../src/client";
import { RestrictionsLoader } from "../../src/data/entities/restrictions";
import { PortoErrorCode } from "../../src/errors";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

function region(args?: {
    partial?: boolean;
    jurisdictions?: Record<string, unknown[]>;
}): Record<string, unknown> {
    const partial = args?.partial === true;
    const payload: Record<string, unknown> = {
        jurisdictions: args?.jurisdictions ?? {
            EU: [
                {
                    reference: "https://example.test/eu",
                    effective_from: "2020-01-01",
                    effective_to: null,
                },
            ],
        },
        reason: "Regional legal restrictions apply.",
        description: partial
            ? "Applicable jurisdictional measures cover part of this region."
            : "Applicable jurisdictional measures cover this region.",
    };
    if (partial) payload.partial = true;
    return payload;
}

function createLoader(legal: Record<string, unknown>): RestrictionsLoader {
    const loader = new RestrictionsLoader("", new Map());
    loader.load({
        file_type: "restrictions",
        legal,
    });
    return loader;
}

describe("RestrictionsLoader", () => {
    it("fails closed without jurisdictions", () => {
        const loader = new RestrictionsLoader("", new Map());
        expect(() =>
            loader.load({
                legal: {
                    UA: {
                        regions: {
                            "UA-14": {},
                        },
                    },
                },
            }),
        ).toThrow(expect.objectContaining({ code: PortoErrorCode.PORTO_DATA_INVALID }));
    });

    it("fails closed when routing has jurisdictions", () => {
        const loader = new RestrictionsLoader("", new Map());
        expect(() =>
            loader.load({
                routing: {
                    CY: {
                        authority: "CY",
                        reference: "https://example.test/cy",
                        reason: "x",
                        description: "x",
                        jurisdictions: { EU: [{ reference: null, effective_from: "2020-01-01" }] },
                    },
                },
            }),
        ).toThrow(expect.objectContaining({ code: PortoErrorCode.PORTO_DATA_INVALID }));
    });

    it("fails closed on unknown frameworks key", () => {
        const loader = new RestrictionsLoader("", new Map());
        expect(() =>
            loader.load({
                legal: {
                    UA: {
                        regions: {
                            "UA-14": {
                                frameworks: {
                                    EU: [{ reference: null, effective_from: "2020-01-01" }],
                                },
                            },
                        },
                    },
                },
            }),
        ).toThrow(expect.objectContaining({ code: PortoErrorCode.PORTO_DATA_INVALID }));
    });

    it("country check returns regional legal facts", () => {
        const loader = createLoader({
            UA: {
                regions: {
                    "UA-14": region({ partial: true }),
                    "UA-43": region(),
                },
            },
        });
        const selected = loader.classifyRestrictions("UA", undefined, { jurisdictions: ["EU"] });
        expect(new Set(Object.keys(selected.legal.UA.regions as object))).toEqual(
            new Set(["UA-14", "UA-43"]),
        );
        expect(selected.routing).toEqual({});
    });

    it("selects matching legal fact by region", () => {
        const loader = createLoader({
            UA: {
                regions: {
                    "UA-14": region({ partial: true }),
                    "UA-43": region(),
                },
            },
        });
        const selected = loader.classifyRestrictions("UA", "UA-14", { jurisdictions: ["EU"] });
        expect(Object.keys(selected.legal.UA.regions as object)).toEqual(["UA-14"]);
    });

    it("filters jurisdictions by provider jurisdiction", () => {
        const loader = createLoader({
            UA: {
                regions: {
                    "UA-14": region({
                        partial: true,
                        jurisdictions: {
                            EU: [
                                {
                                    reference: "https://example.test/eu",
                                    effective_from: "2020-01-01",
                                    effective_to: null,
                                },
                            ],
                            UA: [
                                {
                                    reference: "https://example.test/ua",
                                    effective_from: "2014-04-15",
                                    effective_to: null,
                                },
                            ],
                        },
                    }),
                },
            },
        });
        const eu = loader.classifyRestrictions("UA", "UA-14", { jurisdictions: ["EU"] });
        const ua = loader.classifyRestrictions("UA", "UA-14", { jurisdictions: ["UA"] });
        expect(
            Object.keys(
                (eu.legal.UA.regions as { "UA-14": { jurisdictions: object } })["UA-14"]
                    .jurisdictions,
            ),
        ).toEqual(["EU"]);
        expect(
            Object.keys(
                (ua.legal.UA.regions as { "UA-14": { jurisdictions: object } })["UA-14"]
                    .jurisdictions,
            ),
        ).toEqual(["UA"]);
    });

    it("ignores future instruments", () => {
        const loader = createLoader({
            DE: {
                jurisdictions: {
                    EU: [
                        {
                            reference: null,
                            effective_from: "2999-01-01",
                            effective_to: null,
                        },
                    ],
                },
                reason: "Regional legal restrictions apply.",
                description: "Applicable jurisdictional measures cover this region.",
            },
        });
        const selected = loader.classifyRestrictions("DE", undefined, {
            jurisdictions: ["EU"],
            asOf: new Date("2026-01-01T00:00:00.000Z"),
        });
        expect(selected.legal).toEqual({});
    });

    it("catalog UA-14 returns a legal fact for the default client", () => {
        const sdk = new PortoClient({
            providers: { deutschepost: {} },
            data: resolvePortoDataPathForTests(),
        });
        const found = sdk.restrictions.check("UA", "UA-14");
        expect(found.impact).toBe("warn");
        expect(found.legal).toHaveLength(1);
        expect(found.legal[0]).toMatchObject({
            regionCode: "UA-14",
            partial: true,
            jurisdictions: [{ jurisdiction: "EU" }],
        });
        expect(found.routing).toEqual([]);
    });

    it("rejects operational collection", () => {
        const loader = new RestrictionsLoader("", new Map());
        expect(() =>
            loader.load({
                operational: {
                    HT: {
                        authority: "x",
                        reference: "x",
                        reason: "x",
                        description: "x",
                        effective_from: "2020-01-01",
                    },
                },
            }),
        ).toThrow(expect.objectContaining({ code: PortoErrorCode.PORTO_DATA_INVALID }));
    });
});

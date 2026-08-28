import { describe, expect, it } from "vitest";
import { PortoClient } from "../../src/client";
import type { Restrictions } from "../../src/services/restrictions/index.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

function client(provider = "deutschepost"): PortoClient {
    return new PortoClient({
        providers: { [provider]: {} },
        data: resolvePortoDataPathForTests(),
    });
}

describe("restrictions surface", () => {
    it("unrestricted country has empty restriction result", async () => {
        const sdk = client();
        const found = sdk.provider("deutschepost").restrictions.check("DE");
        expect(found.impact).toBeNull();
        expect(found.legal).toEqual([]);
        expect(found.routing).toEqual([]);

        const porto = await sdk.provider("deutschepost").resolve({
            countryCode: "DE",
            weight: 20,
            envelopeId: "DL",
        });
        expect(porto.restrictions).toEqual(found);
        expect(porto.warnings).toEqual([]);
    });

    it("country resolve returns UA legal items with warn aggregate", async () => {
        const sdk = client();
        const found = sdk.provider("deutschepost").restrictions.check("UA");
        expect(found.impact).toBe("warn");
        expect(new Set(found.legal.map((item) => item.regionCode))).toEqual(
            new Set(["UA-09", "UA-14", "UA-23", "UA-40", "UA-43", "UA-65"]),
        );
        expect(found.routing).toEqual([]);

        const porto = await sdk.provider("deutschepost").resolve({
            countryCode: "UA",
            weight: 20,
            envelopeId: "DL",
        });
        expect(porto.restrictions).toEqual(found);
        // Country resolve never promotes a child regional block.
        expect(porto.restrictions.impact).toBe("warn");
    });

    it("Kherson partial region warns via check drill-down", () => {
        const found = client().provider("deutschepost").restrictions.check("UA", "UA-65");
        expect(found.impact).toBe("warn");
        expect(found.legal).toHaveLength(1);
        expect(found.legal[0]).toMatchObject({
            regionCode: "UA-65",
            partial: true,
        });
        expect(found.routing).toEqual([]);
    });

    it("fully matched legal territory blocks via check", () => {
        const found = client().provider("deutschepost").restrictions.check("UA", "UA-43");
        expect(found.impact).toBe("block");
        expect(found.legal[0]).toMatchObject({
            regionCode: "UA-43",
            partial: false,
        });
    });

    it("unaffected UA region has no restriction via check", () => {
        const found = client().provider("deutschepost").restrictions.check("UA", "UA-32");
        expect(found.impact).toBeNull();
        expect(found.legal).toEqual([]);
        expect(found.routing).toEqual([]);
    });

    it("cyprus routing warns via check", () => {
        const found = client().provider("deutschepost").restrictions.check("CY", "CY-01");
        expect(found.impact).toBe("warn");
        expect(found.legal).toEqual([]);
        expect(found.routing[0]).toMatchObject({
            regionCode: "CY-01",
            authority: "CY",
            partial: true,
        });
    });

    it("swisspost uses CH jurisdiction", () => {
        const found = client("swisspost").provider("swisspost").restrictions.check("UA", "UA-65");
        expect(found.legal[0].jurisdictions[0].jurisdiction).toBe("CH");
        expect(found.legal[0].jurisdictions[0].reference).toContain("seco.admin.ch");
    });

    it("ukrposhta uses UA jurisdiction", () => {
        const found = client("ukrposhta").provider("ukrposhta").restrictions.check("UA", "UA-65");
        expect(found.legal[0].jurisdictions[0].jurisdiction).toBe("UA");
        expect(found.legal[0].jurisdictions[0].reference).toBe(
            "https://zakon.rada.gov.ua/laws/show/1207-18",
        );
    });

    it("routing is same across providers", () => {
        const dp = client("deutschepost")
            .provider("deutschepost")
            .restrictions.check("CY", "CY-06");
        const ch = client("swisspost").provider("swisspost").restrictions.check("CY", "CY-06");
        expect(dp).toEqual(ch);
    });
});

import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { recommendProductForWeight } from "../../src/services/product-advice.js";
import { boundProvider } from "../support/bound-provider.js";

describe("recommendProductForWeight (deutschepost)", () => {
    const resolver = () =>
        boundProvider(new PortoClient({ providers: { deutschepost: {} } }))._resolver;

    it("AUTO_UPGRADE Standardbrief → Kompaktbrief when weight exceeds 20 g", () => {
        const advice = recommendProductForWeight(resolver(), {
            weight: 24.9,
            selectedProductId: "standardbrief",
        });
        expect(advice.action).toBe("AUTO_UPGRADE");
        expect(advice.effectiveProductId).toBe("kompaktbrief");
        expect(advice.reason).toBe("weight_over");
        expect(advice.suggestedProductId).toBe("kompaktbrief");
    });

    it("KEEP Grossbrief with larger_than_needed on light weight", () => {
        const advice = recommendProductForWeight(resolver(), {
            weight: 24.9,
            selectedProductId: "grossbrief",
        });
        expect(advice.action).toBe("KEEP");
        expect(advice.effectiveProductId).toBe("grossbrief");
        expect(advice.reason).toBe("larger_than_needed");
        expect(advice.suggestedProductId).toBe("kompaktbrief");
    });

    it("KEEP when selected still covers weight", () => {
        const advice = recommendProductForWeight(resolver(), {
            weight: 15,
            selectedProductId: "standardbrief",
        });
        expect(advice.action).toBe("KEEP");
        expect(advice.effectiveProductId).toBe("standardbrief");
        expect(advice.reason).toBeNull();
    });

    it("suggests smallest fit when nothing selected", () => {
        const advice = recommendProductForWeight(resolver(), {
            weight: 24.9,
            selectedProductId: null,
        });
        expect(advice.effectiveProductId).toBe("kompaktbrief");
        expect(advice.action).toBe("AUTO_UPGRADE");
    });
});

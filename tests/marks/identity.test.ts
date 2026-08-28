import { describe, expect, it } from "vitest";

import { buildPortoMark, createBoundMarkFactory } from "../../src/execution/index.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("PortoMark identity", () => {
    it("assigns a Porto UUID and adapter-owned provider", () => {
        const { newMark } = createBoundMarkFactory("deutschepost", "internetmarke");
        const mark = newMark({
            content: "https://example.test/stamp.png",
            contentType: "image/png",
            value: 95,
            externalId: "shop-1",
        });
        expect(mark.id).toMatch(UUID_V4);
        expect(mark.provider).toBe("deutschepost");
        expect(mark.wire).toBe("internetmarke");
        expect(mark.externalId).toBe("shop-1");
    });

    it("still assigns an id when externalId is missing", () => {
        const { newMark } = createBoundMarkFactory("deutschepost", "internetmarke");
        const mark = newMark({
            content: "https://example.test/stamp.png",
            contentType: "image/png",
            value: 95,
        });
        expect(mark.id).toMatch(UUID_V4);
        expect(mark.externalId).toBeUndefined();
    });

    it("gives independent UUIDs to different providers", () => {
        const de = createBoundMarkFactory("deutschepost", "internetmarke").newMark({
            content: "a",
            contentType: "image/png",
            value: 1,
        });
        const fr = createBoundMarkFactory("laposte", "webstamp").newMark({
            content: "b",
            contentType: "image/png",
            value: 1,
        });
        expect(de.id).not.toBe(fr.id);
        expect(de.provider).toBe("deutschepost");
        expect(fr.provider).toBe("laposte");
        expect(de.wire).toBe("internetmarke");
        expect(fr.wire).toBe("webstamp");
    });

    it("deutschepost factory cannot emit another provider", () => {
        const { newMark } = createBoundMarkFactory("deutschepost", "internetmarke");
        const mark = newMark({
            content: "x",
            contentType: "image/png",
            value: 1,
        });
        expect(mark.provider).toBe("deutschepost");
        expect(newMark.length).toBe(1);
    });

    it("kernel still requires explicit provider and wire", () => {
        const mark = buildPortoMark("swisspost", "webstamp", {
            content: "c",
            contentType: "application/pdf",
            amount: 10,
        });
        expect(mark.id).toMatch(UUID_V4);
        expect(mark.provider).toBe("swisspost");
        expect(mark.wire).toBe("webstamp");
    });

    it("omits blank wire ids", () => {
        const mark = createBoundMarkFactory("deutschepost", "internetmarke").newMark({
            content: "https://example.test/stamp.png",
            contentType: "image/png",
            value: 95,
            externalId: "  ",
        });
        expect(mark.id).toMatch(UUID_V4);
        expect(mark.externalId).toBeUndefined();
    });

    it("stamps generatedAt as UTC ISO-8601", () => {
        const before = Date.now();
        const mark = createBoundMarkFactory("deutschepost", "internetmarke").newMark({
            content: "x",
            contentType: "image/png",
            value: 1,
        });
        expect(mark.generatedAt.endsWith("Z")).toBe(true);
        const parsed = Date.parse(mark.generatedAt);
        expect(Number.isNaN(parsed)).toBe(false);
        expect(Math.abs(parsed - before)).toBeLessThan(5000);
    });
});

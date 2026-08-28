import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { type PortoMark, buildPortoMark } from "../../src/execution/index.js";
import { normalizeMarkDocument } from "../../src/mark-content.js";

function pngBytes(): Uint8Array {
    return Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
}

function sampleMark(overrides: Partial<PortoMark> = {}): PortoMark {
    return {
        ...buildPortoMark("example", "internetmarke", {
            content: "https://example.test/stamp.png",
            contentType: "image/png",
            amount: 95,
            generatedAt: "2026-07-07T12:00:00",
        }),
        ...overrides,
    };
}

describe("normalizeMarkDocument", () => {
    it("passes through PDF payloads", () => {
        const pdf = new TextEncoder().encode("%PDF-1.4\n");
        const mark = sampleMark({ contentType: "application/pdf" });
        expect(normalizeMarkDocument(mark, pdf)).toEqual(pdf);
    });

    it("passes through PNG payloads", () => {
        const png = pngBytes();
        expect(normalizeMarkDocument(sampleMark(), png)).toEqual(png);
    });

    it("rejects unknown payloads", () => {
        expect(() => normalizeMarkDocument(sampleMark(), new TextEncoder().encode("nope"))).toThrow(
            ValidationError,
        );
    });

    it("uses an optional normalize callback", () => {
        const png = pngBytes();
        const wrapped = new Uint8Array(4 + png.length);
        wrapped.set([0x46, 0x41, 0x4b, 0x45], 0);
        wrapped.set(png, 4);
        expect(
            normalizeMarkDocument(sampleMark(), wrapped, (payload) => {
                if (
                    payload.length >= 4 &&
                    payload[0] === 0x46 &&
                    payload[1] === 0x41 &&
                    payload[2] === 0x4b &&
                    payload[3] === 0x45
                ) {
                    return payload.subarray(4);
                }
                throw new Error("unsupported");
            }),
        ).toEqual(png);
    });
});

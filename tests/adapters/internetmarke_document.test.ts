import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
    extractPngEntries,
    inspectDocumentPayload,
    normalizeDocumentPayload,
} from "../../src/adapters/deutschepost/internetmarke/document-payload.js";

function pngBytes(): Uint8Array {
    return Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
}

function zipStored(name: string, payload: Uint8Array): Uint8Array {
    const nameBytes = new TextEncoder().encode(name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    header[0] = 0x50;
    header[1] = 0x4b;
    view.setUint16(2, 0x0403, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, payload.length, true);
    view.setUint32(22, payload.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    const out = new Uint8Array(header.length + payload.length);
    out.set(header, 0);
    out.set(payload, header.length);
    return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function zipDeflated(name: string, payload: Uint8Array): Uint8Array {
    const compressed = deflateRawSync(payload);
    const nameBytes = new TextEncoder().encode(name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    header[0] = 0x50;
    header[1] = 0x4b;
    view.setUint16(2, 0x0403, true);
    view.setUint16(8, 8, true);
    view.setUint32(18, compressed.length, true);
    view.setUint32(22, payload.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    const out = new Uint8Array(header.length + compressed.length);
    out.set(header, 0);
    out.set(compressed, header.length);
    return out;
}

describe("normalizeDocumentPayload", () => {
    it("passes through PNG bytes", () => {
        const png = pngBytes();
        expect(normalizeDocumentPayload(png)).toEqual(png);
    });

    it("extracts PNG from stored ZIP", () => {
        const png = pngBytes();
        expect(normalizeDocumentPayload(zipStored("0.png", png))).toEqual(png);
    });

    it("extracts PNG from deflated ZIP", () => {
        const png = pngBytes();
        expect(normalizeDocumentPayload(zipDeflated("0.png", png))).toEqual(png);
    });
});

describe("Internetmarke normalizeDocumentPayload", () => {
    it("unwraps ZIP payloads locally", () => {
        const png = pngBytes();
        expect(normalizeDocumentPayload(zipStored("0.png", png))).toEqual(png);
    });
});

describe("inspectDocumentPayload", () => {
    it("lists PNG members without treating ZIP order as position order", () => {
        const png = pngBytes();
        const payload = concatBytes(
            zipStored("2.png", png),
            zipStored("0.png", png),
            zipStored("1.png", png),
        );
        const inspect = inspectDocumentPayload(payload);
        expect(inspect.kind).toBe("zip");
        expect(inspect.png_names_zip_order).toEqual(["2.png", "0.png", "1.png"]);
        expect(inspect.png_names_sorted).toEqual(["0.png", "1.png", "2.png"]);
        expect(extractPngEntries(payload).map((row) => row.name)).toEqual([
            "2.png",
            "0.png",
            "1.png",
        ]);
    });
});

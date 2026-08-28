/**
 * Normalize Internetmarke document downloads (DHL often returns a ZIP containing 0.png).
 */

import { inflateRawSync } from "node:zlib";

export type DocumentInspect = {
    kind: "png" | "zip" | "unknown";
    size: number;
    namelist?: string[];
    entries: Array<{
        name: string;
        png: boolean;
        size?: number;
        compress_size?: number;
        compress_type?: number;
    }>;
    png_names_zip_order: string[];
    png_names_sorted: string[];
    magic?: string;
};

type ZipLocal = {
    name: string;
    compression: number;
    compressedSize: number;
    uncompressedSize: number;
    data: Uint8Array;
};

function zipLocals(data: Uint8Array): ZipLocal[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const locals: ZipLocal[] = [];
    let offset = 0;
    while (offset + 30 <= data.length) {
        if (data[offset] !== 0x50 || data[offset + 1] !== 0x4b) break;
        const signature = view.getUint16(offset + 2, true);
        if (signature !== 0x0403) break;
        const compression = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const uncompressedSize = view.getUint32(offset + 22, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const nameStart = offset + 30;
        const nameEnd = nameStart + nameLen;
        if (nameEnd > data.length) break;
        const name = new TextDecoder().decode(data.subarray(nameStart, nameEnd));
        const dataStart = nameEnd + extraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > data.length) break;
        locals.push({
            name,
            compression,
            compressedSize,
            uncompressedSize,
            data: data.subarray(dataStart, dataEnd),
        });
        offset = dataEnd;
    }
    return locals;
}

function inflateEntry(entry: ZipLocal): Uint8Array {
    if (entry.compression === 0) return entry.data;
    if (entry.compression === 8) return new Uint8Array(inflateRawSync(entry.data));
    throw new Error(`Unsupported ZIP compression method ${entry.compression}`);
}

export function inspectDocumentPayload(data: Uint8Array): DocumentInspect {
    if (
        data.length >= 8 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47
    ) {
        return {
            kind: "png",
            size: data.length,
            entries: [{ name: "inline.png", png: true, size: data.length }],
            png_names_zip_order: ["inline.png"],
            png_names_sorted: ["inline.png"],
        };
    }
    if (data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b) {
        const locals = zipLocals(data);
        const names = locals.map((row) => row.name);
        const pngNames = names.filter((name) => name.toLowerCase().endsWith(".png"));
        return {
            kind: "zip",
            size: data.length,
            namelist: names,
            entries: locals.map((row) => ({
                name: row.name,
                png: row.name.toLowerCase().endsWith(".png"),
                size: row.uncompressedSize,
                compress_size: row.compressedSize,
                compress_type: row.compression,
            })),
            png_names_zip_order: pngNames,
            png_names_sorted: [...pngNames].sort((a, b) => a.localeCompare(b)),
        };
    }
    return {
        kind: "unknown",
        size: data.length,
        entries: [],
        png_names_zip_order: [],
        png_names_sorted: [],
        magic: Array.from(data.subarray(0, 4))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
    };
}

export function extractPngEntries(data: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
    if (
        data.length >= 8 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47
    ) {
        return [{ name: "inline.png", bytes: data }];
    }
    if (!(data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b)) {
        return [];
    }
    const out: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const entry of zipLocals(data)) {
        if (!entry.name.toLowerCase().endsWith(".png")) continue;
        out.push({ name: entry.name, bytes: inflateEntry(entry) });
    }
    return out;
}

export function normalizeDocumentPayload(data: Uint8Array): Uint8Array {
    if (
        data.length >= 8 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47
    ) {
        return data;
    }
    if (data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b) {
        const pngs = extractPngEntries(data);
        const first = [...pngs].sort((a, b) => a.name.localeCompare(b.name))[0];
        if (!first) {
            throw new Error("Internetmarke stamp ZIP contains no PNG entry");
        }
        return first.bytes;
    }
    throw new Error(
        `Unsupported Internetmarke stamp payload (magic=${String.fromCharCode(...data.subarray(0, 4))}, len=${data.length})`,
    );
}

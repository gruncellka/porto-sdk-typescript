import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    extractPngEntries,
    inspectDocumentPayload,
} from "../../src/adapters/deutschepost/internetmarke/document-payload.js";
import type { PortoMark } from "../../src/execution/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function labRoot(): string {
    let current = HERE;
    for (let i = 0; i < 8; i += 1) {
        if (existsSync(join(current, "labs", "experiments", "internetmarke"))) {
            return current;
        }
        current = dirname(current);
    }
    return process.cwd();
}

export function paidManyDir(slug: string, sdk = "typescript"): string {
    return join(
        labRoot(),
        "labs",
        "experiments",
        "internetmarke",
        "artifacts",
        "paid-many",
        sdk,
        slug,
    );
}

export async function persistPaidManyArtifacts(opts: {
    slug: string;
    marks: PortoMark[];
    trace: Record<string, unknown> | null | undefined;
}): Promise<Record<string, unknown>> {
    const target = paidManyDir(opts.slug);
    const pngDir = join(target, "pngs");
    mkdirSync(pngDir, { recursive: true });
    const request = (opts.trace?.request as Record<string, unknown> | undefined) ?? {};
    const response = (opts.trace?.response as Record<string, unknown> | undefined) ?? {};
    const positions = Array.isArray(request.positions) ? request.positions : [];
    const checkout = {
        url: opts.trace?.url,
        positions_length: positions.length,
        total: request.total,
        productCodes: positions.map((row) =>
            row && typeof row === "object"
                ? (row as { productCode?: unknown }).productCode
                : undefined,
        ),
        shopOrderId: response.shopOrderId ?? request.shopOrderId,
        request,
        response,
        response_headers: opts.trace?.response_headers ?? {},
    };
    writeFileSync(join(target, "checkout.json"), `${JSON.stringify(checkout, null, 2)}\n`);
    const link = opts.marks[0]?.content;
    const inspect: Record<string, unknown> = {
        link,
        mark_count: opts.marks.length,
        external_ids: opts.marks.map((mark) => mark.externalId),
        png_count: 0,
        correlation_observed: null,
    };
    if (typeof link === "string" && link.startsWith("http")) {
        const resp = await fetch(link);
        const payload = new Uint8Array(await resp.arrayBuffer());
        writeFileSync(join(target, "document.bin"), payload);
        Object.assign(inspect, inspectDocumentPayload(payload));
        inspect.download_headers = Object.fromEntries(resp.headers.entries());
        const extracted = extractPngEntries(payload);
        inspect.png_count = extracted.length;
        for (const entry of extracted) {
            const safe = entry.name.split("/").pop() || "entry.png";
            writeFileSync(join(pngDir, safe), entry.bytes);
        }
        if (inspect.kind === "zip" && extracted.length === 3) {
            inspect.correlation_observed =
                "three PNG members; ZIP namelist order is recorded, not treated as position order";
        } else if (inspect.kind === "png" && extracted.length === 1) {
            inspect.correlation_observed = "single inline PNG for three positions";
        } else {
            inspect.correlation_observed = "no stable position mapping assumed";
        }
    }
    writeFileSync(join(target, "inspect.json"), `${JSON.stringify(inspect, null, 2)}\n`);
    return inspect;
}

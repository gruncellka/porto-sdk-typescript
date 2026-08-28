/** Envelope catalog and matching policy */

import type { EnvelopesLoader, PortoEnvelope } from "../data/entities/envelopes";
import type { PortoProduct } from "../data/entities/products";
import {
    ADVISORY_TOLERANCE_MM,
    type AdvisoryMatch,
    type Match,
    type NoMatch,
    type StrictMatch,
} from "./types";

export interface IFormatCatalog {
    getEnvelope(envelopeId: string): PortoEnvelope | undefined;
    listEnvelopes(): PortoEnvelope[];
    allIds(): Set<string>;
}

export class JsonFormatCatalog implements IFormatCatalog {
    constructor(private readonly loader: EnvelopesLoader) {}

    getEnvelope(envelopeId: string): PortoEnvelope | undefined {
        return this.loader.getEnvelope(envelopeId);
    }

    listEnvelopes(): PortoEnvelope[] {
        return this.loader.listEnvelopes();
    }

    allIds(): Set<string> {
        return this.loader.allIds();
    }
}

export function validateProductEnvelope(product: PortoProduct, envelopeId: string): boolean {
    return (product.envelope_ids ?? []).includes(envelopeId);
}

function normalizeDims(width: number, height: number): [number, number] {
    return [Math.max(width, height), Math.min(width, height)];
}

function chebyshevDistance(a: PortoEnvelope, b: PortoEnvelope): number {
    const [longA, shortA] = normalizeDims(a.width, a.height);
    const [longB, shortB] = normalizeDims(b.width, b.height);
    return Math.max(Math.abs(longA - longB), Math.abs(shortA - shortB));
}

export class EnvelopeMatchService {
    constructor(private readonly catalog: IFormatCatalog) {}

    resolveById(envelopeId: string, product: PortoProduct): Match {
        const envelope = this.catalog.getEnvelope(envelopeId);
        if (!envelope) {
            return { kind: "no_match", reason: "unknown_envelope" } satisfies NoMatch;
        }

        if (validateProductEnvelope(product, envelopeId)) {
            return {
                kind: "strict_match",
                envelopeId: envelopeId,
                advisoryOnly: false,
            } satisfies StrictMatch;
        }

        const allowed = (product.envelope_ids ?? [])
            .map((eid) => this.catalog.getEnvelope(eid))
            .filter((e): e is PortoEnvelope => e !== undefined);

        if (allowed.length === 0) {
            return { kind: "no_match", reason: "not_in_product_list" } satisfies NoMatch;
        }

        const closest = allowed.reduce((best, candidate) =>
            chebyshevDistance(envelope, candidate) < chebyshevDistance(envelope, best)
                ? candidate
                : best,
        );
        const score = chebyshevDistance(envelope, closest);
        const reason = score <= ADVISORY_TOLERANCE_MM ? "dimensions_close" : "regional_format";
        return {
            kind: "advisory_match",
            envelopeId: envelopeId,
            closestAllowedId: closest.id,
            score,
            advisoryOnly: true,
            reason,
            toleranceMm: ADVISORY_TOLERANCE_MM,
        } satisfies AdvisoryMatch;
    }

    resolveByDimensions(widthMm: number, heightMm: number, product: PortoProduct): Match {
        const [longEdge, shortEdge] = normalizeDims(widthMm, heightMm);
        const exact = this.catalog
            .listEnvelopes()
            .filter(
                (e) => normalizeDims(e.width, e.height).join(",") === `${longEdge},${shortEdge}`,
            );
        if (exact.length === 1) {
            return this.resolveById(exact[0].id, product);
        }
        if (exact.length > 1) {
            return { kind: "no_match", reason: "ambiguous_dimensions" } satisfies NoMatch;
        }
        return { kind: "no_match", reason: "unknown_envelope" } satisfies NoMatch;
    }
}

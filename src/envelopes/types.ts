/** Envelope matching types — PUBLIC_API structured Match */

export type AdvisoryReason =
    | "dimensions_close"
    | "regional_format"
    | "unlisted_supply"
    | "ambiguous_dimensions";

export type NoMatchReason =
    | "not_in_product_list"
    | "beyond_tolerance"
    | "unknown_envelope"
    | "ambiguous_dimensions";

export interface EnvelopeSheet {
    sheet: string;
    fold: string;
    description?: string;
}

export interface EnvelopeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface EnvelopeSize {
    width: number;
    height: number;
}

export interface Envelope {
    id: string;
    name: string;
    width: number;
    height: number;
    sheets: EnvelopeSheet[];
}

export interface EnvelopeGeometry {
    id: string;
    name: string;
    width: number;
    height: number;
    sheets: EnvelopeSheet[];
    window?: EnvelopeRect;
    notes?: string;
}

export interface EnvelopeMarkFact {
    type: string;
    size: EnvelopeSize;
    profileId: string;
    clearance?: number;
    placement?: EnvelopeRect;
}

export interface EnvelopeLayout {
    envelopeId: string;
    width: number;
    height: number;
    window?: EnvelopeRect;
    mark?: EnvelopeMarkFact;
}

export interface EnvelopeMark {
    providerId: string;
    profileId: string;
    type: string;
    size: EnvelopeSize;
    productId?: string;
    zoneId?: string;
    clearance?: number;
    placement?: EnvelopeRect;
}

export interface StrictMatch {
    kind: "strict_match";
    envelopeId: string;
    advisoryOnly: false;
}

export interface AdvisoryMatch {
    kind: "advisory_match";
    envelopeId: string;
    closestAllowedId: string;
    score: number;
    advisoryOnly: true;
    reason: AdvisoryReason;
    toleranceMm?: number | null;
}

export interface NoMatch {
    kind: "no_match";
    reason?: NoMatchReason;
}

export type Match = StrictMatch | AdvisoryMatch | NoMatch;

export const ADVISORY_TOLERANCE_MM = 15.0;

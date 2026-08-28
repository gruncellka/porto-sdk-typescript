/** ServiceKind / FeatureKind — projection of porto-data kinds.schema.json. */

import { raiseDataInvalid } from "./errors/domains/data.js";

export const SERVICE_KINDS = [
    "registered",
    "registered_return_receipt",
    "tracking",
    "insurance",
    "return_receipt",
    "thickness",
    "acceptance_proof",
    "delivery_proof",
] as const;

export const FEATURE_KINDS = [
    "tracking",
    "acceptance_proof",
    "recipient_signature",
    "return_receipt",
    "delivery_proof",
    "thickness",
] as const;

export type ServiceKind =
    | "registered"
    | "registered_return_receipt"
    | "tracking"
    | "insurance"
    | "return_receipt"
    | "thickness"
    | "acceptance_proof"
    | "delivery_proof";
export type FeatureKind =
    | "tracking"
    | "acceptance_proof"
    | "recipient_signature"
    | "return_receipt"
    | "delivery_proof"
    | "thickness";

const SERVICE_KIND_SET = new Set<string>(SERVICE_KINDS);
const FEATURE_KIND_SET = new Set<string>(FEATURE_KINDS);

export function parseServiceKind(value: unknown, path?: string): ServiceKind {
    const token = String(value ?? "").trim();
    if (SERVICE_KIND_SET.has(token)) return token as ServiceKind;
    raiseDataInvalid(`Unknown service kind: ${String(value)}`, { path, details: { kind: value } });
}

export function parseFeatureKind(value: unknown, path?: string): FeatureKind {
    const token = String(value ?? "").trim();
    if (FEATURE_KIND_SET.has(token)) return token as FeatureKind;
    raiseDataInvalid(`Unknown feature kind: ${String(value)}`, { path, details: { kind: value } });
}

export function isServiceKind(value: unknown): value is ServiceKind {
    return typeof value === "string" && SERVICE_KIND_SET.has(value);
}

export function isFeatureKind(value: unknown): value is FeatureKind {
    return typeof value === "string" && FEATURE_KIND_SET.has(value);
}

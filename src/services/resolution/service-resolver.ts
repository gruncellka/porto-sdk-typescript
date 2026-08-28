/**
 * Service Resolver - Resolves available services for product and zone.
 *
 * Resolution primitive: product_id + zone_id -> available services.
 * `kind` is cross-provider grouping; `id` is the only identifier.
 */

import type { PortoProduct } from "../../data/entities/products.js";
import type { Service } from "../../data/entities/services.js";
import type { PortoDataLoader } from "../../data/loader.js";
import { PortoError, PortoErrorCode } from "../../errors.js";
import { raiseDataNotFound } from "../../errors/domains/data.js";
import { type ServiceKind, isServiceKind, parseServiceKind } from "../../kinds.js";

const REGISTERED_FEATURE_KINDS = new Set(["recipient_signature", "acceptance_proof"]);

export function resolveServiceToken(loader: PortoDataLoader, token: string): Service[] {
    const wanted = String(token || "").trim();
    if (!wanted) return [];
    const found = loader.getService(wanted);
    return found ? [found] : [];
}

export function productMatchesUnmatchedKind(
    loader: PortoDataLoader,
    product: PortoProduct,
    kind: string,
): boolean {
    const token = kind.trim().toLowerCase();
    if (token === "registered") {
        if (!product.indemnity) return false;
        for (const fid of product.included_features ?? []) {
            const feat = loader.getFeature(String(fid));
            if (feat && REGISTERED_FEATURE_KINDS.has(feat.kind)) return true;
        }
        return false;
    }
    for (const fid of product.included_features ?? []) {
        const feat = loader.getFeature(String(fid));
        if (feat && feat.kind === token) return true;
    }
    return false;
}

export function raiseServiceAmbiguous(kind: ServiceKind, candidates: Service[]): never {
    throw new PortoError(
        `Multiple service options match kind ${kind}`,
        PortoErrorCode.PORTO_SERVICE_AMBIGUOUS,
        400,
        {
            kind,
            candidates: candidates.map((row) => ({
                id: row.id,
                kind: row.kind,
                name: row.name,
                label: row.label,
            })),
        },
        false,
    );
}

export function raiseServiceUnsupported(
    kind: ServiceKind,
    options?: { zoneId?: string | null; productId?: string | null },
): never {
    const details: Record<string, unknown> = { kind };
    if (options?.zoneId) details.zone_id = options.zoneId;
    if (options?.productId) details.product_id = options.productId;
    throw new PortoError(
        `Service kind ${kind} is not supported in this context`,
        PortoErrorCode.PORTO_SERVICE_UNSUPPORTED,
        400,
        details,
        false,
    );
}

export function bindRequestedServices(
    loader: PortoDataLoader,
    options: {
        kinds?: readonly string[] | null;
        serviceIds?: readonly string[] | null;
        zoneId: string;
        productId?: string | null;
    },
): { bound: string[]; selectedKinds: ServiceKind[]; unmatched: ServiceKind[] } {
    const requestedKinds: ServiceKind[] = [];
    const seenKinds = new Set<ServiceKind>();
    for (const raw of options.kinds ?? []) {
        const kind = parseServiceKind(raw);
        if (!seenKinds.has(kind)) {
            seenKinds.add(kind);
            requestedKinds.push(kind);
        }
    }

    const pins: string[] = [];
    const seenPins = new Set<string>();
    for (const raw of options.serviceIds ?? []) {
        const token = String(raw || "").trim();
        if (!token) continue;
        if (isServiceKind(token)) {
            throw new PortoError(
                "service_ids must be catalog service ids, not kinds",
                PortoErrorCode.PORTO_DATA_INVALID,
                400,
                { service_ids: token, kind: token },
                false,
            );
        }
        const row = loader.getService(token);
        if (!row) {
            raiseDataNotFound(`Service not found: ${token}`, { entityId: token });
        }
        if (requestedKinds.length > 0 && !seenKinds.has(row.kind)) {
            throw new PortoError(
                `Service ${token} kind ${row.kind} is not in requested services`,
                PortoErrorCode.PORTO_DATA_INVALID,
                400,
                { service_ids: token, kind: row.kind },
                false,
            );
        }
        if (!seenPins.has(token)) {
            seenPins.add(token);
            pins.push(token);
        }
    }

    if (pins.length > 0 && requestedKinds.length === 0) {
        throw new PortoError(
            "service_ids require matching services kinds",
            PortoErrorCode.PORTO_DATA_INVALID,
            400,
            { service_ids: pins },
            false,
        );
    }

    if (requestedKinds.length === 0) {
        return { bound: [], selectedKinds: [], unmatched: [] };
    }

    let pool = loader.getServicesForZone(options.zoneId);
    if (options.productId) {
        const allowed = new Set(loader.getServicesForProduct(options.productId).map((s) => s.id));
        pool = pool.filter((s) => allowed.has(s.id));
    }

    const bound: string[] = [];
    const unmatched: ServiceKind[] = [];
    for (const kind of requestedKinds) {
        const matches = pool.filter((row) => row.kind === kind);
        const matchIds = new Set(matches.map((row) => row.id));
        const pinsForKind: string[] = [];
        for (const sid of pins) {
            const row = loader.getService(sid);
            if (row && row.kind === kind) pinsForKind.push(sid);
        }
        if (pinsForKind.length > 0) {
            const missing = pinsForKind.find((sid) => !matchIds.has(sid));
            if (missing) {
                raiseDataNotFound(`Service not available for product/zone: ${missing}`, {
                    entityId: missing,
                });
            }
            bound.push(...pinsForKind);
            continue;
        }
        if (matches.length === 1) {
            bound.push(matches[0]!.id);
            continue;
        }
        if (matches.length > 1) {
            raiseServiceAmbiguous(kind, matches);
        }
        unmatched.push(kind);
    }

    return { bound, selectedKinds: requestedKinds, unmatched };
}

export function validateServiceSelection(
    serviceIds: readonly string[] | null | undefined,
    options: ReadonlyArray<{ id: string; combinableWith?: string[] | null }>,
): void {
    /**
     * Catalog-backed gate: selected add-on ids must exist for product×zone and
     * satisfy porto-data `combinable_with` (both sides when declared).
     * Empty selection is valid. Unknown id → PORTO_DATA_NOT_FOUND.
     */
    const unique = [...new Set((serviceIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (unique.length === 0) return;

    const byId = new Map(options.map((row) => [row.id, row]));
    for (const id of unique) {
        if (!byId.has(id)) {
            raiseDataNotFound(`Service not available for product/zone: ${id}`, {
                entityId: id,
            });
        }
    }

    const conflicts: Array<[string, string]> = [];
    for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
            const a = byId.get(unique[i]!)!;
            const b = byId.get(unique[j]!)!;
            const aOk = a.combinableWith == null || a.combinableWith.includes(b.id);
            const bOk = b.combinableWith == null || b.combinableWith.includes(a.id);
            if (!aOk || !bOk) {
                conflicts.push([a.id, b.id]);
            }
        }
    }
    if (conflicts.length > 0) {
        throw new PortoError(
            "Selected services are not combinable",
            PortoErrorCode.PORTO_SERVICES_INCOMPATIBLE,
            422,
            { service_ids: unique, conflicts },
            false,
        );
    }
}

export interface ServiceResolutionResult {
    isValid: boolean;
    data: { services: Service[] };
}

export class ServiceResolver {
    constructor(private readonly loader: PortoDataLoader) {}

    resolve(productId: string, zoneId: string): ServiceResolutionResult {
        const services = this.loader.getServicesForProduct(productId);
        const zoneServices = this.loader.getServicesForZone(zoneId);
        const zoneIds = new Set(zoneServices.map((zs) => zs.id));
        const available = services.filter((s) => zoneIds.has(s.id));
        return { isValid: true, data: { services: available } };
    }
}

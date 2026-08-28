/** Products entity loader */

import { raiseDataInvalid } from "../../errors/domains/data.js";
import {
    type MarkType,
    type TrackingMode,
    parseMarkType,
    parseTrackingMode,
} from "../../execution/index.js";
import { type Requirement, parseRequiresList } from "../../requires.js";
import { BaseEntityLoader, type EntityData } from "./base";

export interface DeliveryEntry {
    zones: string[];
    span: "next" | "within" | "between";
    days_max: number;
    days_min?: number;
    weekdays?: "mon_fri" | "mon_sat";
}

export interface ProductIndemnity {
    tier: string;
    max_amount: number;
}

export interface PortoProduct {
    id: string;
    name: string;
    envelope_ids: string[];
    zones: string[];
    weight_tier?: string;
    effective_from: string | null;
    effective_to: string | null;
    provider_mappings?: Record<string, Record<string, unknown>>;
    mark_type?: MarkType;
    tracking?: TrackingMode;
    /** Optional English catalog label (porto-data ≥0.7.0). */
    label?: string;
    delivery: DeliveryEntry[];
    included_features: string[];
    indemnity?: ProductIndemnity;
    requires: Requirement[];
}

function parseSpan(raw: unknown): DeliveryEntry["span"] {
    const token = String(raw ?? "").trim();
    if (token === "next" || token === "within" || token === "between") return token;
    raiseDataInvalid(`Unknown delivery span: ${String(raw)}`, { details: { span: raw } });
}

function parseWeekdays(raw: unknown): DeliveryEntry["weekdays"] | undefined {
    if (raw == null || raw === "") return undefined;
    const token = String(raw).trim();
    if (token === "mon_fri" || token === "mon_sat") return token;
    raiseDataInvalid(`Unknown delivery weekdays: ${String(raw)}`, { details: { weekdays: raw } });
}

function parseDelivery(raw: unknown): DeliveryEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
            zones: [...((row.zones as string[]) ?? [])],
            span: parseSpan(row.span),
            days_max: Number(row.days_max),
            days_min: row.days_min != null ? Number(row.days_min) : undefined,
            weekdays: parseWeekdays(row.weekdays),
        }));
}

function parseIndemnity(raw: unknown): ProductIndemnity | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const row = raw as Record<string, unknown>;
    const tier = row.tier;
    const maxRow = row.max as Record<string, unknown> | undefined;
    const amount = maxRow?.amount;
    if (!tier || amount == null) return undefined;
    return { tier: String(tier), max_amount: Number(amount) };
}

export class ProductsLoader extends BaseEntityLoader {
    private products: PortoProduct[] = [];

    load(data: EntityData): void {
        this.products = [];
        for (const p of data.products ?? []) {
            const envelopeIds = [...(p.envelope_ids ?? [])];
            const zones = [...(p.zones ?? [])];
            this.products.push({
                id: p.id,
                name: p.name,
                envelope_ids: envelopeIds,
                zones,
                weight_tier: p.weight_tier,
                effective_from: p.effective_from ?? null,
                effective_to: p.effective_to ?? null,
                provider_mappings: p.provider_mappings,
                mark_type: parseMarkType(p.mark_type, true),
                tracking: parseTrackingMode(p.tracking, true),
                label: typeof p.label === "string" ? p.label : undefined,
                delivery: parseDelivery(p.delivery),
                included_features: [...(p.included_features ?? [])],
                indemnity: parseIndemnity(p.indemnity),
                requires: parseRequiresList(p.requires, "products.requires"),
            });
        }
    }

    getData(): PortoProduct[] {
        return this.products;
    }

    getProduct(productId: string): PortoProduct | undefined {
        return this.products.find((p) => p.id === productId);
    }

    getAllProducts(): PortoProduct[] {
        return this.products;
    }
}

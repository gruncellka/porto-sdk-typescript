/**
 * CLI output formatting. Single responsibility: format and print output.
 * Styled layout with gruncellka branding when not --json.
 */

import { BRANDING } from "./constants.js";

export function restrictionsSummary(restrictions: Record<string, unknown>): string | null {
    const impact = restrictions.impact;
    const legal = restrictions.legal;
    const routing = restrictions.routing;
    const legalCount = Array.isArray(legal) ? legal.length : 0;
    const routingCount = Array.isArray(routing) ? routing.length : 0;
    if (impact == null && legalCount === 0 && routingCount === 0) {
        return null;
    }
    const parts: string[] = [];
    if (impact != null) parts.push(`impact=${String(impact)}`);
    if (legalCount > 0) parts.push(`${legalCount} legal`);
    if (routingCount > 0) parts.push(`${routingCount} routing`);
    let summary = parts.join(", ");
    if (legalCount > 0 || routingCount > 0) {
        summary += " (use restrictions.check for region detail)";
    }
    return summary;
}

function formatValue(v: unknown, indent: string): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map((x) => formatValue(x, indent)).join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

function normalizeSummaryPayload(obj: Record<string, unknown>): Record<string, unknown> {
    if ("price" in obj && obj.price != null) return obj;
    if (obj.amount == null) return obj;
    const normalized: Record<string, unknown> = { ...obj };
    const productId = normalized.product_id ?? normalized.productId;
    if (productId != null && normalized.product == null) {
        normalized.product = { id: productId };
    }
    const zone = normalized.zone;
    const zoneId = normalized.zone_id ?? normalized.zoneId;
    if (zoneId != null && (typeof zone !== "object" || zone == null)) {
        normalized.zone = { id: zoneId };
    } else if (typeof zone === "string") {
        normalized.zone = { id: zone };
    }
    normalized.price = {
        amount: normalized.amount,
        currency: normalized.currency ?? "EUR",
    };
    return normalized;
}

/** Format resolve/price-style result for styled display */
function formatSummaryLines(obj: Record<string, unknown>): string[] {
    const payload = normalizeSummaryPayload(obj);
    const product = payload.product as Record<string, unknown> | undefined;
    const zone = payload.zone as Record<string, unknown> | undefined;
    const price = payload.price as Record<string, unknown> | undefined;
    const hasCalcStyle = product != null || zone != null || price != null;

    const lines: Array<[string, string]> = [];
    if (hasCalcStyle) {
        if (payload.provider != null) lines.push(["provider", String(payload.provider)]);
        if (product?.name != null) lines.push(["product", String(product.name)]);
        else if (product != null)
            lines.push(["product", String(product.id ?? JSON.stringify(product))]);
        if (zone?.name != null) lines.push(["zone", String(zone.name)]);
        else if (zone != null) lines.push(["zone", String(zone.id ?? JSON.stringify(zone))]);
        if (price?.amount != null) {
            const amount = Number(price.amount);
            const curr = (price.currency as string) ?? "EUR";
            const formatted = `${(amount / 100).toFixed(2).replace(".", ",")} ${curr}`;
            lines.push(["price", formatted]);
        } else if (price != null) lines.push(["price", JSON.stringify(price)]);
        const tracking = payload.tracking;
        if (tracking != null) lines.push(["tracking", String(tracking)]);
        const restrictions = payload.restrictions;
        if (
            restrictions != null &&
            typeof restrictions === "object" &&
            !Array.isArray(restrictions)
        ) {
            const restrictionSummary = restrictionsSummary(restrictions as Record<string, unknown>);
            if (restrictionSummary) lines.push(["restrictions", restrictionSummary]);
        }
        const warnings = payload.warnings;
        if (Array.isArray(warnings) && warnings.length > 0) {
            lines.push(["warnings", warnings.map(String).join("; ")]);
        }
    } else {
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            if (v === null) lines.push([k, "-"]);
            else if (Array.isArray(v)) lines.push([k, v.length > 0 ? v.join(", ") : "(none)"]);
            else if (typeof v === "object") continue;
            else lines.push([k, String(v)]);
        }
    }

    if (lines.length > 0) {
        const maxKey = Math.max(...lines.map(([k]) => k.length), 8);
        return lines.map(([k, v]) => `  ${k.padEnd(maxKey)}  ${v}`);
    }

    return [];
}

function printPretty(obj: Record<string, unknown>, indent = ""): string[] {
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            const sub = v as Record<string, unknown>;
            if (
                Object.keys(sub).length <= 2 &&
                !Object.values(sub).some((x) => typeof x === "object" && x !== null)
            ) {
                out.push(
                    `${indent}${k}: ${Object.entries(sub)
                        .map(([a, b]) => `${a}=${formatValue(b, indent)}`)
                        .join(", ")}`,
                );
            } else {
                out.push(`${indent}${k}:`);
                out.push(...printPretty(sub, `${indent}  `));
            }
        } else {
            out.push(`${indent}${k}: ${formatValue(v, indent)}`);
        }
    }
    return out;
}

export function output(
    value: unknown,
    opts: { json?: boolean; pretty?: boolean; _command?: string },
): void {
    const useJson = opts.json === true;
    if (useJson) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }

    const cmd = opts._command ?? "porto";
    const header = `Porto SDK ${cmd} ${BRANDING}`;

    let bodyLines: string[];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const summary = formatSummaryLines(obj);
        bodyLines = summary.length > 0 ? summary : printPretty(obj).map((s) => `  ${s}`);
    } else {
        bodyLines = [`  ${String(value)}`];
    }

    console.log(header);
    console.log("");
    for (const line of bodyLines) console.log(line);
}

export function maskSecret(value?: string): string {
    if (!value) return "";
    if (value.length <= 4) return "***";
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

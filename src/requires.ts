/** Canonical Porto.requires tokens and set union. */

import { raiseDataInvalid } from "./errors/domains/data.js";

export const SENDER = "ADDRESS_SENDER";
export const RECIPIENT = "ADDRESS_RECIPIENT";
export const ADDRESS = new Set([SENDER, RECIPIENT]);

export type Requirement = "ADDRESS_SENDER" | "ADDRESS_RECIPIENT";

const REQUIREMENTS = new Set<string>([SENDER, RECIPIENT]);

export function parseRequirement(value: unknown, path?: string): Requirement {
    const token = String(value ?? "").trim();
    if (REQUIREMENTS.has(token)) return token as Requirement;
    raiseDataInvalid(`Unknown requirement token: ${String(value)}`, {
        path,
        details: { requires: value },
    });
}

export function parseRequiresList(raw: unknown, path?: string): Requirement[] {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
        raiseDataInvalid(`requires must be an array, got ${typeof raw}`, { path });
    }
    const out: Requirement[] = [];
    const seen = new Set<Requirement>();
    for (const item of raw) {
        const token = parseRequirement(item, path);
        if (!seen.has(token)) {
            seen.add(token);
            out.push(token);
        }
    }
    return out;
}

export function tokens(node: { requires?: unknown } | null | undefined): Set<Requirement> {
    return new Set(parseRequiresList(node?.requires));
}

export function merge(...groups: Iterable<string>[]): Set<Requirement> {
    const out = new Set<Requirement>();
    for (const group of groups) {
        for (const item of group) out.add(parseRequirement(item));
    }
    return out;
}

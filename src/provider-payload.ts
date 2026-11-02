/**
 * Sanitize provider payloads before they land on public models.
 *
 * providerRaw is opaque. Its shape is not part of Porto compatibility guarantees.
 * Secrets are dropped (not masked) before stash.
 */

const SECRET_PARTS = [
    "password",
    "token",
    "secret",
    "authorization",
    "api_key",
    "apikey",
    "credential",
    "cookie",
    "bearer",
];

function secretKey(key: string): boolean {
    const lowered = key.toLowerCase().replaceAll("-", "_");
    return SECRET_PARTS.some((part) => lowered.includes(part));
}

export function sanitizeProviderPayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeProviderPayload(item));
    }
    if (value !== null && typeof value === "object") {
        const cleaned: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (secretKey(key)) continue;
            cleaned[key] = sanitizeProviderPayload(item);
        }
        return cleaned;
    }
    return value;
}

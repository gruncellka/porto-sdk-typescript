/**
 * Porto SDK exception types and mapping helpers.
 */

import { type ProviderId, type WireId, providerId, wireId } from "../ids.js";
import { PortoErrorCode } from "./codes.js";
import { raiseWalletInsufficient } from "./domains/execution.js";
import { mapTransportError } from "./domains/network.js";

export class PortoError extends Error {
    constructor(
        message: string,
        public code: PortoErrorCode,
        public statusCode?: number,
        public details?: Record<string, unknown>,
        public retryable = false,
        provider?: string,
        wire?: string,
        public upstreamCode?: string,
        public providerError?: unknown,
    ) {
        super(message);
        this.name = "PortoError";
        this.provider = provider ? providerId(provider) : undefined;
        this.wire = wire ? wireId(wire) : undefined;
        Error.captureStackTrace?.(this, PortoError);
    }

    public provider?: ProviderId;
    public wire?: WireId;
}

export class ValidationError extends PortoError {}
export class AuthenticationError extends PortoError {}
export class TransportError extends PortoError {}
export class ProviderError extends PortoError {}
export class ConfigurationError extends PortoError {}
export class DataError extends PortoError {}

export function mapProviderError(
    provider: ProviderId,
    wire: WireId,
    rawError: unknown,
    statusCode?: number,
): PortoError {
    if (rawError instanceof PortoError) {
        return rawError;
    }
    const msg = rawError instanceof Error ? rawError.message : String(rawError);
    const upper = msg.toUpperCase();

    if (statusCode === 401 || upper.includes("UNAUTHORIZED")) {
        const upstreamCode =
            typeof (rawError as { code?: string })?.code === "string"
                ? (rawError as { code: string }).code
                : undefined;
        return new AuthenticationError(
            msg || "Authentication failed",
            PortoErrorCode.PORTO_AUTH_FAILED,
            statusCode,
            rawError instanceof Error ? { name: rawError.name } : undefined,
            false,
            provider,
            wire,
            upstreamCode,
        );
    }
    if (statusCode === 403) {
        return new AuthenticationError(
            msg || "Authentication denied",
            PortoErrorCode.PORTO_AUTH_DENIED,
            statusCode,
            undefined,
            false,
            provider,
            wire,
        );
    }
    if (upper.includes("INSUFFICIENT") || upper.includes("FUNDS")) {
        raiseWalletInsufficient(msg || "Insufficient wallet balance", {
            requiredCents: 0,
            provider,
            wire,
            upstreamCode:
                typeof (rawError as { code?: string })?.code === "string"
                    ? (rawError as { code: string }).code
                    : undefined,
            statusCode,
        });
    }
    if (statusCode === 501) {
        return new ProviderError(
            msg || "Capability not supported",
            PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
            statusCode,
            { capability: "unknown", provider_id: provider, wire },
            false,
            provider,
            wire,
        );
    }
    if (
        statusCode === 408 ||
        statusCode === 429 ||
        (statusCode !== undefined && statusCode >= 500) ||
        ["TIMEOUT", "NETWORK", "ECONNREFUSED", "DNS"].some((token) => upper.includes(token))
    ) {
        return mapTransportError(provider, wire, rawError, statusCode);
    }

    return new ProviderError(
        msg || "Provider request failed",
        PortoErrorCode.PORTO_MARK_FAILED,
        statusCode,
        rawError instanceof Error ? { name: rawError.name } : undefined,
        false,
        provider,
        wire,
        undefined,
        rawError,
    );
}

export function redactSensitiveFields(
    payload?: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (!payload) return payload;
    const sensitive = new Set([
        "password",
        "token",
        "authorization",
        "api_key",
        "api_secret",
        "client_secret",
    ]);
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        redacted[key] = sensitive.has(key.toLowerCase()) ? "***REDACTED***" : value;
    }
    return redacted;
}

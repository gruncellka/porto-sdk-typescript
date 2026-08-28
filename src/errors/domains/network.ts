import { PortoErrorCode } from "../codes.js";
import { type PortoError, TransportError } from "../exceptions.js";
import type { ProviderId, WireId } from "../models.js";

export function mapHttpStatusToNetworkCode(statusCode?: number): PortoErrorCode {
    if (statusCode === 429) return PortoErrorCode.PORTO_NETWORK_RATE_LIMITED;
    if (statusCode === 408) return PortoErrorCode.PORTO_NETWORK_TIMEOUT;
    if (statusCode && statusCode >= 500) return PortoErrorCode.PORTO_NETWORK_UNAVAILABLE;
    return PortoErrorCode.PORTO_NETWORK_UNAVAILABLE;
}

export function mapTransportError(
    provider: ProviderId,
    wire: WireId,
    rawError: unknown,
    statusCode?: number,
): PortoError {
    const msg = rawError instanceof Error ? rawError.message : String(rawError);
    const upper = msg.toUpperCase();
    let code: PortoErrorCode;
    if (statusCode === 429 || upper.includes("RATE")) {
        code = PortoErrorCode.PORTO_NETWORK_RATE_LIMITED;
    } else if (statusCode === 408 || upper.includes("TIMEOUT") || upper.includes("ETIMEDOUT")) {
        code = PortoErrorCode.PORTO_NETWORK_TIMEOUT;
    } else if (statusCode && statusCode >= 500) {
        code = PortoErrorCode.PORTO_NETWORK_UNAVAILABLE;
    } else if (
        upper.includes("ECONNREFUSED") ||
        upper.includes("DNS") ||
        upper.includes("NETWORK")
    ) {
        code = PortoErrorCode.PORTO_NETWORK_UNAVAILABLE;
    } else {
        code = mapHttpStatusToNetworkCode(statusCode);
    }
    let retryable = false;
    if (code === PortoErrorCode.PORTO_NETWORK_RATE_LIMITED) {
        retryable = true;
    } else if (code === PortoErrorCode.PORTO_NETWORK_TIMEOUT) {
        retryable =
            statusCode === 408 ||
            statusCode === 429 ||
            (statusCode !== undefined && statusCode >= 500);
    } else if (code === PortoErrorCode.PORTO_NETWORK_UNAVAILABLE) {
        retryable = statusCode !== undefined && statusCode >= 500;
    }
    const upstreamCode =
        typeof (rawError as { code?: string })?.code === "string"
            ? (rawError as { code: string }).code
            : undefined;
    return new TransportError(
        msg || "Provider request failed",
        code,
        statusCode,
        rawError instanceof Error ? { name: rawError.name } : undefined,
        retryable,
        provider,
        wire,
        upstreamCode,
    );
}

/**
 * Deutsche Post Internetmarke adapter utilities
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import type { Address } from "../../../types/index.js";
import { InternetmarkeRetryableErrorCode, InternetmarkeVendorErrorPattern } from "./enums.js";
import { InternetmarkeAddressSchema } from "./schemas.js";

export interface DHLAddress {
    name: string;
    addressLine1: string;
    postalCode: string;
    city: string;
    country: string;
    additionalName?: string;
    addressLine2?: string;
}

export function normalizeAddress(
    address: Address,
    resolveCountryCode3: (alpha2: string) => string,
): DHLAddress {
    try {
        const validated = InternetmarkeAddressSchema.parse({
            name: address.name,
            street: address.street,
            houseNumber: address.houseNumber,
            postalCode: address.postalCode,
            city: address.locality,
            countryCode: address.countryCode,
            regionCode: address.regionCode,
        });
        const addressLine1 = `${validated.street} ${validated.houseNumber}`.trim();
        const alpha2 = String(validated.countryCode || "")
            .trim()
            .toUpperCase();
        return {
            name: validated.name,
            addressLine1,
            postalCode: validated.postalCode,
            city: validated.city,
            country: resolveCountryCode3(alpha2),
            ...(validated.regionCode && { additionalName: validated.regionCode }),
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new PortoError(
            `Invalid address format: ${msg}`,
            PortoErrorCode.PORTO_MARK_INVALID,
            400,
            { address },
            false,
            "deutschepost",
            "internetmarke",
        );
    }
}

export function requireInternetmarkeProductCode(
    wireCode: number | string | null | undefined,
): number {
    if (typeof wireCode === "number" && wireCode > 0) return wireCode;
    if (typeof wireCode === "string" && /^\d+$/.test(wireCode)) return Number(wireCode);
    throw new PortoError(
        "Internetmarke wire_code missing or invalid. " +
            "Ensure graph.edges.wire.internetmarke defines the product/zone/service combination.",
        PortoErrorCode.PORTO_MARK_FAILED,
        400,
        { wireCode },
        false,
        "deutschepost",
        "internetmarke",
    );
}

export function extractInternetmarkeVendorErrorCode(
    errData: Record<string, unknown> | null | undefined,
): string | undefined {
    if (!errData) return undefined;
    for (const key of ["title", "code", "errorCode", "message"] as const) {
        const value = errData[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    const nested = errData.error;
    if (nested && typeof nested === "object") {
        return extractInternetmarkeVendorErrorCode(nested as Record<string, unknown>);
    }
    if (typeof nested === "string" && nested.trim()) {
        return nested.trim();
    }
    return undefined;
}

function normalizedVendorToken(vendorCode: string): string {
    return vendorCode.toUpperCase().replace(/[_-]/g, "");
}

export function mapInternetmarkeErrorCode(
    vendorCode: string | undefined,
    httpStatus: number,
): PortoErrorCode {
    if (!vendorCode) {
        if (httpStatus === 401) {
            return PortoErrorCode.PORTO_AUTH_FAILED;
        }
        if (httpStatus === 403) {
            return PortoErrorCode.PORTO_AUTH_DENIED;
        }
        if (httpStatus === 429) {
            return PortoErrorCode.PORTO_NETWORK_RATE_LIMITED;
        }
        if (httpStatus >= 500) {
            return PortoErrorCode.PORTO_NETWORK_UNAVAILABLE;
        }
        return PortoErrorCode.PORTO_MARK_FAILED;
    }

    const vendorCodeUpper = vendorCode.toUpperCase();

    if (
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.AUTH) ||
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.LOGIN)
    ) {
        return PortoErrorCode.PORTO_AUTH_FAILED;
    }

    if (
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.INSUFFICIENT) ||
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.FUNDS) ||
        (vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.WALLET) &&
            vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.BALANCE)) ||
        normalizedVendorToken(vendorCode).includes("WALLETBALANCE") ||
        normalizedVendorToken(vendorCode).includes("NOTENOUGH")
    ) {
        return PortoErrorCode.PORTO_WALLET_INSUFFICIENT;
    }

    if (
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.PRODUCT) ||
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.INVALID_PRODUCT)
    ) {
        return PortoErrorCode.PORTO_MARK_FAILED;
    }

    if (
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.RATE_LIMIT) ||
        vendorCodeUpper.includes(InternetmarkeVendorErrorPattern.TOO_MANY)
    ) {
        return PortoErrorCode.PORTO_NETWORK_RATE_LIMITED;
    }

    return PortoErrorCode.PORTO_MARK_FAILED;
}

const NEVER_RETRYABLE_CODES = new Set<PortoErrorCode>([
    PortoErrorCode.PORTO_WALLET_INSUFFICIENT,
    PortoErrorCode.PORTO_AUTH_FAILED,
    PortoErrorCode.PORTO_AUTH_DENIED,
    PortoErrorCode.PORTO_LINKAGE_PENDING,
]);

export function isRetryableError(httpStatus: number, vendorCode?: string): boolean {
    const mapped = mapInternetmarkeErrorCode(vendorCode, httpStatus);
    if (NEVER_RETRYABLE_CODES.has(mapped)) return false;
    if (httpStatus >= 500 || httpStatus === 429) return true;
    if (vendorCode) {
        const vendorCodeUpper = vendorCode.toUpperCase();
        const retryableCodes = [
            InternetmarkeRetryableErrorCode.TIMEOUT,
            InternetmarkeRetryableErrorCode.SERVICE_UNAVAILABLE,
            InternetmarkeRetryableErrorCode.RATE_LIMIT,
        ];
        if (retryableCodes.some((code) => vendorCodeUpper.includes(code))) {
            return true;
        }
    }
    return false;
}

export function parseWalletBalanceCents(
    payload: Record<string, unknown> | null | undefined,
): number | null {
    if (!payload) return null;
    for (const key of ["walletBallance", "walletBalance"] as const) {
        const raw = payload[key];
        if (typeof raw === "number") return raw;
        if (typeof raw === "string" && raw.trim() && /^\d+$/.test(raw.trim())) {
            return Number(raw.trim());
        }
    }
    return null;
}

export async function parseErrorResponse(response: Response): Promise<any> {
    try {
        const contentType = response.headers.get("content-type")?.toLowerCase() || "";
        if (contentType.includes("application/json") || contentType.includes("text/json")) {
            return await response.json();
        }
        if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
            const text = await response.text();
            return { message: text, code: null };
        }
        try {
            return await response.json();
        } catch {
            const text = await response.text();
            return { message: text, code: null };
        }
    } catch (error) {
        const text = await response.text().catch(() => "Failed to read response");
        return {
            message: `Failed to parse error response: ${text.substring(0, 200)}`,
            code: null,
            rawResponse: text.substring(0, 500),
        };
    }
}

export async function parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.includes("application/json") || contentType.includes("text/json")) {
        return await response.json();
    }
    if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
        const text = await response.text();
        return { rawXml: text };
    }
    return await response.json();
}

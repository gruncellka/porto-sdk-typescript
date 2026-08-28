/**
 * Map Internetmarke HTTP failures to PortoError.
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import type { HttpJsonResult } from "./client.js";
import {
    extractInternetmarkeVendorErrorCode,
    isRetryableError,
    mapInternetmarkeErrorCode,
} from "./utils.js";

const PROVIDER = "deutschepost";
const WIRE = "internetmarke";

export class InternetmarkeErrorMapper {
    network(error: unknown, requestId: string): PortoError {
        const msg = error instanceof Error ? error.message : String(error);
        return new PortoError(
            `INTERNETMARKE network error: ${msg}`,
            PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
            503,
            { requestId, error: msg },
            true,
            PROVIDER,
            WIRE,
        );
    }

    raiseIfInitFailed(result: HttpJsonResult, requestId: string): void {
        if (result.ok) return;
        const errData = this.payload(result);
        const vendorCode = extractInternetmarkeVendorErrorCode(errData);
        throw new PortoError(
            typeof errData.message === "string" ? errData.message : "Init shopping cart failed",
            mapInternetmarkeErrorCode(vendorCode, result.status),
            result.status,
            { ...errData, requestId, upstream_title: vendorCode },
            isRetryableError(result.status, vendorCode),
            PROVIDER,
            WIRE,
            vendorCode,
        );
    }

    raiseIfCheckoutFailed(
        result: HttpJsonResult,
        requestId: string,
        productCode: number | undefined,
        body: Record<string, unknown>,
    ): void {
        if (result.ok) return;
        const errData = this.payload(result);
        const vendorCode = extractInternetmarkeVendorErrorCode(errData);
        const sdkCode = mapInternetmarkeErrorCode(vendorCode, result.status);
        const requiredCents = body.total;
        const walletAccountId =
            typeof errData.description === "string" ? errData.description : undefined;
        const message =
            sdkCode === PortoErrorCode.PORTO_WALLET_INSUFFICIENT
                ? `Wallet balance too low${
                      typeof requiredCents === "number" ? ` (need ${requiredCents} ct)` : ""
                  }${walletAccountId ? ` for ${walletAccountId}` : ""}`
                : typeof errData.message === "string"
                  ? errData.message
                  : "Mark execution failed";
        throw new PortoError(
            message,
            sdkCode,
            result.status,
            {
                error: errData,
                requestId,
                productCode,
                requestBody: body,
                required_cents: requiredCents,
                wallet_account_id: walletAccountId,
                upstream_title: vendorCode,
            },
            isRetryableError(result.status, vendorCode),
            PROVIDER,
            WIRE,
            vendorCode,
        );
    }

    private payload(result: HttpJsonResult): Record<string, unknown> {
        return result.json && typeof result.json === "object" && !Array.isArray(result.json)
            ? (result.json as Record<string, unknown>)
            : { message: result.text };
    }
}

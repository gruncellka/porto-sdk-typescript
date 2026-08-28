import { describe, expect, it } from "vitest";
import {
    extractInternetmarkeVendorErrorCode,
    isRetryableError,
    mapInternetmarkeErrorCode,
    requireInternetmarkeProductCode,
} from "../../src/adapters/deutschepost/internetmarke/utils.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";

describe("Internetmarke mark-execution error mapper", () => {
    it("extracts walletBalanceNotEnough from RFC7807 title", () => {
        const err = {
            statusCode: "400",
            title: "walletBalanceNotEnough",
            description: "A00627DFEF",
            instance: "PCF-A1032",
        };
        expect(extractInternetmarkeVendorErrorCode(err)).toBe("walletBalanceNotEnough");
    });

    it("maps walletBalanceNotEnough to PORTO_WALLET_INSUFFICIENT", () => {
        const code = mapInternetmarkeErrorCode("walletBalanceNotEnough", 400);
        expect(code).toBe(PortoErrorCode.PORTO_WALLET_INSUFFICIENT);
        expect(isRetryableError(400, "walletBalanceNotEnough")).toBe(false);
    });

    it("maps INSUFFICIENT_FUNDS vendor token to wallet insufficient", () => {
        expect(mapInternetmarkeErrorCode("INSUFFICIENT_FUNDS", 400)).toBe(
            PortoErrorCode.PORTO_WALLET_INSUFFICIENT,
        );
    });

    it("maps 5xx and 429 as retryable, wallet/auth never", () => {
        expect(isRetryableError(503)).toBe(true);
        expect(isRetryableError(429)).toBe(true);
        expect(isRetryableError(400, "walletBalanceNotEnough")).toBe(false);
        expect(isRetryableError(401, "AUTH_FAILED")).toBe(false);
        expect(isRetryableError(503, "walletBalanceNotEnough")).toBe(false);
    });

    it("rejects missing or invalid internal product codes", () => {
        expect(() => requireInternetmarkeProductCode(undefined)).toThrow(PortoError);
        expect(() => requireInternetmarkeProductCode(0)).toThrow(PortoError);
        expect(() => requireInternetmarkeProductCode("not-a-code")).toThrow(PortoError);
        try {
            requireInternetmarkeProductCode(undefined);
        } catch (error) {
            expect((error as PortoError).code).toBe(PortoErrorCode.PORTO_MARK_FAILED);
        }
    });
});

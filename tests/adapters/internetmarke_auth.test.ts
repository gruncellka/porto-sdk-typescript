import { describe, expect, it } from "vitest";
import {
    DIAG_INVALID_PORTOKASSE_CREDENTIALS,
    DIAG_PENDING_PORTOKASSE_APPROVAL,
    DIAG_UNKNOWN_CHANNEL,
    InternetmarkeAuthEndpoint,
    internetmarkeAuthErrorDetails,
    mapInternetmarkeAuthHttpError,
} from "../../src/adapters/deutschepost/internetmarke/auth-errors.js";
import { PortoErrorCode } from "../../src/errors.js";

function reason(info: ReturnType<typeof mapInternetmarkeAuthHttpError>): string {
    return (internetmarkeAuthErrorDetails(info).provider_error as { reason: string }).reason;
}

describe("mapInternetmarkeAuthHttpError", () => {
    it("maps DHL app unauthorized resource to PORTO_AUTH_DENIED", () => {
        const info = mapInternetmarkeAuthHttpError(
            401,
            '{"detail":"Unauthorized for given resource."}',
            { endpoint: InternetmarkeAuthEndpoint.DHL_APP_TOKEN },
        );
        expect(info.code).toBe(PortoErrorCode.PORTO_AUTH_DENIED);
        expect(reason(info)).not.toBe(DIAG_UNKNOWN_CHANNEL);
        expect(Object.keys(internetmarkeAuthErrorDetails(info))).toEqual(["provider_error"]);
    });

    it("maps unknown channel to PORTO_AUTH_DENIED with provider_error", () => {
        const body =
            '{"status":400,"title":"ERR_1000","detail":"Invalid request. Unknown channel: nzlnllk-0001 !"}';
        const info = mapInternetmarkeAuthHttpError(400, body, {
            endpoint: InternetmarkeAuthEndpoint.COMBINED_USER,
        });
        expect(info.code).toBe(PortoErrorCode.PORTO_AUTH_DENIED);
        const details = internetmarkeAuthErrorDetails(info);
        expect(Object.keys(details)).toEqual(["provider_error"]);
        expect((details.provider_error as { reason: string }).reason).toBe(DIAG_UNKNOWN_CHANNEL);
        expect((details.provider_error as { provider_code: string }).provider_code).toBe(
            "ERR_1000",
        );
    });

    it("maps Portokasse user 401 after app token to PORTO_LINKAGE_PENDING", () => {
        const info = mapInternetmarkeAuthHttpError(401, '{"status":401}', {
            endpoint: InternetmarkeAuthEndpoint.PORTOKASSE_USER,
            appTokenObtained: true,
        });
        expect(info.code).toBe(PortoErrorCode.PORTO_LINKAGE_PENDING);
        expect(reason(info)).toBe(DIAG_PENDING_PORTOKASSE_APPROVAL);
    });

    it("maps Portokasse 403 with Geschäftsanwendungen hint", () => {
        const info = mapInternetmarkeAuthHttpError(403, "Geschäftsanwendungen", {
            endpoint: InternetmarkeAuthEndpoint.PORTOKASSE_USER,
            appTokenObtained: true,
        });
        expect(info.code).toBe(PortoErrorCode.PORTO_LINKAGE_PENDING);
    });

    it("maps invalid Portokasse password to PORTO_AUTH_FAILED", () => {
        const info = mapInternetmarkeAuthHttpError(401, "Invalid password for Portokasse user", {
            endpoint: InternetmarkeAuthEndpoint.COMBINED_USER,
        });
        expect(info.code).toBe(PortoErrorCode.PORTO_AUTH_FAILED);
        expect(reason(info)).toBe(DIAG_INVALID_PORTOKASSE_CREDENTIALS);
    });
});

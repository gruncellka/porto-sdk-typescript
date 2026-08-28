/**
 * Internetmarke authentication error classification.
 *
 * Provider-specific DHL/Portokasse response semantics are interpreted here only.
 * Emits stable PORTO_* codes plus adapter diagnostics and nested provider_error.
 * Generic SDK core must not re-parse provider body text.
 *
 * DHL documents HTTP 401 on token retrieval until Portokasse Freigabe
 * (Geschäftsanwendungen) is granted.
 */

import { PortoErrorCode } from "../../../errors.js";

export enum InternetmarkeAuthEndpoint {
    DHL_APP_TOKEN = "dhl_app_token",
    PORTOKASSE_USER = "portokasse_user",
    COMBINED_USER = "combined_user",
}

/** Adapter diagnostics (not public PORTO_* codes). */
export const DIAG_UNKNOWN_CHANNEL = "unknown_channel";
export const DIAG_INVALID_APP_CREDENTIALS = "invalid_app_credentials";
export const DIAG_INVALID_PORTOKASSE_CREDENTIALS = "invalid_portokasse_credentials";
export const DIAG_PENDING_PORTOKASSE_APPROVAL = "pending_portokasse_approval";
export const DIAG_UNKNOWN = "unknown";

const BODY_PREVIEW_LIMIT = 2000;
const ERR_CODE_RE = /\bERR_\d+\b/i;

export type ProviderErrorPayload = {
    http_status: number;
    provider_code: string | null;
    provider_title: string | null;
    provider_detail: string | null;
    body_preview: string;
    endpoint: string;
};

export type InternetmarkeAuthErrorInfo = {
    code: PortoErrorCode;
    message: string;
    authStage: string;
    hint: string;
    retryable: boolean;
    diagnosticReason: string;
    providerError: ProviderErrorPayload;
    userAction?: string;
    triggersPortokasseFreigabeEmail?: boolean;
};

function bodyLower(responseBody: string): string {
    return (responseBody || "").toLowerCase();
}

function looksLikeUnknownChannel(lower: string): boolean {
    return lower.includes("unknown channel");
}

function looksLikeDhlAppDenied(lower: string): boolean {
    return (
        lower.includes("unauthorized for given resource") ||
        lower.includes("invalid client identifier") ||
        looksLikeUnknownChannel(lower)
    );
}

function looksLikePortokasseAppNotApproved(lower: string): boolean {
    const markers = [
        "geschäftsanwendungen",
        "geschaeftsanwendungen",
        "business application",
        "freigabe",
        "nicht freigegeben",
        "anwendung nicht",
        "applikations-freigabe",
        "not authorized by user",
        "application is not authorized",
        "genericuserauthenticationerror",
    ];
    return markers.some((marker) => lower.includes(marker));
}

function looksLikeInvalidPortokasseCredentials(lower: string): boolean {
    const markers = [
        "invalid password",
        "wrong password",
        "falsches passwort",
        "ungültig",
        "ungueltig",
        "login failed",
        "anmeldung fehlgeschlagen",
    ];
    return markers.some((marker) => lower.includes(marker));
}

export function buildProviderError(
    httpStatus: number,
    responseBody: string,
    endpoint: InternetmarkeAuthEndpoint,
): ProviderErrorPayload {
    const raw = responseBody || "";
    const preview = raw.slice(0, BODY_PREVIEW_LIMIT);
    let providerCode: string | null = null;
    let providerTitle: string | null = null;
    let providerDetail: string | null = null;

    try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (data && typeof data === "object") {
            const title = data.title;
            const detail = data.detail;
            const code = data.code;
            const message = data.message ?? data.description;
            if (typeof title === "string" && title.trim()) {
                providerTitle = title.trim();
            }
            if (typeof detail === "string" && detail.trim()) {
                providerDetail = detail.trim();
            } else if (typeof message === "string" && message.trim()) {
                providerDetail = message.trim();
            }
            if (typeof code === "string" && code.trim()) {
                providerCode = code.trim();
            } else if (providerTitle?.toUpperCase().startsWith("ERR_")) {
                providerCode = providerTitle;
            }
        }
    } catch {
        /* non-JSON body */
    }

    if (!providerCode) {
        const match = raw.match(ERR_CODE_RE);
        if (match) {
            providerCode = match[0].toUpperCase();
        }
    }

    if (!providerDetail && preview && !preview.trimStart().startsWith("{")) {
        providerDetail = preview.slice(0, 500);
    }

    return {
        http_status: httpStatus,
        provider_code: providerCode,
        provider_title: providerTitle,
        provider_detail: providerDetail,
        body_preview: preview,
        endpoint: endpoint,
    };
}

function dhlAppDeniedHint(unknownChannel: boolean): string {
    if (unknownChannel) {
        return (
            "DHL rejected this developer-app channel (unknown channel). " +
            "Use the DHL Developer Portal app subscribed for " +
            "Post & Parcel Germany / Internetmarke — not a stale/Wing-mapped app — " +
            "and update PORTO_DEUTSCHEPOST_INTERNETMARKE_DHL_API_KEY / _SECRET."
        );
    }
    return (
        "Confirm DHL Developer Portal API key/secret and API subscription " +
        "for Post & Parcel Germany / Internetmarke."
    );
}

function authErrorDetails(info: InternetmarkeAuthErrorInfo): Record<string, unknown> {
    const bag: Record<string, unknown> = {
        ...info.providerError,
        reason: info.diagnosticReason,
        stage: info.authStage,
    };
    if (info.hint) bag.hint = info.hint;
    if (info.userAction !== undefined) bag.action = info.userAction;
    if (info.triggersPortokasseFreigabeEmail) bag.triggers_approval_email = true;
    return { provider_error: bag };
}

export function internetmarkeAuthErrorDetails(
    info: InternetmarkeAuthErrorInfo,
): Record<string, unknown> {
    return authErrorDetails(info);
}

export function mapInternetmarkeAuthHttpError(
    httpStatus: number,
    responseBody: string,
    args: {
        endpoint: InternetmarkeAuthEndpoint;
        appTokenObtained?: boolean;
    },
): InternetmarkeAuthErrorInfo {
    const lower = bodyLower(responseBody);
    const appTokenObtained = args.appTokenObtained ?? false;
    const providerError = buildProviderError(httpStatus, responseBody, args.endpoint);
    const unknownChannel = looksLikeUnknownChannel(lower);

    if (args.endpoint === InternetmarkeAuthEndpoint.DHL_APP_TOKEN) {
        if (looksLikeDhlAppDenied(lower)) {
            return {
                code: PortoErrorCode.PORTO_AUTH_DENIED,
                message: "DHL developer app not authorized for this API",
                authStage: "dhl_developer_app",
                hint: dhlAppDeniedHint(unknownChannel),
                retryable: false,
                diagnosticReason: unknownChannel
                    ? DIAG_UNKNOWN_CHANNEL
                    : DIAG_INVALID_APP_CREDENTIALS,
                providerError,
            };
        }
        if (httpStatus === 401 || httpStatus === 403) {
            return {
                code: PortoErrorCode.PORTO_AUTH_FAILED,
                message: "DHL developer app credentials missing, invalid, or rejected",
                authStage: "dhl_developer_app",
                hint: dhlAppDeniedHint(false),
                retryable: false,
                diagnosticReason: DIAG_INVALID_APP_CREDENTIALS,
                providerError,
            };
        }
        return {
            code: PortoErrorCode.PORTO_AUTH_FAILED,
            message: `INTERNETMARKE DHL app auth failed (HTTP ${httpStatus})`,
            authStage: "dhl_developer_app",
            hint: "Inspect provider_error in error details.",
            retryable: false,
            diagnosticReason: DIAG_INVALID_APP_CREDENTIALS,
            providerError,
        };
    }

    if (
        args.endpoint === InternetmarkeAuthEndpoint.PORTOKASSE_USER ||
        args.endpoint === InternetmarkeAuthEndpoint.COMBINED_USER
    ) {
        if (
            looksLikeDhlAppDenied(lower) &&
            args.endpoint === InternetmarkeAuthEndpoint.COMBINED_USER
        ) {
            return {
                code: PortoErrorCode.PORTO_AUTH_DENIED,
                message: "DHL developer app not authorized for this API",
                authStage: "dhl_developer_app",
                hint: dhlAppDeniedHint(unknownChannel),
                retryable: false,
                diagnosticReason: unknownChannel
                    ? DIAG_UNKNOWN_CHANNEL
                    : DIAG_INVALID_APP_CREDENTIALS,
                providerError,
            };
        }

        if (
            httpStatus === 401 ||
            httpStatus === 403 ||
            looksLikePortokasseAppNotApproved(lower) ||
            (httpStatus === 401 &&
                args.endpoint === InternetmarkeAuthEndpoint.PORTOKASSE_USER &&
                appTokenObtained)
        ) {
            if (looksLikeInvalidPortokasseCredentials(lower)) {
                return {
                    code: PortoErrorCode.PORTO_AUTH_FAILED,
                    message: "Portokasse username or password rejected",
                    authStage: "portokasse_credentials",
                    hint: "Verify Portokasse username and password in configuration.",
                    retryable: false,
                    diagnosticReason: DIAG_INVALID_PORTOKASSE_CREDENTIALS,
                    providerError,
                };
            }
            return {
                code: PortoErrorCode.PORTO_LINKAGE_PENDING,
                message: "Portokasse user has not approved this business application",
                authStage: "portokasse_linkage",
                hint:
                    "Per DHL documentation, missing Freigabe returns HTTP 401 on token retrieval. " +
                    "Deutsche Post emails the Portokasse user with a Freigabe request. " +
                    "Approve under Portokasse → Meine Daten → Geschäftsanwendungen, then retry.",
                retryable: false,
                diagnosticReason: DIAG_PENDING_PORTOKASSE_APPROVAL,
                providerError,
                userAction: "portokasse_geschaeftsanwendungen_freigabe",
                triggersPortokasseFreigabeEmail: true,
            };
        }

        if (httpStatus === 401) {
            return {
                code: PortoErrorCode.PORTO_AUTH_FAILED,
                message: "INTERNETMARKE authentication failed (HTTP 401)",
                authStage: "portokasse_credentials",
                hint:
                    "Verify Portokasse credentials or approve the app under " +
                    "Geschäftsanwendungen.",
                retryable: false,
                diagnosticReason: DIAG_INVALID_PORTOKASSE_CREDENTIALS,
                providerError,
            };
        }

        return {
            code: PortoErrorCode.PORTO_AUTH_FAILED,
            message: `INTERNETMARKE authentication failed (HTTP ${httpStatus})`,
            authStage: "unknown",
            hint: "Inspect provider_error in error details.",
            retryable: false,
            diagnosticReason: DIAG_UNKNOWN,
            providerError,
        };
    }

    return {
        code: PortoErrorCode.PORTO_AUTH_FAILED,
        message: `INTERNETMARKE authentication failed (HTTP ${httpStatus})`,
        authStage: "unknown",
        hint: "Inspect provider_error in error details.",
        retryable: false,
        diagnosticReason: DIAG_UNKNOWN,
        providerError,
    };
}

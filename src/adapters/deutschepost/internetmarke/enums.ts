/**
 * Deutsche Post Internetmarke adapter enums
 */

export enum InternetmarkeProductCode {
    STANDARD = "STANDARD",
    KOMPAKT = "KOMPAKT",
    GROSSBRIEF = "GROSSBRIEF",
    MAXIBRIEF = "MAXIBRIEF",
    WARENSENDUNG = "WARENSENDUNG",
}

export enum InternetmarkeVendorErrorPattern {
    AUTH = "AUTH",
    LOGIN = "LOGIN",
    INSUFFICIENT = "INSUFFICIENT",
    FUNDS = "FUNDS",
    WALLET = "WALLET",
    BALANCE = "BALANCE",
    PRODUCT = "PRODUCT",
    INVALID_PRODUCT = "INVALID_PRODUCT",
    RATE_LIMIT = "RATE_LIMIT",
    TOO_MANY = "TOO_MANY",
}

export enum InternetmarkeRetryableErrorCode {
    TIMEOUT = "TIMEOUT",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    RATE_LIMIT = "RATE_LIMIT",
}

import { PortoErrorCode } from "../codes.js";
import { PortoError } from "../exceptions.js";

export function raiseDestinationInvalid(
    message: string,
    options: {
        countryCode: string;
        reason?: string;
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options.details ?? {}) };
    payload.country_code = options.countryCode;
    if (options.reason) payload.reason = options.reason;
    throw new PortoError(
        message,
        PortoErrorCode.PORTO_DESTINATION_INVALID,
        options.statusCode,
        payload,
    );
}

export function raiseTooHeavy(
    message: string,
    options: {
        weight: number;
        maxWeight?: number;
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options.details ?? {}) };
    payload.weight = options.weight;
    if (options.maxWeight !== undefined) payload.max_weight = options.maxWeight;
    throw new PortoError(message, PortoErrorCode.PORTO_TOO_HEAVY, options.statusCode, payload);
}

export function raiseProductNotFound(
    message: string,
    options: {
        zoneId: string;
        weightTierId: string;
        productId?: string;
        candidates?: string[];
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options.details ?? {}) };
    payload.zone_id = options.zoneId;
    payload.weight_tier_id = options.weightTierId;
    if (options.productId) payload.product_id = options.productId;
    if (options.candidates) payload.candidates = options.candidates;
    throw new PortoError(
        message,
        PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
        options.statusCode,
        payload,
    );
}

export function raiseProductAmbiguous(
    message: string,
    options: {
        zoneId: string;
        weightTierId: string;
        candidates: string[];
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options.details ?? {}) };
    payload.zone_id = options.zoneId;
    payload.weight_tier_id = options.weightTierId;
    payload.candidates = options.candidates;
    throw new PortoError(
        message,
        PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS,
        options.statusCode,
        payload,
    );
}

export function raisePriceNotFound(
    message: string,
    options: {
        productId: string;
        zoneId: string;
        weightTierId: string;
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options.details ?? {}) };
    payload.product_id = options.productId;
    payload.zone_id = options.zoneId;
    payload.weight_tier_id = options.weightTierId;
    throw new PortoError(
        message,
        PortoErrorCode.PORTO_PRICE_NOT_FOUND,
        options.statusCode,
        payload,
    );
}

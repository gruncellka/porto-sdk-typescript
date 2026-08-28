import { PortoErrorCode } from "../codes.js";
import { DataError } from "../exceptions.js";

export function raiseDataNotFound(
    message: string,
    options?: { path?: string; entityId?: string; details?: Record<string, unknown> },
): never {
    const payload: Record<string, unknown> = { ...(options?.details ?? {}) };
    if (options?.path) payload.path = options.path;
    if (options?.entityId) payload.entity_id = options.entityId;
    throw new DataError(message, PortoErrorCode.PORTO_DATA_NOT_FOUND, undefined, payload);
}

export function raiseDataInvalid(
    message: string,
    options?: { path?: string; entityId?: string; details?: Record<string, unknown> },
): never {
    const payload: Record<string, unknown> = { ...(options?.details ?? {}) };
    if (options?.path) payload.path = options.path;
    if (options?.entityId) payload.entity_id = options.entityId;
    throw new DataError(message, PortoErrorCode.PORTO_DATA_INVALID, undefined, payload);
}

export function raiseDataCorrupted(
    message: string,
    options?: {
        path?: string;
        expected?: string;
        actual?: string;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = { ...(options?.details ?? {}) };
    if (options?.path) payload.path = options.path;
    if (options?.expected) payload.expected = options.expected;
    if (options?.actual) payload.actual = options.actual;
    throw new DataError(message, PortoErrorCode.PORTO_DATA_CORRUPTED, undefined, payload);
}

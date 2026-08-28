/**
 * Fetch mark document bytes from PortoMark.content.
 *
 * Phase 1 (postMark) returns a PortoMark with a provider document URL.
 * Phase 2 (fetchMarkBytes) downloads and normalizes the payload — free to retry.
 */

import { PortoErrorCode, TransportError, ValidationError } from "./errors.js";
import { type PortoMark, markWire } from "./execution/index.js";
import { type Seconds, seconds } from "./time.js";
import { HttpClient, type Transport } from "./transport/http-client.js";

export const DEFAULT_MARK_FETCH_RETRIES = 3;
export const DEFAULT_MARK_FETCH_TIMEOUT = seconds(30);

export interface FetchMarkBytesOptions {
    retries?: number;
    timeout?: Seconds | number;
    backoff?: Seconds | number;
    httpClient?: Transport;
    normalize?: (payload: Uint8Array) => Uint8Array;
}

function isRemoteContent(content: string): boolean {
    const lowered = content.toLowerCase();
    return lowered.startsWith("http://") || lowered.startsWith("https://");
}

export function normalizeMarkDocument(
    mark: PortoMark,
    payload: Uint8Array,
    normalize?: (payload: Uint8Array) => Uint8Array,
): Uint8Array {
    const contentType = (mark.contentType || "").toLowerCase();
    const pdfMagic =
        payload.length >= 4 &&
        payload[0] === 0x25 &&
        payload[1] === 0x50 &&
        payload[2] === 0x44 &&
        payload[3] === 0x46;
    if (contentType === "application/pdf" || pdfMagic) {
        return payload;
    }
    if (
        payload.length >= 8 &&
        payload[0] === 0x89 &&
        payload[1] === 0x50 &&
        payload[2] === 0x4e &&
        payload[3] === 0x47
    ) {
        return payload;
    }
    if (normalize) {
        try {
            return normalize(payload);
        } catch {
            throw new ValidationError(
                "Unsupported mark document payload",
                PortoErrorCode.PORTO_MARK_FAILED,
                422,
                { markId: mark.id },
                false,
                mark.provider,
            );
        }
    }
    throw new ValidationError(
        "Unsupported mark document payload",
        PortoErrorCode.PORTO_MARK_FAILED,
        422,
        { markId: mark.id },
        false,
        mark.provider,
    );
}

async function downloadMarkPayload(
    mark: PortoMark,
    options: Required<Pick<FetchMarkBytesOptions, "retries" | "timeout" | "backoff">> &
        Pick<FetchMarkBytesOptions, "httpClient">,
): Promise<Uint8Array> {
    const wire = markWire(mark);
    if (!mark.content) {
        throw new ValidationError(
            "PortoMark.content is empty",
            PortoErrorCode.PORTO_MARK_FAILED,
            422,
            { markId: mark.id },
            false,
            mark.provider,
            wire || undefined,
        );
    }
    if (!isRemoteContent(mark.content)) {
        throw new ValidationError(
            "PortoMark.content is not a downloadable URL",
            PortoErrorCode.PORTO_MARK_FAILED,
            422,
            { markId: mark.id, contentPrefix: mark.content.slice(0, 32) },
            false,
            mark.provider,
            wire || undefined,
        );
    }

    const client =
        options.httpClient ??
        new HttpClient(options.timeout ?? DEFAULT_MARK_FETCH_TIMEOUT, options.retries);
    const response = await client.request({
        method: "GET",
        url: mark.content,
        idempotent: true,
    });
    if (response.status >= 400) {
        const retryable = response.status >= 500 || response.status === 429;
        throw new TransportError(
            `Mark document download failed with HTTP ${response.status}`,
            response.status < 500
                ? PortoErrorCode.PORTO_MARK_FAILED
                : PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
            response.status,
            { markId: mark.id, url: mark.content },
            retryable,
            mark.provider,
            wire || undefined,
        );
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

export async function fetchMarkBytes(
    mark: PortoMark,
    options: FetchMarkBytesOptions = {},
): Promise<Uint8Array> {
    const resolved = {
        retries: options.retries ?? DEFAULT_MARK_FETCH_RETRIES,
        timeout: options.timeout ?? DEFAULT_MARK_FETCH_TIMEOUT,
        backoff: options.backoff ?? seconds(0.5),
        httpClient: options.httpClient,
    };
    const payload = await downloadMarkPayload(mark, resolved);
    return normalizeMarkDocument(mark, payload, options.normalize);
}

export async function fetchMarkBytesToBuffer(
    mark: PortoMark,
    options: FetchMarkBytesOptions = {},
): Promise<Buffer> {
    const bytes = await fetchMarkBytes(mark, options);
    return Buffer.from(bytes);
}

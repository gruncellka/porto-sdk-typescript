import { DEFAULT_TRANSPORT } from "../config.js";
import { PortoErrorCode, TransportError } from "../errors";
import { type Seconds, seconds, secondsToMs } from "../time.js";

const DEFAULT_TIMEOUT = seconds(Number(DEFAULT_TRANSPORT.timeout));
const DEFAULT_MAX_RETRIES = DEFAULT_TRANSPORT.retries;
const DEFAULT_BACKOFF = seconds(Number(DEFAULT_TRANSPORT.backoff));

function sdkVersion(): string {
    return process.env.npm_package_version || "0.0.0";
}

export function buildUserAgent(): string {
    return `gruncellka-porto-sdk/${sdkVersion()} (node/${process.versions.node.split(".")[0]})`;
}

export interface RequestOptions {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    idempotent?: boolean;
    idempotencyKey?: string;
}

/** HTTP request seam used by adapters and PortoClient. */
export interface Transport {
    request(options: RequestOptions): Promise<Response>;
}

export class HttpClient implements Transport {
    private readonly timeout: Seconds;
    private readonly backoff: Seconds;

    constructor(
        timeout: Seconds | number = DEFAULT_TIMEOUT,
        private retries: number = DEFAULT_MAX_RETRIES,
        private sleep: (ms: number) => Promise<void> = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms)),
    ) {
        this.timeout = seconds(Number(timeout));
        this.backoff = DEFAULT_BACKOFF;
    }

    async request(options: RequestOptions): Promise<Response> {
        const idempotent = options.idempotent ?? true;
        const maxAttempts = idempotent || options.idempotencyKey ? this.retries : 1;
        const headers: Record<string, string> = {
            "User-Agent": buildUserAgent(),
            ...options.headers,
        };
        if (options.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }
        if (options.idempotencyKey) {
            headers["Idempotency-Key"] = options.idempotencyKey;
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), secondsToMs(this.timeout));
            try {
                const response = await fetch(options.url, {
                    method: options.method,
                    headers,
                    body: options.body,
                    signal: abort.signal,
                });
                clearTimeout(timer);
                if (response.status >= 500 && attempt < maxAttempts) {
                    await this.sleep(secondsToMs(this.backoff) * 2 ** (attempt - 1));
                    continue;
                }
                return response;
            } catch (error: unknown) {
                clearTimeout(timer);
                const timeout =
                    typeof error === "object" &&
                    error !== null &&
                    "name" in error &&
                    (error as { name?: string }).name === "AbortError";
                const cause =
                    typeof error === "object" &&
                    error !== null &&
                    "message" in error &&
                    typeof (error as { message?: string }).message === "string"
                        ? (error as { message: string }).message
                        : String(error);
                const mappedError = new TransportError(
                    timeout ? "Request timed out" : "Network error",
                    timeout
                        ? PortoErrorCode.PORTO_NETWORK_TIMEOUT
                        : PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
                    timeout ? 408 : 503,
                    {
                        url: options.url,
                        method: options.method,
                        cause,
                    },
                    attempt < maxAttempts,
                );
                if (attempt < maxAttempts) {
                    await this.sleep(secondsToMs(this.backoff) * 2 ** (attempt - 1));
                    continue;
                }
                throw mappedError;
            }
        }

        throw new TransportError(
            "Exhausted retries",
            PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
            503,
            { url: options.url, method: options.method },
            false,
        );
    }
}

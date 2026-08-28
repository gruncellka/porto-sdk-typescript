import { describe, expect, it, vi } from "vitest";

import { PortoClient } from "../../src/client.js";
import { PortoErrorCode, TransportError } from "../../src/errors";
import { HttpClient, type Transport } from "../../src/transport/http-client";

describe("HttpClient retry policy", () => {
    it("retries 5xx for idempotent requests", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("x", { status: 500 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new HttpClient(30, 3, async () => {});

        const response = await client.request({
            method: "GET",
            url: "https://example.test",
            idempotent: true,
        });
        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry non-idempotent without key", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
        vi.stubGlobal("fetch", fetchMock);
        const client = new HttpClient(30, 3, async () => {});

        await expect(
            client.request({ method: "POST", url: "https://example.test", idempotent: false }),
        ).rejects.toBeInstanceOf(TransportError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries non-idempotent with idempotency key", async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new HttpClient(30, 3, async () => {});

        const response = await client.request({
            method: "POST",
            url: "https://example.test",
            idempotent: false,
            idempotencyKey: "abc",
            body: JSON.stringify({ hello: "world" }),
        });
        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("maps timeout abort to PORTO_NETWORK_TIMEOUT transport error", async () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        const fetchMock = vi.fn().mockRejectedValue(abortError);
        vi.stubGlobal("fetch", fetchMock);
        const client = new HttpClient(0.05, 1, async () => {});

        await expect(
            client.request({ method: "GET", url: "https://example.test" }),
        ).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_NETWORK_TIMEOUT,
            statusCode: 408,
        });
    });
});

describe("PortoClient transport injection", () => {
    it("uses the injected transport as the shared client", () => {
        const fake: Transport = { request: vi.fn() };
        const client = new PortoClient({ providers: { deutschepost: {} } }, { transport: fake });
        expect(client._sharedHttp()).toBe(fake);
    });

    it("constructs HttpClient by default", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(client._sharedHttp()).toBeInstanceOf(HttpClient);
    });
});

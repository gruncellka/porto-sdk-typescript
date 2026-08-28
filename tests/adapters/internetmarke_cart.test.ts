import { describe, expect, it } from "vitest";

import { InternetmarkeAdapter } from "../../src/adapters/deutschepost/internetmarke/adapter.js";
import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import type { PortoMarkRequest } from "../../src/execution/index.js";
import { RECIPIENT } from "../../src/requires.js";
import type { PortoExecution } from "../../src/services/porto-execution.js";
import type { Porto } from "../../src/services/porto-resolver.js";
import type { Transport } from "../../src/transport/http-client.js";
import { lickoRecipient, lickoSender } from "../support/addresses.js";
import { boundProvider } from "../support/bound-provider.js";

const DE_SENDER = lickoSender();
const DE_RECIPIENT = lickoRecipient("DE");

function imExecution(client: PortoClient, adapter: InternetmarkeAdapter): PortoExecution {
    adapter.setCountryCode3Lookup((code) => client.jurisdictions.countryCode3(code));
    const execution = (boundProvider(client) as unknown as { execution: PortoExecution }).execution;
    execution.api = adapter;
    return execution;
}

async function resolveStamp(client: PortoClient, weight = 20): Promise<Porto> {
    return boundProvider(client).resolve({
        countryCode: "DE",
        weight,
    });
}

function adapterWithHttp(http: Transport): InternetmarkeAdapter {
    return new InternetmarkeAdapter(
        "user",
        "pass",
        "key",
        "secret",
        "https://api-eu.dhl.com/post/de/shipping/im/v1",
        undefined,
        undefined,
        http,
    );
}

function cartHttp(opts?: { failPng?: boolean }): {
    http: Transport;
    calls: Array<{ url: string; body?: string }>;
} {
    const calls: Array<{ url: string; body?: string }> = [];
    const http: Transport = {
        async request(options) {
            calls.push({ url: options.url, body: options.body });
            const url = options.url;
            if (url.replace(/\/$/, "").endsWith("/user")) {
                return new Response(JSON.stringify({ access_token: "token", expires_in: 3000 }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            if (url.replace(/\/$/, "").endsWith("/shoppingcart")) {
                return new Response(JSON.stringify({ shopOrderId: "order-1" }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            if (opts?.failPng) {
                return new Response(JSON.stringify({ message: "cart rejected" }), {
                    status: 500,
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(
                JSON.stringify({
                    shopOrderId: "order-1",
                    link: "https://example.test/cart.zip",
                    voucherList: [{ shopOrderId: "order-1" }],
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        },
    };
    return { http, calls };
}

describe("Internetmarke mark(many)", () => {
    it("rejects an empty list", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const adapter = adapterWithHttp({
            async request() {
                throw new Error("unreachable");
            },
        });
        const execution = imExecution(client, adapter);
        await expect(execution.mark([] as PortoMarkRequest[])).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_MARK_INVALID,
        });
    });

    it("executes heterogeneous Portos in one PNG checkout preserving order", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const light = await resolveStamp(client, 20);
        const heavy = await resolveStamp(client, 400);
        const { http, calls } = cartHttp();
        const adapter = adapterWithHttp(http);
        const execution = imExecution(client, adapter);
        const marks = await execution.mark([{ porto: light }, { porto: heavy }, { porto: light }]);
        expect(marks).toHaveLength(3);
        expect(marks.map((mark) => mark.amount)).toEqual([
            light.amount,
            heavy.amount,
            light.amount,
        ]);
        const pngCalls = calls.filter((call) => call.url.includes("shoppingcart/png"));
        expect(pngCalls).toHaveLength(1);
        const body = JSON.parse(String(pngCalls[0].body));
        expect(body.positions).toHaveLength(3);
        expect(body.total).toBe(light.amount * 2 + heavy.amount);
        expect(adapter.lastManyTrace?.request).toMatchObject({
            positions: expect.any(Array),
        });
        expect((adapter.lastManyTrace?.request as { positions: unknown[] }).positions).toHaveLength(
            3,
        );
    });

    it("allows address-bearing positions in many when addresses are supplied", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = { ...(await resolveStamp(client)), requires: [RECIPIENT] };
        const { http, calls } = cartHttp();
        const adapter = adapterWithHttp(http);
        const execution = imExecution(client, adapter);
        const marks = await execution.mark([
            { porto, sender: DE_SENDER, recipient: DE_RECIPIENT },
            { porto, sender: DE_SENDER, recipient: DE_RECIPIENT },
        ]);
        expect(marks).toHaveLength(2);
        const pngCalls = calls.filter((call) => call.url.includes("shoppingcart/png"));
        expect(pngCalls).toHaveLength(1);
        expect(JSON.parse(String(pngCalls[0].body)).positions).toHaveLength(2);
    });

    it("maps provider cart failure to PORTO_MARK_FAILED", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolveStamp(client);
        const { http } = cartHttp({ failPng: true });
        const adapter = adapterWithHttp(http);
        const execution = imExecution(client, adapter);
        try {
            await execution.mark([{ porto }, { porto }]);
            throw new Error("expected failure");
        } catch (error) {
            expect(error).toBeInstanceOf(PortoError);
            const portoError = error as PortoError;
            expect([
                PortoErrorCode.PORTO_MARK_FAILED,
                PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
            ]).toContain(portoError.code);
        }
    });
});

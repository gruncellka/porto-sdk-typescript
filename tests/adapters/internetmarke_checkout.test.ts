import { describe, expect, it, vi } from "vitest";

import { InternetmarkeCheckout } from "../../src/adapters/deutschepost/internetmarke/checkout.js";
import { PositionFactory } from "../../src/adapters/deutschepost/internetmarke/positions.js";

describe("InternetmarkeCheckout", () => {
    it("passes idempotency key to transport layer", async () => {
        const auth = {
            authenticate: vi.fn(async () => {}),
            getToken: vi.fn(() => "token"),
        };
        const requestSpy = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ shopOrderId: "so1" }), { status: 200 }),
            );
        const pngSpy = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ link: "https://example.test/stamp.png" }), {
                status: 200,
            }),
        );
        const checkout = new InternetmarkeCheckout(auth as never, "https://example.test", {
            request: vi.fn().mockImplementationOnce(requestSpy).mockImplementationOnce(pngSpy),
        });
        const stamp = await checkout.png({
            positions: [new PositionFactory().png({ productCode: 1 })],
            total: 100,
            execution: { requestId: "o1", idempotencyKey: "idmp-1" },
        });
        expect(stamp.shopOrderId).toBe("so1");
        expect(stamp.link).toBe("https://example.test/stamp.png");
        expect(requestSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotent: false,
                idempotencyKey: "idmp-1",
            }),
        );
        const shoppingCartCall = pngSpy.mock.calls[0]?.[0] as { body?: string };
        expect(shoppingCartCall.body).toContain('"optimizePNG":true');
        expect(shoppingCartCall.body).not.toContain("optimizePng");
    });

    it("posts one PNG checkout with three positions", async () => {
        const auth = {
            authenticate: vi.fn(async () => {}),
            getToken: vi.fn(() => "token"),
        };
        const calls: Array<{ url?: string; body?: string }> = [];
        const checkout = new InternetmarkeCheckout(auth as never, "https://example.test", {
            request: vi.fn().mockImplementation(async (req: { url?: string; body?: string }) => {
                calls.push(req);
                if (String(req.url).endsWith("/shoppingcart")) {
                    return new Response(JSON.stringify({ shopOrderId: "order-1" }), {
                        status: 200,
                    });
                }
                return new Response(
                    JSON.stringify({
                        shopOrderId: "order-1",
                        link: "https://example.test/cart.zip",
                    }),
                    { status: 200 },
                );
            }),
        });
        const factory = new PositionFactory();
        const result = await checkout.png({
            positions: [
                factory.png({ productCode: 21, markType: "stamp" }),
                factory.png({ productCode: 21, markType: "stamp" }),
                factory.png({ productCode: 21, markType: "stamp" }),
            ],
            total: 285,
            execution: { requestId: "cart-1", idempotencyKey: "idmp-cart" },
        });
        const initCalls = calls.filter((call) => String(call.url).endsWith("/shoppingcart"));
        const pngCalls = calls.filter((call) => String(call.url).includes("shoppingcart/png"));
        expect(initCalls).toHaveLength(1);
        expect(pngCalls).toHaveLength(1);
        const body = JSON.parse(String(pngCalls[0]?.body));
        expect(body.positions).toHaveLength(3);
        expect(body.total).toBe(285);
        expect(result.shopOrderId).toBe("order-1");
        expect(result.link).toBe("https://example.test/cart.zip");
    });
});

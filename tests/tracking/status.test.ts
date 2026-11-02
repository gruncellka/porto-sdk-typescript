import { describe, expect, it } from "vitest";
import { InternetmarkeAdapter } from "../../src/adapters/deutschepost/internetmarke/adapter.js";
import { Adapter as Shipment } from "../../src/adapters/deutschepost/tracking/shipment.js";
import { MAP as deutschepost } from "../../src/adapters/deutschepost/tracking/status-map.js";
import { MAP as laposte } from "../../src/adapters/laposte/tracking/status-map.js";
import { MAP as swisspost } from "../../src/adapters/swisspost/tracking/status-map.js";
import { mapNativeStatus } from "../../src/adapters/tracking/acl.js";
import {
    StubTrackingAdapter,
    UnsupportedTrackingAdapter,
    getTrackingAdapter,
    mapEvent,
    trackingWireId,
} from "../../src/adapters/tracking/adapter.js";
import { MAP as ukrposhta } from "../../src/adapters/ukrposhta/tracking/status-map.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { sanitizeProviderPayload } from "../../src/provider-payload.js";
import { PortoStatus } from "../../src/types/index.js";

const MAPS: Record<string, Record<string, PortoStatus>> = {
    deutschepost,
    laposte,
    swisspost,
    ukrposhta,
};

const CHECKOUT = {
    shopOrderId: "order-1",
    link: "https://example.test/mark.pdf",
    accessToken: "secret-token",
    voucherList: [{ voucherId: "v-1" }],
};

const CHECKOUT_TRACKED = {
    shopOrderId: "order-2",
    link: "https://example.test/mark.pdf",
    voucherList: [
        { voucherId: "v-1", trackId: "TRACK1" },
        { voucherId: "v-2", trackId: "TRACK2" },
    ],
};

describe("tracking ACL", () => {
    it.each(Object.keys(MAPS))("%s map covers every PortoStatus", (provider) => {
        const mapped = new Set(
            Object.keys(MAPS[provider]).map((key) => mapNativeStatus(provider, key)),
        );
        expect(mapped).toEqual(new Set(Object.values(PortoStatus)));
    });

    it("leaves unknown native codes unmapped", () => {
        expect(mapNativeStatus("deutschepost", "not-a-real-dp-code")).toBeUndefined();
        const event = mapEvent({
            providerId: "deutschepost",
            trackingNumber: "AB",
            nativeCode: "not-a-real-dp-code",
            nativeLabel: "mystery",
            occurredAt: "2026-01-01T00:00:00+00:00",
            receivedAt: "2026-01-01T00:00:01+00:00",
        });
        expect(event.status).toBeUndefined();
        expect(event.providerCode).toBe("not-a-real-dp-code");
        expect(event.status).not.toBe(PortoStatus.TRANSIT);
        expect(PortoStatus).not.toHaveProperty("UNKNOWN");
    });

    it("maps Deutsche Post pre-transit to created", () => {
        const event = mapEvent({
            providerId: "deutschepost",
            trackingNumber: "AB",
            nativeCode: "pre-transit",
            nativeLabel: "Announced",
            occurredAt: "2026-01-01T00:00:00+00:00",
            receivedAt: "2026-01-01T00:00:01+00:00",
        });
        expect(event.status).toBe(PortoStatus.CREATED);
        expect(event.providerLabel).toBe("Announced");
    });
});

describe("tracking wires", () => {
    it("selects live Deutsche Post shipment only for an explicit base URL", () => {
        const stamp = getTrackingAdapter("deutschepost", { wireId: "internetmarke" });
        expect(stamp).toBeInstanceOf(UnsupportedTrackingAdapter);
        expect(stamp.trackingKind).toBe("stamp");
        expect(getTrackingAdapter("deutschepost", { wireId: "" })).toBeInstanceOf(
            UnsupportedTrackingAdapter,
        );
        expect(
            getTrackingAdapter("deutschepost", { wireId: "shipment", baseUrl: "  " }),
        ).toBeInstanceOf(UnsupportedTrackingAdapter);
        expect(
            getTrackingAdapter("deutschepost", {
                wireId: "shipment",
                baseUrl: "https://track.example",
                httpClient: { request: async () => new Response() },
            }),
        ).toBeInstanceOf(Shipment);
        expect(
            getTrackingAdapter("laposte", {
                wireId: "shipment",
                baseUrl: "https://track.example",
            }),
        ).toBeInstanceOf(StubTrackingAdapter);
        expect(trackingWireId(undefined)).toBeNull();
        expect(trackingWireId({ internetmarke: {} })).toBeNull();
        expect(trackingWireId({ shipment: { baseUrl: "" } })).toBeNull();
        expect(trackingWireId({ shipment: { baseUrl: "https://track.example" } })).toBe("shipment");
    });
});

describe("provider raw", () => {
    it("drops secret keys", () => {
        expect(
            sanitizeProviderPayload({
                shopOrderId: "o",
                accessToken: "nope",
                nested: [{ api_key: "x" }],
            }),
        ).toEqual({ shopOrderId: "o", nested: [{}] });
    });

    it("does not invent created from an Internetmarke checkout", () => {
        const adapter = new InternetmarkeAdapter() as unknown as {
            marksFromCheckout(
                result: {
                    shopOrderId: string;
                    link: string;
                    response: Record<string, unknown>;
                },
                contentType: "image/png" | "application/pdf",
                amounts: number[],
            ): Array<{
                externalId?: string;
                trackingNumber?: string;
                providerRaw?: Record<string, unknown>;
            }>;
        };
        const plain = adapter.marksFromCheckout(
            { shopOrderId: CHECKOUT.shopOrderId, link: CHECKOUT.link, response: CHECKOUT },
            "image/png",
            [95],
        );
        expect(plain[0]?.externalId).toBe("order-1");
        expect(plain[0]?.trackingNumber).toBeUndefined();
        expect(plain[0]?.providerRaw?.accessToken).toBeUndefined();
        const vouchers = plain[0]?.providerRaw?.voucherList as Array<{ voucherId: string }>;
        expect(vouchers[0]?.voucherId).toBe("v-1");

        const tracked = adapter.marksFromCheckout(
            {
                shopOrderId: CHECKOUT_TRACKED.shopOrderId,
                link: CHECKOUT_TRACKED.link,
                response: CHECKOUT_TRACKED,
            },
            "application/pdf",
            [95, 110],
        );
        expect(tracked.map((mark) => mark.trackingNumber)).toEqual(["TRACK1", "TRACK2"]);
        expect(tracked[0]?.providerRaw?.voucherIndex).toBe(0);
        expect(JSON.stringify(tracked)).not.toContain('"status"');
    });
});

describe("Deutsche Post shipment adapter", () => {
    it("maps events and keeps unknown status null", async () => {
        const body = {
            events: [
                {
                    code: "pre-transit",
                    label: "Announced",
                    timestamp: "2026-01-01T00:00:00Z",
                    token: "drop-me",
                },
                {
                    code: "not-a-real-dp-code",
                    label: "Mystery",
                    timestamp: "2026-01-02T00:00:00Z",
                },
            ],
        };
        let requested = "";
        const http = {
            request: async (options: { url: string }) => {
                requested = options.url;
                return new Response(JSON.stringify(body), { status: 200 });
            },
        };
        const adapter = new Shipment("https://track.example/", http);
        const snapshot = await adapter.track("AB 1");
        expect(snapshot.history[0]?.status).toBe(PortoStatus.CREATED);
        expect(snapshot.history[1]?.status).toBeUndefined();
        expect(snapshot.status).toBe(PortoStatus.CREATED);
        expect(JSON.stringify(snapshot.providerRaw)).not.toContain("drop-me");
        expect(requested).toContain("AB%201");
    });

    it("raises not-found and unavailable", async () => {
        const missing = new Shipment("https://track.example", {
            request: async () => new Response("{}", { status: 404 }),
        });
        await expect(missing.track("AB")).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_TRACKING_NOT_FOUND,
        });
        const bad = new Shipment("https://track.example", {
            request: async () => new Response("[]", { status: 200 }),
        });
        await expect(bad.track("AB")).rejects.toBeInstanceOf(PortoError);
    });
});

describe("deprecated trackStamp", () => {
    it("delegates to the unsupported stamp wire", async () => {
        const adapter = new InternetmarkeAdapter();
        await expect(adapter.trackStamp("AB")).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_TRACKING_UNSUPPORTED,
        });
    });
});

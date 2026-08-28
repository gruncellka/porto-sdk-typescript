import { describe, expect, it } from "vitest";

import { LAPOSTE_STATUS_MAP } from "../../src/adapters/laposte/tracking/status-map.js";
import { mapNativeStatus } from "../../src/adapters/tracking/acl.js";
import { mapEvent } from "../../src/adapters/tracking/adapter.js";
import { PortoClient } from "../../src/client.js";
import { configuredProviderIds, normalizePortoConfig } from "../../src/config.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { TrackingState } from "../../src/types/index.js";

describe("ProviderClient config", () => {
    it("normalizes single-provider config into providers map", () => {
        const cfg = normalizePortoConfig({ providers: { deutschepost: {} }, data: "/tmp" });
        expect(cfg.providers.deutschepost).toBeDefined();
        expect(configuredProviderIds(cfg).has("deutschepost")).toBe(true);
    });

    it("detects unconfigured provider ids", () => {
        const cfg = normalizePortoConfig({ providers: { deutschepost: {} }, data: "/tmp" });
        expect(configuredProviderIds(cfg).has("laposte")).toBe(false);
    });

    it("omitted providers injects no overlay keys", () => {
        const cfg = normalizePortoConfig({ data: "/tmp" });
        expect(cfg.allowlist).toBeNull();
        expect(Object.keys(cfg.providers)).toEqual([]);
        expect(configuredProviderIds({ data: "/tmp" }).size).toBe(0);
    });

    it("binds catalog ids without a providers row", () => {
        const client = new PortoClient();
        expect(client.provider("deutschepost").providerId).toBe("deutschepost");
        expect(client.provider("swisspost").providerId).toBe("swisspost");
    });

    it("rejects unknown provider ids", () => {
        const client = new PortoClient();
        expect(() => client.provider("not-a-carrier")).toThrow(PortoError);
        try {
            client.provider("not-a-carrier");
        } catch (error) {
            expect((error as PortoError).code).toBe(PortoErrorCode.PORTO_PROVIDER_NOT_CONFIGURED);
        }
    });

    it("present allowlist forbids unlisted catalog ids", () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        expect(() => client.provider("laposte")).toThrow(PortoError);
        expect(client.provider("deutschepost").providerId).toBe("deutschepost");
    });

    it("declares tracking error codes shared with Python", () => {
        expect(PortoErrorCode.PORTO_TRACKING_UNSUPPORTED).toBe("PORTO_TRACKING_UNSUPPORTED");
        expect(PortoErrorCode.PORTO_TRACKING_NOT_FOUND).toBe("PORTO_TRACKING_NOT_FOUND");
        expect(PortoErrorCode.PORTO_PROVIDER_NOT_CONFIGURED).toBe("PORTO_PROVIDER_NOT_CONFIGURED");
    });
});

describe("tracking ACL", () => {
    it("maps La Poste native codes", () => {
        expect(mapNativeStatus("laposte", "LIV")).toBe(TrackingState.DELIVERED);
        expect(Object.keys(LAPOSTE_STATUS_MAP).length).toBeGreaterThanOrEqual(5);
    });

    it("builds enriched tracking events with parity fields", () => {
        const event = mapEvent({
            providerId: "laposte",
            trackingNumber: "AB123",
            nativeCode: "LIV",
            nativeLabel: "Delivered",
            occurredAt: "2026-07-22T10:00:00+00:00",
            receivedAt: "2026-07-22T10:05:00+00:00",
            location: "Paris",
        });
        expect(event.providerId).toBe("laposte");
        expect(event.providerCode).toBe("LIV");
        expect(event.providerLabel).toBe("Delivered");
        expect(event.occurredAt).toBe("2026-07-22T10:00:00+00:00");
        expect(event.receivedAt).toBe("2026-07-22T10:05:00+00:00");
        expect(event.eventId).toBeTruthy();
        expect(event.status).toBe(TrackingState.DELIVERED);
    });
});

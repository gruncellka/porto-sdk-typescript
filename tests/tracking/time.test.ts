import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Adapter as Shipment } from "../../src/adapters/deutschepost/tracking/shipment.js";
import { assembleTracking, mapEvent } from "../../src/adapters/tracking/adapter.js";
import { normalizeOccurredAt } from "../../src/adapters/tracking/time.js";
import { PortoStatus } from "../../src/types/index.js";

interface TimeCase {
    name: string;
    input: string;
    value: string | null;
    kind: "offset" | "local" | null;
}

interface IdentityCase {
    name: string;
    provider: string;
    tracking: string;
    code: string;
    sequence: number | null;
    index: number | null;
    occurredAt: string | null;
    eventId: string;
}

interface Contract {
    normalization: TimeCase[];
    identity: IdentityCase[];
    assembly: {
        events: Array<{ code: string; occurredAt: string; sequence: number }>;
        status: PortoStatus;
        lastUpdate: string;
        statusChangedAt: string;
    };
}

const CONTRACT = JSON.parse(
    readFileSync(new URL("./time-cases.json", import.meta.url), "utf8"),
) as Contract;
const CASES = CONTRACT.normalization;

describe("tracking time contract", () => {
    it.each(CASES)("$name", (testCase) => {
        const result = normalizeOccurredAt(testCase.input);
        if (testCase.value === null) {
            expect(result).toBeUndefined();
        } else {
            expect(result).toEqual({
                value: testCase.value,
                kind: testCase.kind,
            });
        }
    });

    it("separates last update from normalized status change", () => {
        const history = CONTRACT.assembly.events.map((row) =>
            event(row.code, row.occurredAt, row.sequence),
        );
        expect(assembleTracking(history)).toMatchObject({
            status: CONTRACT.assembly.status,
            lastUpdate: CONTRACT.assembly.lastUpdate,
            statusChangedAt: CONTRACT.assembly.statusChangedAt,
        });
        expect(
            assembleTracking([...history, event("delivered", "2026-01-01T12:00:00+00:00", 3)]),
        ).toMatchObject({
            status: PortoStatus.DELIVERED,
            lastUpdate: "2026-01-01T12:00:00+00:00",
            statusChangedAt: "2026-01-01T12:00:00+00:00",
        });
    });

    it.each(CONTRACT.identity)("$name", (testCase) => {
        const result = mapEvent({
            providerId: testCase.provider,
            trackingNumber: testCase.tracking,
            nativeCode: testCase.code,
            occurredAt: testCase.occurredAt,
            receivedAt: "2026-01-01T13:00:00+00:00",
            nativeSequence: testCase.sequence,
            nativeIndex: testCase.index ?? undefined,
        });
        expect(result.eventId).toBe(testCase.eventId);
    });

    it("uses native sequence for stable identity", () => {
        const first = event("transit", undefined, 7, "2026-01-01T13:00:00+00:00");
        const repeated = event("transit", undefined, 7, "2026-01-02T13:00:00+00:00");
        const other = event("transit", undefined, 8);
        expect(first.eventId).toBe(repeated.eventId);
        expect(other.eventId).not.toBe(first.eventId);
        expect(first.occurredAt).toBeUndefined();
        expect(first.occurredKind).toBeUndefined();
    });

    it("uses an explicit provider-list index fallback", () => {
        const args = {
            providerId: "deutschepost",
            trackingNumber: "TRACK",
            nativeCode: "transit",
            receivedAt: "2026-01-01T13:00:00+00:00",
        };
        expect(mapEvent({ ...args, nativeIndex: 0 }).eventId).toBe(
            mapEvent({ ...args, nativeIndex: 0 }).eventId,
        );
        expect(mapEvent({ ...args, nativeIndex: 0 }).eventId).not.toBe(
            mapEvent({ ...args, nativeIndex: 1 }).eventId,
        );
    });

    it("keeps Ukrposhta real event ids local without changing the ACL", () => {
        const result = mapEvent({
            providerId: "ukrposhta",
            trackingNumber: "0500100031143",
            nativeCode: "41000",
            nativeLabel: "Delivery",
            occurredAt: "2023-05-20T17:38:00",
            receivedAt: "2023-05-20T18:00:00+00:00",
            nativeSequence: 16,
        });
        expect(result).toMatchObject({
            providerCode: "41000",
            occurredAt: "2023-05-20T17:38:00",
            occurredKind: "local",
        });
        expect(result.status).toBeUndefined();
    });

    it("keeps the offset on La Poste event.date", () => {
        const result = mapEvent({
            providerId: "laposte",
            trackingNumber: "TRACK",
            nativeCode: "PC2",
            nativeLabel: "In transit",
            occurredAt: "2017-12-02T09:11:00+02:00",
            receivedAt: "2017-12-02T10:00:00+00:00",
            nativeIndex: 0,
        });
        expect(result).toMatchObject({
            occurredAt: "2017-12-02T09:11:00+02:00",
            occurredKind: "offset",
            status: PortoStatus.TRANSIT,
        });
    });

    it("uses timestamp and never processingDate or poll time", async () => {
        const body = {
            events: [
                {
                    historicalState: "transit",
                    timestamp: "2026-01-01T10:00:00.123456789+00:00",
                    processingDate: "2026-01-01",
                    sequence: 1,
                },
                {
                    historicalState: "transit",
                    processingDate: "2026-01-02",
                    sequence: 2,
                },
            ],
        };
        const adapter = new Shipment("https://track.example", {
            request: async () => new Response(JSON.stringify(body), { status: 200 }),
        });
        const result = await adapter.track("TRACK");
        expect(result.history[0]).toMatchObject({
            occurredAt: "2026-01-01T10:00:00.123+00:00",
            occurredKind: "offset",
        });
        expect(result.history[1]?.occurredAt).toBeUndefined();
        expect(result.lastUpdate).toBeUndefined();
        expect(result.statusChangedAt).toBe("2026-01-01T10:00:00.123+00:00");
        expect([
            result.history[0]?.occurredAt,
            result.history[1]?.occurredAt,
            result.lastUpdate,
            result.statusChangedAt,
        ]).not.toContain(result.pollReceivedAt);
    });
});

function event(
    code: string,
    occurredAt: string | undefined,
    sequence: number,
    receivedAt = "2026-01-01T13:00:00+00:00",
) {
    return mapEvent({
        providerId: "deutschepost",
        trackingNumber: "TRACK",
        nativeCode: code,
        occurredAt,
        receivedAt,
        nativeSequence: sequence,
    });
}

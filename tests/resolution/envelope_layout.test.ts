import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";

function client(provider: string): PortoClient {
    return new PortoClient({ providers: { [provider]: {} } });
}

describe("layout join", () => {
    it("returns C5 DE window and mark facts, not a composed draw origin", () => {
        const layout = client("deutschepost").envelopes.layout("C5", "DE", "standardbrief", {
            zoneId: "domestic",
        }) as {
            width: number;
            height: number;
            window: Record<string, number>;
            mark: Record<string, unknown>;
        };

        expect(layout.width).toBe(229);
        expect(layout.height).toBe(162);
        expect(layout.window).toEqual({ x: 20, y: 57, width: 90, height: 45 });
        expect(layout.mark).toMatchObject({
            type: "stamp",
            size: { width: 37, height: 20 },
            placement: { x: 155, y: 0, width: 74, height: 40 },
        });
    });

    it("getMark returns type, size, and placement facts", () => {
        const mark = client("deutschepost").envelopes.getMark("standardbrief", {
            envelopeId: "C5",
            zoneId: "domestic",
        }) as Record<string, unknown>;
        expect(mark.type).toBe("stamp");
        expect(mark.size).toEqual({ width: 37, height: 20 });
        expect(mark.placement).toEqual({ x: 155, y: 0, width: 74, height: 40 });
        expect(mark.x_mm).toBeUndefined();
        expect(mark.placement).not.toBe("provider_defined");
    });

    it("getMark without envelope omits placement", () => {
        const mark = client("deutschepost").envelopes.getMark("standardbrief", {
            zoneId: "domestic",
        }) as Record<string, unknown>;
        expect(mark.type).toBe("stamp");
        expect(mark.size).toEqual({ width: 37, height: 20 });
        expect(mark.placement).toBeUndefined();
    });

    it("getMark unknown envelope omits placement", () => {
        const mark = client("deutschepost").envelopes.getMark("standardbrief", {
            envelopeId: "NOT_AN_ENVELOPE",
            zoneId: "domestic",
        }) as Record<string, unknown>;
        expect(mark.placement).toBeUndefined();
        expect(mark.placement).not.toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("La Poste C5 mark is a label inside the FR 74×40 zone", () => {
        const layout = client("laposte").envelopes.layout("C5", "FR", "lettre_verte", {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        expect(layout.mark).toMatchObject({
            type: "label",
            size: { width: 64, height: 34 },
            placement: { x: 155, y: 0, width: 74, height: 40 },
        });
    });

    it("Swiss Post exposes 40×40 size and 74×38 placement together", () => {
        const layout = client("swisspost").envelopes.layout("C5", "CH", "a_post_standardbrief", {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        expect(layout.mark).toMatchObject({
            type: "stamp",
            size: { width: 40, height: 40 },
            placement: { x: 155, y: 0, width: 74, height: 38 },
        });
    });

    it("Ukrposhta UA DL returns DSTU window and label size without envelope placement", () => {
        const layout = client("ukrposhta").envelopes.layout("DL", "UA", "lyst_standartnyi", {
            zoneId: "domestic",
        }) as { window: Record<string, number>; mark: Record<string, unknown> };
        expect(layout.window).toEqual({ x: 110, y: 45, width: 90, height: 45 });
        expect(layout.mark).toMatchObject({
            type: "label",
            size: { width: 148, height: 210 },
        });
        expect(layout.mark).not.toHaveProperty("placement");
    });

    it("omits window when jurisdiction is missing", () => {
        const envelopes = client("deutschepost").envelopes;
        expect(envelopes.geometry("DL")).not.toHaveProperty("window");
        expect(envelopes.layout("C5")).not.toHaveProperty("window");
        const rows = envelopes.list();
        expect(rows.some((row) => row.id === "DL")).toBe(true);
        expect(rows.some((row) => row.id === "C5")).toBe(true);
    });

    it("unknown jurisdiction omits window and may still attach a mark", () => {
        const layout = client("deutschepost").envelopes.layout("C5", "US", "standardbrief", {
            zoneId: "domestic",
        }) as { width: number; mark?: Record<string, unknown> };
        expect(layout.width).toBe(229);
        expect(layout).not.toHaveProperty("window");
        expect(layout.mark?.type).toBe("stamp");
    });

    it("unknown envelope id is PORTO_DATA_NOT_FOUND", () => {
        try {
            client("deutschepost").envelopes.layout("NOT_AN_ENVELOPE");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(PortoError);
            expect((err as PortoError).code).toBe(PortoErrorCode.PORTO_DATA_NOT_FOUND);
        }
    });

    it("C5 DE and UA windows differ", () => {
        const envelopes = client("deutschepost").envelopes;
        const de = envelopes.layout("C5", "DE") as { window: Record<string, number> };
        const ua = envelopes.layout("C5", "UA") as { window: Record<string, number> };
        expect(de.window).toBeDefined();
        expect(ua.window).toBeDefined();
        expect(de.window).not.toEqual(ua.window);
    });

    it("isolates Deutsche Post and Ukrposhta marks on the same envelope", () => {
        const de = client("deutschepost").envelopes.layout("C5", "DE", undefined, {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        const ua = client("ukrposhta").envelopes.layout("C5", "UA", undefined, {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        expect(JSON.stringify(de.mark)).not.toEqual(JSON.stringify(ua.mark));
    });

    it("isolates Deutsche Post and La Poste marks on the same envelope", () => {
        const de = client("deutschepost").envelopes.layout("C5", "DE", undefined, {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        const fr = client("laposte").envelopes.layout("C5", "FR", undefined, {
            zoneId: "domestic",
        }) as { mark: Record<string, unknown> };
        expect(de.mark.type).toBe("stamp");
        expect(fr.mark.type).toBe("label");
    });

    it("joins UA window with DE placement without copying the DE window", () => {
        const layout = client("deutschepost").envelopes.layout("C5", "UA", undefined, {
            zoneId: "domestic",
        }) as { window: Record<string, number>; mark: Record<string, unknown> };
        expect(layout.window).not.toEqual({ x: 20, y: 57, width: 90, height: 45 });
        expect(layout.mark.placement).toEqual({ x: 155, y: 0, width: 74, height: 40 });
    });
});

import { describe, expect, it, vi } from "vitest";

import { EnvelopeResolverService } from "../../src/services/envelope-resolver";

describe("EnvelopeResolverService", () => {
    const dataLoader = {
        listEnvelopes: vi.fn(() => [
            { id: "DL", label: "DL", width: 220, height: 110 },
            { id: "C6", label: "C6", width: 162, height: 114 },
            { id: "C5", label: "C5", width: 229, height: 162 },
            { id: "C4", label: "C4", width: 324, height: 229 },
            { id: "B4", label: "B4", width: 353, height: 250 },
        ]),
        getAllDimensions: vi.fn(() => []),
        getAllProducts: vi.fn(() => [{ id: "standardbrief", envelope_ids: ["DL", "C6", "C5"] }]),
        getAllWeightTiers: vi.fn(() => [{ id: "W0020", min_weight: 0, max_weight: 20 }]),
        resolutionGraph: {
            links: {
                standardbrief: { weight_tiers: ["W0020"], zones: ["domestic"] },
            },
        },
        envelopesLoader: {
            getEnvelope: vi.fn(),
            listEnvelopes: vi.fn(),
            allIds: vi.fn(() => new Set()),
        },
    } as any;
    const validation = {
        validateDimensions: vi.fn().mockResolvedValue({
            isValid: true,
            errors: [],
            warnings: [],
        }),
    } as any;

    it("identifies envelope format identity", async () => {
        const service = new EnvelopeResolverService(validation, dataLoader);
        const result = await service.identify({
            format: "C5",
            weight: 20,
        });

        expect(result.format).toBe("C5");
        expect(result.resolutionWeight).toBe(20);
    });

    it("uses dimensions flow when format is not provided", async () => {
        const service = new EnvelopeResolverService(validation, dataLoader);
        const result = await service.identify({
            dimensions: { length: 120, width: 160, height: 5 },
            weight: 18,
        });

        expect(result.format).toBeNull();
        expect(result.resolutionWeight).toBe(18);
    });

    it("rejects mixed format and explicit dimensions", () => {
        const service = new EnvelopeResolverService(validation, dataLoader);
        expect(() =>
            service.parseEnvelopeDimensions({
                format: "DL",
                dimensions: { length: 110, width: 220, height: 5 },
                weight: 20,
            }),
        ).toThrow("Use either --format OR --length --width --height, not both.");
    });

    it("loads supported formats from envelope catalog", () => {
        const service = new EnvelopeResolverService(validation, dataLoader);
        const supported = service.listSupportedFormats();
        expect(supported).toContain("B4");
        expect(service.parseEnvelopeDimensions({ format: "B4", weight: 200 }).height).toBe(5);
    });
});

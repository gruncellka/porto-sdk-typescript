import { describe, expect, it, vi } from "vitest";

import { loadPortoConfigFromEnv } from "../../src/config";

describe("loadPortoConfigFromEnv", () => {
    it("loads explicit env values only", () => {
        vi.stubEnv("PORTO_TIMEOUT", "31");
        vi.stubEnv("PORTO_RETRIES", "2");

        const cfg = loadPortoConfigFromEnv();
        expect(cfg.data).toBeUndefined();
        expect(cfg.transport?.timeout).toBe(31);
        expect(cfg.transport?.retries).toBe(2);
    });
});

import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/client.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

describe("PortoClient.clearCache", () => {
    it("clears all shared per-provider resolvers", async () => {
        const client = new PortoClient({
            data: resolvePortoDataPathForTests(),
            providers: { deutschepost: {}, swisspost: {} },
            cache: { enabled: true, ttl: 3600, maxSize: 128 },
        });
        const de = client.provider("deutschepost");
        const ch = client.provider("swisspost");

        expect(client.provider("deutschepost")._resolver).toBe(de._resolver);
        expect(client.provider("swisspost")._resolver).toBe(ch._resolver);
        expect(de._resolver).not.toBe(ch._resolver);

        await de._resolver.resolve({ countryCode: "DE", weight: 20 });
        await ch._resolver.resolve({ countryCode: "CH", weight: 20 });
        expect(de._resolver.getCacheStats().size).toBeGreaterThanOrEqual(1);
        expect(ch._resolver.getCacheStats().size).toBeGreaterThanOrEqual(1);

        client.clearCache();

        expect(de._resolver.getCacheStats().size).toBe(0);
        expect(ch._resolver.getCacheStats().size).toBe(0);
    });
});

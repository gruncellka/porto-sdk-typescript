import { describe, expect, it } from "vitest";

import { loadInternetmarkeConfig } from "../../src/adapters/deutschepost/internetmarke/bootstrap.js";
import { supportsBilling, supportsExecution } from "../../src/adapters/execution-registry.js";
import { UnavailableExecutionAdapter } from "../../src/adapters/unavailable-adapter.js";
import { PortoClient } from "../../src/client.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

describe("execution capabilities", () => {
    it("supports methods from porto-data manifest", () => {
        expect(supportsBilling("deutschepost", "wallet")).toBe(true);
        expect(supportsExecution("deutschepost", "mark")).toBe(true);
    });

    it("provider capabilities wallet matches manifest", () => {
        const im = loadInternetmarkeConfig("deutschepost");
        const client = new PortoClient({
            data: resolvePortoDataPathForTests(),
            providers: im
                ? { deutschepost: { wires: { internetmarke: im } } }
                : { deutschepost: {} },
        });
        const caps = boundProvider(client).capabilities();
        expect(caps.mark).toBe("ready");
        expect(caps.wallet).toBe("ready");
    });

    it("swisspost has no internetmarke execution methods", () => {
        expect(supportsBilling("swisspost", "wallet")).toBe(false);
        expect(supportsExecution("swisspost", "mark")).toBe(false);
    });

    it("billing raises capability unsupported without wallet method", async () => {
        const client = new PortoClient({
            providers: { swisspost: {} },
            data: resolvePortoDataPathForTests(),
        });
        await expect(boundProvider(client, "swisspost").wallet.balance()).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
            details: { capability: "wallet" },
        });
    });

    it("unavailable execution adapter fails clearly", async () => {
        const adapter = new UnavailableExecutionAdapter("swisspost", "none");
        await expect(adapter.balance()).rejects.toBeInstanceOf(PortoError);
        await expect(adapter.balance()).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
            details: { capability: "wallet", provider_id: "swisspost", wire: "none" },
            provider: "swisspost",
        });
    });
});

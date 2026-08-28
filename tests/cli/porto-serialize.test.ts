import { describe, expect, it, vi } from "vitest";

import { main } from "../../src/cli/index.js";
import {
    PORTO_JSON_KEYS,
    assertPortoJsonShape,
    portoHumanSummary,
    serializePorto,
} from "../../src/cli/porto-serialize.js";
import { PortoClient } from "../../src/client.js";
import { boundProvider } from "../support/bound-provider.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

describe("CLI Porto serialization", () => {
    it("serializePorto exposes the full public Porto shape", async () => {
        const bound = boundProvider(new PortoClient({ data: resolvePortoDataPathForTests() }));
        const porto = await bound.resolve({ countryCode: "DE", weight: 20 });
        const payload = serializePorto(porto);

        assertPortoJsonShape(payload);
        expect(payload.amount).toBe(porto.amount);
        expect(payload.currency).toBe(porto.currency);
        expect((payload.product as { id: string }).id).toBe(porto.product.id);
        expect((payload.weightTier as { id: string }).id).toBe(porto.weightTier.id);
        expect(payload.serviceIds).toEqual([...porto.serviceIds]);
    });

    it("human summary projects presentation fields only", async () => {
        const bound = boundProvider(new PortoClient({ data: resolvePortoDataPathForTests() }));
        const porto = await bound.resolve({ countryCode: "DE", weight: 20 });
        const summary = portoHumanSummary(porto);

        expect(summary).toHaveProperty("product");
        expect(summary).toHaveProperty("zone");
        expect(summary).toHaveProperty("price");
        expect(summary).not.toHaveProperty("weightTier");
        expect(summary).not.toHaveProperty("availableServices");
    });

    it("CLI resolve --json matches SDK serializePorto", async () => {
        process.env.PORTO_DATA_PATH = resolvePortoDataPathForTests();

        const bound = boundProvider(new PortoClient({ data: resolvePortoDataPathForTests() }));
        const porto = await bound.resolve({ countryCode: "DE", weight: 20 });
        const expected = serializePorto(porto);

        const logs: string[] = [];
        vi.spyOn(console, "log").mockImplementation((value: unknown) => {
            logs.push(String(value));
        });
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

        const originalArgv = process.argv;
        process.argv = [
            "node",
            "cli.ts",
            "resolve",
            "--country",
            "DE",
            "--weight",
            "20",
            "--provider",
            "deutschepost",
            "--json",
        ];
        await main();
        process.argv = originalArgv;

        const jsonLine = logs.find((line) => line.includes('"product"'));
        expect(jsonLine).toBeDefined();
        const cliPayload = JSON.parse(jsonLine as string);

        expect(Object.keys(cliPayload).sort()).toEqual([...PORTO_JSON_KEYS].sort());
        expect(cliPayload).toEqual(expected);
    });
});

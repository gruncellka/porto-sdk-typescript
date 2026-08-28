import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../../src/cli/index.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

describe("CLI smoke", () => {
    const originalDataPath = process.env.PORTO_DATA_PATH;

    beforeEach(() => {
        process.env.PORTO_DATA_PATH = resolvePortoDataPathForTests();
    });

    afterEach(() => {
        if (originalDataPath === undefined) {
            delete process.env.PORTO_DATA_PATH;
        } else {
            process.env.PORTO_DATA_PATH = originalDataPath;
        }
    });

    it("runs config check command with json output", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

        const originalArgv = process.argv;
        process.argv = ["node", "cli.ts", "config", "check", "--json"];
        await main();
        process.argv = originalArgv;

        expect(log).toHaveBeenCalled();
        expect(err).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
    });

    it("prints resolve output for type + country + weight", async () => {
        const logs: string[] = [];
        const log = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
            logs.push(String(value));
        });
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

        const originalArgv = process.argv;
        process.argv = ["node", "cli.ts", "resolve", "--country", "DE", "--weight", "20", "--json"];
        await main();
        process.argv = originalArgv;

        const json = logs.find((line) => line.includes('"product"'));
        expect(json).toBeDefined();
        const parsed = JSON.parse(json as string);
        expect(parsed).toHaveProperty("amount");
        expect(parsed).toHaveProperty("weightTier");
        expect(parsed).not.toHaveProperty("price");
        expect(parsed.product).toHaveProperty("id");
        expect(parsed.zone).toHaveProperty("id");

        expect(log).toHaveBeenCalled();
        expect(err).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
    });

    it("identifies envelope from format and weight without country", async () => {
        const logs: string[] = [];
        const log = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
            logs.push(String(value));
        });
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

        const originalArgv = process.argv;
        process.argv = ["node", "cli.ts", "identify", "--format", "C5", "--weight", "20", "--json"];
        await main();
        process.argv = originalArgv;

        const json = logs.find(
            (line) => line.includes('"format"') && line.includes('"resolutionWeight"'),
        );
        expect(json).toBeDefined();
        const parsed = JSON.parse(json as string);
        expect(parsed).toHaveProperty("format", "C5");
        expect(parsed).toHaveProperty("resolutionWeight");

        expect(log).toHaveBeenCalled();
        expect(err).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
    });
});

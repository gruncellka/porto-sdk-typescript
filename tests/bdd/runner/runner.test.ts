import { afterEach, describe, expect, it, vi } from "vitest";
import { BDD_BATCHES, batchesFor } from "./batches.js";
import { Reporter } from "./reporter.js";
import { parseCliArgs } from "./runner.js";
import { cucumberTagsForBatch, featurePathForBatch, featureTreeForBatch } from "./scenarios.js";

describe("bdd runner CLI", () => {
    it("parses --group adapters and --verbose", () => {
        const args = parseCliArgs(["--group", "adapters", "-v"]);
        expect(args.group).toBe("adapters");
        expect(args.verbose).toBe(true);
    });

    it("rejects unknown --group", () => {
        expect(() => parseCliArgs(["--group", "nope"])).toThrow(/--group must be one of/);
    });

    it("lists adapters batches", () => {
        const adapters = batchesFor({ group: "adapters" });
        expect(adapters).toHaveLength(1);
        expect(adapters[0].id).toBe("adapters-internetmarke-errors");
    });

    it("runs publish-gated marks only by batch id", () => {
        const canary = batchesFor({ batchId: "adapters-internetmarke-marks-canary" });
        expect(canary).toHaveLength(1);
        expect(canary[0].publishGated).toBe(true);
        const full = batchesFor({ batchId: "adapters-internetmarke-marks-full" });
        expect(full).toHaveLength(1);
        expect(full[0].publishGated).toBe(true);
        expect(full[0].tags).toContain("@heavy");
        expect(batchesFor().some((batch) => batch.publishGated)).toBe(false);
    });
});

describe("bdd adapters path parity", () => {
    it("resolves adapters features under features/adapters", () => {
        const batch = BDD_BATCHES.find((item) => item.group === "adapters");
        expect(batch).toBeDefined();
        expect(featureTreeForBatch(batch!)).toBe("adapters");
        expect(featurePathForBatch("/root", batch!)).toContain("/features/adapters/");
        expect(cucumberTagsForBatch(batch!)).toBe("@adapters");
    });

    it("keeps sdk features under features/sdk with non-adapters tags", () => {
        const batch = BDD_BATCHES.find((item) => item.id === "cli-core");
        expect(batch).toBeDefined();
        expect(featureTreeForBatch(batch!)).toBe("sdk");
        expect(featurePathForBatch("/root", batch!)).toContain("/features/sdk/");
        expect(cucumberTagsForBatch(batch!)).toBe("@sdk and not @adapters");
    });
});

describe("bdd reporter tokens", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("emits RESULT and summary tokens with NO_COLOR", () => {
        vi.stubEnv("NO_COLOR", "1");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        const reporter = new Reporter();
        reporter.runStart({
            featuresPath: "/features",
            dataPath: "/data",
            scope: "group=cli",
        });
        reporter.printBatchList(BDD_BATCHES);

        const joined = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(joined).toContain("[bdd]");
        expect(joined).toContain("group=cli");
        expect(joined).toContain("adapters-internetmarke-errors");
        expect(joined).toContain("BDD batches (24)");
        expect(joined).toContain("adapters-internetmarke-marks-canary");
        expect(joined).toContain("adapters-internetmarke-marks-full");
        expect(joined).not.toMatch(/\u001b\[/);
    });
});

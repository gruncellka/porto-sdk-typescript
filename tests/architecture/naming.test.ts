import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { providerId, wireId } from "../../src/ids.js";
import { CapabilityState, isReady } from "../../src/states.js";
import { seconds } from "../../src/time.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("type guardrails", () => {
    it("brands provider and wire ids at runtime", () => {
        expect(providerId("DeutschePost")).toBe("deutschepost");
        expect(wireId("Internetmarke")).toBe("internetmarke");
        expect(providerId("deutschepost")).not.toBe(wireId("internetmarke"));
    });

    it("keeps capability states distinct", () => {
        expect(CapabilityState.Absent).toBe("absent");
        expect(CapabilityState.Unsupported).toBe("unsupported");
        expect(isReady(CapabilityState.Ready)).toBe(true);
        expect(isReady(CapabilityState.Unavailable)).toBe(false);
    });

    it("rejects swapping ProviderId for WireId at type-check time", () => {
        const tsc = join(root, "node_modules", ".bin", "tsc");
        if (!existsSync(tsc)) {
            return;
        }
        const output = execFileSync(tsc, ["--noEmit", "-p", "tsconfig.architecture.json"], {
            cwd: root,
            encoding: "utf8",
        });
        expect(output).toBe("");
    });

    it("stores configuration durations as seconds", () => {
        expect(seconds(30)).toBe(30);
        expect(() => seconds(-1)).toThrow(/non-negative/);
    });
});

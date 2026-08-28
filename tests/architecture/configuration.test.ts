import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src");

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const stat = statSync(path);
        if (stat.isDirectory()) walk(path, acc);
        else if (name.endsWith(".ts")) acc.push(path);
    }
    return acc;
}

describe("PortoConfig contract", () => {
    it("uses providers, data, and transport", () => {
        const text = readFileSync(join(SRC, "config.ts"), "utf8");
        expect(text).toContain("providers?");
        expect(text).toMatch(/data\?: string/);
        expect(text).toContain("transport?: TransportConfig");
    });

    it("keeps status map literals out of generic tracking", () => {
        const acl = readFileSync(join(SRC, "adapters", "tracking", "acl.ts"), "utf8");
        expect(acl).not.toContain("TrackingState.CREATED");
        expect(acl).toContain("LAPOSTE_STATUS_MAP");
    });

    it("errors do not import adapters", () => {
        for (const path of walk(join(SRC, "errors"))) {
            const text = readFileSync(path, "utf8");
            expect(text).not.toContain("adapters/deutschepost");
            expect(text).not.toContain("internetmarke");
        }
    });
});

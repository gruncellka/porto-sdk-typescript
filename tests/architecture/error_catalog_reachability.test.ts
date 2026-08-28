import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PortoErrorCode } from "../../src/errors.js";

const sdkRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const srcRoot = join(sdkRoot, "src");

const NON_ERROR_LITERALS = new Set([
    "PORTO_DATA_PATH",
    "PORTO_FEATURES_PATH",
    "PORTO_TIMEOUT",
    "PORTO_PROVIDER",
    "PORTO_RETRIES",
    "PORTO_DATA_VERSION_MIN",
    "PORTO_DATA_VERSION_MAX_EXCLUSIVE",
    "PORTO_DATA_MAPPING",
    "PORTO_DATA_CATALOG_UNRESOLVED",
]);

const LITERAL = /"(PORTO_[A-Z0-9_]+)"/g;
const ERRORISH =
    /^PORTO_(?:[A-Z0-9]+_)+(?:FAILED|DENIED|PENDING|INSUFFICIENT|HEAVY|INVALID|FOUND|AMBIGUOUS|TIMEOUT|LIMITED|UNAVAILABLE|CORRUPTED|OLD|NEW|UNSUPPORTED|CONFIGURED|INCOMPATIBLE)$/;

function walkTs(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            walkTs(p, acc);
        } else if (name.endsWith(".ts") && name !== "codes.ts") {
            acc.push(p);
        }
    }
    return acc;
}

describe("error catalog reachability", () => {
    it("every PortoErrorCode is referenced outside the generated enum", () => {
        const blob = walkTs(srcRoot)
            .map((file) => readFileSync(file, "utf8"))
            .join("\n");
        const missing = Object.values(PortoErrorCode).filter((code) => !blob.includes(code));
        expect(missing).toEqual([]);
    });

    it("no undeclared error-like PORTO_* string literals in src/", () => {
        const catalog = new Set(Object.values(PortoErrorCode));
        const undeclared: string[] = [];
        for (const file of walkTs(srcRoot)) {
            const text = readFileSync(file, "utf8");
            for (const match of text.matchAll(LITERAL)) {
                const token = match[1]!;
                if (catalog.has(token as PortoErrorCode) || NON_ERROR_LITERALS.has(token)) {
                    continue;
                }
                if (ERRORISH.test(token)) {
                    undeclared.push(`${file.slice(sdkRoot.length + 1)}:${token}`);
                }
            }
        }
        expect(undeclared).toEqual([]);
    });
});

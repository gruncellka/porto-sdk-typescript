/** Published SDK source must stay provider-neutral in core and never mention Lab. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src");
const LAB_TOKENS = ["PORTO_LAB_", "lab_http", "lab_status", "lab-http", "labStatus"];
const LAB_WORD = /\blab\b/i;
const PROVIDER_TOKENS = ["internetmarke", "portokasse", "dhl_"];
const CORE_FILES = new Set([
    "client.ts",
    "mark-content.ts",
    "config.ts",
    "provider-client.ts",
    "index.ts",
    "errors.ts",
    "browser.ts",
]);
const CORE_DIRS = new Set(["errors", "services", "transport", "execution", "types"]);

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const stat = statSync(path);
        if (stat.isDirectory()) {
            walk(path, acc);
        } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
            acc.push(path);
        }
    }
    return acc;
}

describe("published SDK has no Lab vocabulary", () => {
    for (const path of walk(SRC)) {
        it(path.replace(`${SRC}/`, ""), () => {
            const text = readFileSync(path, "utf8");
            for (const token of LAB_TOKENS) {
                expect(text, `${path} must not contain ${token}`).not.toContain(token);
            }
            expect(LAB_WORD.test(text), `${path} must not contain the word lab`).toBe(false);
        });
    }
});

describe("core has no provider ACL", () => {
    const files = walk(SRC).filter((path) => {
        const rel = path.slice(SRC.length + 1);
        const top = rel.split("/")[0];
        return CORE_FILES.has(top) || CORE_DIRS.has(top);
    });
    for (const path of files) {
        it(path.replace(`${SRC}/`, ""), () => {
            const text = readFileSync(path, "utf8");
            expect(text).not.toContain("adapters/deutschepost");
            expect(text).not.toContain("adapters.deutschepost");
            const lower = text.toLowerCase();
            for (const token of PROVIDER_TOKENS) {
                expect(lower, `${path} must not contain ${token}`).not.toContain(token);
            }
        });
    }
});

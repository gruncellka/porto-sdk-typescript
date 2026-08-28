/** Ensure generic SDK service layers contain no provider-specific string literals. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src", "services");
const FORBIDDEN = ["deutschepost", "internetmarke", "portokasse", "freigabe", "deutsche post"];

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        const stat = statSync(path);
        if (stat.isDirectory()) {
            out.push(...collectTsFiles(path));
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
            out.push(path);
        }
    }
    return out;
}

describe("generic service layer neutrality", () => {
    for (const path of collectTsFiles(ROOT)) {
        it(path.replace(ROOT, "services"), () => {
            const text = readFileSync(path, "utf8").toLowerCase();
            for (const token of FORBIDDEN) {
                expect(text, `${path} must not reference ${token}`).not.toContain(token);
            }
        });
    }
});

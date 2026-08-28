import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SDK_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const SERVICE_FILES = [
    resolve(SDK_ROOT, "src/services/validation.ts"),
    resolve(SDK_ROOT, "src/services/product-options.ts"),
];

describe("data ownership", () => {
    it("services do not reach for PortoDataLoader", () => {
        for (const filePath of SERVICE_FILES) {
            const contents = readFileSync(filePath, "utf8");
            expect(contents).not.toMatch(/\bPortoDataLoader\b/);
            expect(contents).not.toMatch(/\bdataLoader\b/);
        }
    });
});

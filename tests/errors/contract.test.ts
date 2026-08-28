import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePortoFeaturesRoot } from "../../scripts/lib/resolve-porto-features-root.mjs";
import { PORTO_ERROR_CODES, PortoErrorCode } from "../../src/errors.js";

const modelPath = join(resolvePortoFeaturesRoot(), "errors.json");

describe("error catalog parity", () => {
    it("errors.json codes equal PortoErrorCode values (exact set and order)", () => {
        const model = JSON.parse(readFileSync(modelPath, "utf8")) as {
            codes: Array<{ code: string }>;
        };
        const catalog = model.codes.map((row) => row.code);
        const enumValues = Object.values(PortoErrorCode);
        expect(enumValues).toEqual(catalog);
        expect(PORTO_ERROR_CODES).toEqual(catalog);
    });
});

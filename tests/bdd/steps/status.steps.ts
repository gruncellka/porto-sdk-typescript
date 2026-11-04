import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Then } from "@cucumber/cucumber";
import { expect } from "expect";
import { resolvePortoFeaturesRoot } from "../../../scripts/lib/resolve-porto-features-root.mjs";

Then("{string} should be declared in the PortoStatus catalog", (code: string) => {
    const path = join(resolvePortoFeaturesRoot(), "statuses.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as { codes: Array<{ code: string }> };
    expect(doc.codes.map((row) => row.code)).toContain(code);
});

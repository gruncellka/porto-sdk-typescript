import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePortoFeaturesRoot } from "../lib/resolve-porto-features-root.mjs";

const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const featuresRoot = resolvePortoFeaturesRoot();
const statusesPath = join(featuresRoot, "statuses.json");
const outputPath = join(sdkRoot, "src", "types", "statuses.ts");

if (!existsSync(statusesPath)) {
    console.error(
        "statuses.json not in installed porto-features yet; skipping status binding check",
    );
    process.exit(0);
}

const statusesDoc = JSON.parse(readFileSync(statusesPath, "utf8"));
const rendered = renderStatuses(statusesDoc);

if (process.argv.includes("--check")) {
    const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
    if (existing !== rendered) {
        console.error("TypeScript status bindings out of date — run: make sync-bindings");
        process.exit(1);
    }
    console.log(`OK src/types/statuses.ts matches ${statusesPath}`);
    process.exit(0);
}

writeFileSync(outputPath, rendered, "utf8");
console.log(`Wrote src/types/statuses.ts from ${statusesPath}`);

function renderStatuses(doc) {
    const lines = [
        "// GENERATED from porto_features/statuses.json — do not edit.",
        "// Run: make sync-bindings",
        "",
        "export enum PortoStatus {",
    ];
    for (const row of doc.codes ?? []) {
        lines.push(`    ${String(row.code).toUpperCase()} = "${row.code}",`);
    }
    lines.push("}");
    lines.push("");
    return lines.join("\n");
}

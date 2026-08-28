import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePortoFeaturesRoot } from "../lib/resolve-porto-features-root.mjs";

const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const featuresRoot = resolvePortoFeaturesRoot();
const errorsPath = join(featuresRoot, "errors.json");
const outputPath = join(sdkRoot, "src", "errors", "codes.ts");

if (!existsSync(errorsPath)) {
    console.error(
        `porto-features errors.json not found at ${errorsPath}. ` +
            "Install @gruncellka/porto-features or set PORTO_FEATURES_PATH.",
    );
    process.exit(1);
}

const errorsDoc = JSON.parse(readFileSync(errorsPath, "utf8"));
const rendered = renderErrors(errorsDoc);

if (process.argv.includes("--check")) {
    const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
    if (existing !== rendered) {
        console.error("TypeScript error bindings out of date — run: make sync-error-bindings");
        process.exit(1);
    }
    console.log(`OK src/errors/codes.ts matches ${errorsPath}`);
    process.exit(0);
}

writeFileSync(outputPath, rendered, "utf8");
console.log(`Wrote src/errors/codes.ts from ${errorsPath}`);

function renderErrors(errorsDoc) {
    const lines = [
        "// GENERATED from porto_features/errors.json — do not edit.",
        "// Run: make sync-error-bindings",
        "",
        "export enum PortoErrorCode {",
    ];
    for (const row of errorsDoc.codes ?? []) {
        lines.push(`    ${row.code} = "${row.code}",`);
    }
    lines.push("}");
    lines.push("");
    lines.push("export const PORTO_ERROR_CODES = Object.values(PortoErrorCode);");
    lines.push("");
    return lines.join("\n");
}

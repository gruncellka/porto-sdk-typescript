#!/usr/bin/env node
/**
 * Browser bundle — esbuild with Node builtin → shim (tsup leaves fs/path external).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(__dirname, "..", "..");
const shim = path.join(sdkRoot, "src/shims/node-builtins.ts");
const NODE_BUILTIN = /^(?:node:)?(?:fs|path|url|zlib|crypto|module)$/;

function loadEsbuild() {
    try {
        return require("esbuild");
    } catch {
        // pnpm nested under tsup
        const tsupPkg = require.resolve("tsup/package.json");
        const esbuildFromTsup = path.join(path.dirname(tsupPkg), "node_modules", "esbuild");
        try {
            return require(esbuildFromTsup);
        } catch {
            const pnpm = path.join(sdkRoot, "node_modules/.pnpm");
            const { readdirSync } = require("node:fs");
            const dir = readdirSync(pnpm).find((name) => name.startsWith("esbuild@"));
            if (!dir)
                throw new Error("esbuild not found — run pnpm install in porto-sdk-typescript");
            return require(path.join(pnpm, dir, "node_modules/esbuild"));
        }
    }
}

const esbuild = loadEsbuild();

await esbuild.build({
    entryPoints: [path.join(sdkRoot, "src/browser.ts")],
    outfile: path.join(sdkRoot, "dist/browser.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: true,
    mainFields: ["browser", "module", "main"],
    plugins: [
        {
            name: "porto-node-builtin-shim",
            setup(build) {
                build.onResolve({ filter: NODE_BUILTIN }, () => ({ path: shim }));
            },
        },
    ],
});

const fs = require("node:fs");
const dtsPath = path.join(sdkRoot, "dist/browser.d.ts");
const dtsCtsPath = path.join(sdkRoot, "dist/browser.d.cts");
// tsup dts-only may emit browser.d.cts; package exports expect browser.d.ts
if (fs.existsSync(dtsCtsPath)) {
    fs.copyFileSync(dtsCtsPath, dtsPath);
} else if (!fs.existsSync(dtsPath)) {
    console.error("build-browser: missing dist/browser.d.ts — run tsup first");
    process.exit(1);
}

const out = fs.readFileSync(path.join(sdkRoot, "dist/browser.js"), "utf8");
if (/^import .+ from ['"](?:fs|path|url|zlib|node:)/m.test(out)) {
    console.error("build-browser: still has bare Node builtin imports");
    process.exit(1);
}
console.log("Wrote dist/browser.js (Node builtins shimmed)");

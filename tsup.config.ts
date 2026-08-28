import { defineConfig } from "tsup";

const shared = {
    format: ["esm"] as const,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    outDir: "dist",
    target: "es2022" as const,
};

export default defineConfig([
    {
        ...shared,
        entry: { index: "src/index.ts", cli: "src/cli/index.ts" },
        dts: {
            entry: { index: "src/index.ts" },
            compilerOptions: { stripInternal: true },
        },
        clean: true,
    },
    {
        // Types only — JS comes from scripts/build/build-browser.mjs (Node builtins shimmed).
        entry: { browser: "src/browser.ts" },
        dts: {
            only: true,
            entry: { browser: "src/browser.ts" },
            compilerOptions: { stripInternal: true },
        },
        clean: false,
    },
]);

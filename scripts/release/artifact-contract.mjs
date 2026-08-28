/** Declarative package-content contract for the TypeScript SDK npm tarball. */

export const ARTIFACT_CONTRACT = {
    /** Paths that must exist inside the packed `package/` root. */
    required: [
        "package/package.json",
        "package/dist/index.js",
        "package/dist/index.d.ts",
        "package/dist/browser.js",
        "package/dist/browser.d.ts",
        "package/dist/cli.js",
        "package/LICENSE",
        "package/README.md",
        "package/CHANGELOG.md",
    ],
    /**
     * Allowed path prefixes under the tarball (positive model).
     * Anything outside these prefixes fails.
     */
    allowedPrefixes: [
        "package/package.json",
        "package/dist/",
        "package/LICENSE",
        "package/README.md",
        "package/CHANGELOG.md",
    ],
    /** Universal junk segments under package/ — defense in depth. */
    forbiddenSegments: [
        "node_modules",
        "tests",
        "src",
        "scripts",
        ".github",
        ".cursor",
        "docs",
        "artifacts",
        ".env",
        "labs",
    ],
};

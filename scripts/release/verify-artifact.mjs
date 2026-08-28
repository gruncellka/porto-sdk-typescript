#!/usr/bin/env node
/** Inspect npm pack tarball against ArtifactContract + clean-install smoke. */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACT_CONTRACT } from "./artifact-contract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: opts.cwd ?? ROOT,
        encoding: "utf8",
        stdio: opts.stdio ?? "inherit",
        shell: process.platform === "win32",
    });
    if (r.status !== 0) {
        process.exit(r.status ?? 1);
    }
    return r;
}

function listTarball(tarball) {
    const r = spawnSync("tar", ["-tzf", tarball], {
        cwd: ROOT,
        encoding: "utf8",
    });
    if (r.status !== 0) {
        console.error(r.stderr);
        process.exit(1);
    }
    return r.stdout.split("\n").filter(Boolean);
}

function pathAllowed(name) {
    if (ARTIFACT_CONTRACT.allowedPrefixes.some((p) => name === p || name.startsWith(p))) {
        return true;
    }
    // npm may include package.json only as exact path; also allow trailing dirs
    return false;
}

function checkContract(names) {
    const errors = [];
    for (const req of ARTIFACT_CONTRACT.required) {
        if (!names.includes(req)) {
            errors.push(`missing required ${req}`);
        }
    }
    for (const name of names) {
        if (name.endsWith("/")) continue;
        if (!pathAllowed(name)) {
            errors.push(`unexpected path ${name}`);
        }
        for (const seg of ARTIFACT_CONTRACT.forbiddenSegments) {
            const parts = name.split("/");
            if (parts.includes(seg)) {
                errors.push(`forbidden segment ${seg} in ${name}`);
            }
        }
    }
    return errors;
}

function ensureTarball() {
    // Always pack from the current tree so verify and publish share one artifact build path.
    for (const f of readdirSync(ROOT).filter(
        (name) => name.startsWith("gruncellka-porto-sdk-") && name.endsWith(".tgz"),
    )) {
        rmSync(join(ROOT, f), { force: true });
    }
    run("pnpm", ["pack"]);
    const packed = readdirSync(ROOT)
        .filter((f) => f.startsWith("gruncellka-porto-sdk-") && f.endsWith(".tgz"))
        .sort();
    if (!packed.length) {
        console.error("no tarball produced");
        process.exit(1);
    }
    return join(ROOT, packed[packed.length - 1]);
}

function smokeInstall(tarball) {
    const smoke = join(ROOT, "artifact-smoke-npm");
    rmSync(smoke, { recursive: true, force: true });
    mkdirSync(smoke, { recursive: true });
    run("pnpm", ["init"], { cwd: smoke });
    run("pnpm", ["add", tarball, "typescript@~5.9.3"], { cwd: smoke });

    writeFileSync(
        join(smoke, "consumer.ts"),
        `import { PortoClient, type PortoConfig } from "@gruncellka/porto-sdk";
import { PortoClient as BrowserClient } from "@gruncellka/porto-sdk/browser";
const cfg: PortoConfig = {};
void cfg;
void PortoClient;
void BrowserClient;
console.log("public import OK");
`,
    );
    writeFileSync(
        join(smoke, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                module: "NodeNext",
                moduleResolution: "NodeNext",
                target: "ES2022",
                strict: true,
                noEmit: true,
                skipLibCheck: true,
            },
            files: ["consumer.ts"],
        }),
    );
    run("pnpm", ["exec", "tsc", "--noEmit"], { cwd: smoke });
    run(
        "node",
        [
            "--input-type=module",
            "-e",
            "import { PortoClient } from '@gruncellka/porto-sdk'; console.log(typeof PortoClient);",
        ],
        { cwd: smoke },
    );
    run(
        "node",
        [
            "--input-type=module",
            "-e",
            "import '@gruncellka/porto-sdk/browser'; console.log('browser export OK');",
        ],
        { cwd: smoke },
    );
    const portoBin = join(smoke, "node_modules", ".bin", "porto");
    run(portoBin, ["--help"], { cwd: smoke });
    rmSync(smoke, { recursive: true, force: true });
}

console.log("=== Pack / locate tarball ===");
const tarball = ensureTarball();
console.log(`Tarball: ${tarball}`);

console.log("=== Contract ===");
const names = listTarball(tarball);
const errors = checkContract(names);
if (errors.length) {
    console.error("Artifact contract failed:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
}
console.log("tarball matches ArtifactContract");

console.log("=== Clean-env smoke ===");
smokeInstall(tarball);
console.log(`Tarball kept for CI upload: ${tarball}`);
console.log("Artifact verification passed.");

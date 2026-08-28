#!/usr/bin/env tsx
/** Wrap vitest offline/API runs with Ops-style [integ]/[api] banners + summary.json. */

import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SDK_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const LINE_WIDTH = 88;

type Lane = "integ" | "api";

function useColor(): boolean {
    return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function color(code: string, text: string): string {
    if (!useColor()) {
        return text;
    }
    return `\u001b[${code}m${text}\u001b[0m`;
}

function tag(prefix: string): string {
    return color("36", `[${prefix}]`);
}

function rule(prefix: string, width?: number): string {
    const body = LINE_WIDTH - prefix.length - 3;
    return color("2", "─".repeat(width ?? body));
}

function runStart(prefix: string, fields: Array<[string, string]>): void {
    const title = "run";
    const fill = Math.max(LINE_WIDTH - prefix.length - 3 - title.length - 4, 0);
    console.log();
    console.log(`${tag(prefix)} ${color("33", "┌─")} ${color("1", title)} ${rule(prefix, fill)}`);
    for (const [label, value] of fields) {
        console.log(`${tag(prefix)} ${color("2", "│")} ${color("2", label.padEnd(10))} ${value}`);
    }
    console.log(
        `${tag(prefix)} ${color("33", "└─")}${rule(prefix, Math.max(LINE_WIDTH - prefix.length - 5, 0))}`,
    );
}

function resultLine(prefix: string, ok: boolean, detail: string): void {
    const status = ok ? color("32", "OK") : color("31", "FAILED");
    console.log();
    console.log(
        `${tag(prefix)} ${color("1", "RESULT")}  ${prefix} ${status} ${color("2", detail)}`,
    );
}

function persistSummary(prefix: string, runDir: string, payload: Record<string, unknown>): string {
    mkdirSync(runDir, { recursive: true });
    const summaryPath = join(runDir, "summary.json");
    writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    const latest = join(runDir, "..", "latest");
    try {
        unlinkSync(latest);
    } catch {
        // no previous link
    }
    symlinkSync(runDir, latest);
    console.log(`${tag(prefix)} ${color("2", `report → ${summaryPath}`)}`);
    return summaryPath;
}

function main(argv: string[]): number {
    const lane = argv[0] as Lane | undefined;
    if (lane !== "integ" && lane !== "api") {
        console.error("Usage: tsx scripts/test/run_integ_suite.ts integ|api");
        return 2;
    }

    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "-");
    const runDir = join(SDK_ROOT, "artifacts", "lab", `${stamp}_${lane}`);

    if (lane === "api") {
        console.log("⚠️  Running API tests - this costs money!");
    }

    const vitestArgs =
        lane === "api" ? ["vitest", "run", "--testNamePattern", "api"] : ["vitest", "run"];

    runStart(lane, [
        ["suite", lane],
        ["command", `pnpm exec ${vitestArgs.join(" ")}`],
        ["artifacts", runDir],
    ]);

    const started = performance.now();
    const result = spawnSync("pnpm", ["exec", ...vitestArgs], {
        cwd: SDK_ROOT,
        env: { ...process.env, ARTIFACTS_DIR: runDir },
        stdio: "inherit",
    });
    const durationS = (performance.now() - started) / 1000;
    const exitCode = result.status ?? 1;
    const ok = exitCode === 0;

    resultLine(lane, ok, `exit=${exitCode} time=${durationS.toFixed(1)}s`);
    persistSummary(lane, runDir, {
        lane,
        ok,
        exit_code: exitCode,
        duration_s: durationS,
        finished_at: new Date().toISOString(),
        vitest_args: vitestArgs,
    });
    return exitCode;
}

process.exit(main(process.argv.slice(2)));

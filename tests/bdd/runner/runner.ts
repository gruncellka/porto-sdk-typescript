/** Execute @sdk BDD batches with visible progress and machine-readable summaries. */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePortoDataRoot } from "../../../scripts/lib/resolve-porto-data-root.mjs";
import { resolvePortoFeaturesRoot } from "../../../scripts/lib/resolve-porto-features-root.mjs";
import { BDD_BATCHES, type BddBatch, batchesFor } from "./batches.js";
import { type BatchResult, Reporter, type ScenarioResult } from "./reporter.js";
import {
    batchScopeCounts,
    cucumberTagsForBatch,
    escapeCucumberName,
    featurePathForBatch,
    scenarioSlug,
} from "./scenarios.js";

const SDK_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

let activeProc: ChildProcessWithoutNullStreams | null = null;

interface CucumberStep {
    result?: { status?: string; duration?: number; error_message?: string };
}

interface CucumberElement {
    keyword?: string;
    name?: string;
    steps?: CucumberStep[];
}

interface CucumberFeature {
    elements?: CucumberElement[];
}

function scenarioStatus(steps: CucumberStep[]): {
    status: ScenarioResult["status"];
    message: string | null;
    durationS: number;
} {
    const statuses = steps
        .map((step) => step.result?.status)
        .filter((status): status is string => Boolean(status));
    const durationNs = steps.reduce((sum, step) => sum + (step.result?.duration ?? 0), 0);
    const durationS = durationNs / 1_000_000_000;

    if (statuses.length === 0 || statuses.every((status) => status === "skipped")) {
        return { status: "skipped", message: null, durationS };
    }
    if (statuses.some((status) => status === "failed")) {
        const failedStep = steps.find((step) => step.result?.status === "failed");
        return {
            status: "failed",
            message: failedStep?.result?.error_message ?? null,
            durationS,
        };
    }
    if (statuses.some((status) => status === "undefined" || status === "ambiguous")) {
        const badStep = steps.find(
            (step) => step.result?.status === "undefined" || step.result?.status === "ambiguous",
        );
        return {
            status: "error",
            message: badStep?.result?.error_message ?? null,
            durationS,
        };
    }
    return { status: "passed", message: null, durationS };
}

function parseCucumberJson(path: string): {
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    failedTests: string[];
    scenarios: ScenarioResult[];
} {
    if (!existsSync(path)) {
        return { passed: 0, failed: 0, skipped: 0, errors: 0, failedTests: [], scenarios: [] };
    }

    const data = JSON.parse(readFileSync(path, "utf8")) as CucumberFeature[];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;
    const failedTests: string[] = [];
    const scenarios: ScenarioResult[] = [];

    for (const feature of data) {
        for (const element of feature.elements ?? []) {
            if (element.keyword !== "Scenario" && element.keyword !== "Scenario Outline") {
                continue;
            }

            const name = element.name ?? "?";
            const { status, message, durationS } = scenarioStatus(element.steps ?? []);
            scenarios.push({ name, status, durationS, message });

            if (status === "failed") {
                failed += 1;
                failedTests.push(name);
            } else if (status === "error") {
                errors += 1;
                failedTests.push(name);
            } else if (status === "skipped") {
                skipped += 1;
            } else {
                passed += 1;
            }
        }
    }

    return { passed, failed, skipped, errors, failedTests, scenarios };
}

function defaultEnv(featuresPath: string, dataPath: string): NodeJS.ProcessEnv {
    return {
        ...process.env,
        PORTO_FEATURES_PATH: process.env.PORTO_FEATURES_PATH ?? featuresPath,
        PORTO_DATA_PATH: process.env.PORTO_DATA_PATH ?? dataPath,
        NODE_OPTIONS: "--import tsx",
    };
}

function terminateProcess(proc: ChildProcessWithoutNullStreams): void {
    if (proc.exitCode !== null) {
        return;
    }
    proc.kill("SIGTERM");
    setTimeout(() => {
        if (proc.exitCode === null) {
            proc.kill("SIGKILL");
        }
    }, 5000).unref();
}

function buildCucumberArgs(
    batch: BddBatch,
    featuresRoot: string,
    reportPath: string,
    scenarioName: string,
): string[] {
    return [
        "cucumber-js",
        featurePathForBatch(featuresRoot, batch),
        "--tags",
        cucumberTagsForBatch(batch),
        "--import",
        "tests/bdd/steps/index.ts",
        "--format",
        `json:${reportPath}`,
        "--name",
        `^${escapeCucumberName(scenarioName)}$`,
    ];
}

async function runSingleScenario(
    batch: BddBatch,
    scenarioName: string,
    options: {
        env: NodeJS.ProcessEnv;
        featuresRoot: string;
        runDir: string;
        reporter: Reporter;
        verbose: boolean;
    },
): Promise<{
    counts: ReturnType<typeof parseCucumberJson>;
    exitCode: number;
    interrupted: boolean;
}> {
    const slug = scenarioSlug(scenarioName);
    const reportPath = join(options.runDir, `${batch.id}--${slug}.json`);
    const args = buildCucumberArgs(batch, options.featuresRoot, reportPath, scenarioName);

    const proc = spawn("npx", args, {
        cwd: SDK_ROOT,
        env: options.env,
        stdio: ["ignore", options.verbose ? "pipe" : "ignore", "pipe"],
    });
    activeProc = proc;

    let interrupted = false;
    let exitCode = 0;

    const onSigint = () => {
        interrupted = true;
        terminateProcess(proc);
    };
    process.once("SIGINT", onSigint);

    try {
        if (options.verbose) {
            proc.stdout?.on("data", (chunk: Buffer) => {
                process.stdout.write(chunk);
            });
        }
        proc.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            const noisy =
                text.includes("Unknown env config") ||
                text.includes("not been tested with this version of Cucumber");
            if (options.verbose || !noisy) {
                process.stderr.write(chunk);
            }
        });

        exitCode = await new Promise<number>((resolve, reject) => {
            proc.on("error", reject);
            proc.on("close", (code) => resolve(code ?? 1));
        });
    } catch (error) {
        if (!interrupted) {
            throw error;
        }
        exitCode = 130;
    } finally {
        process.off("SIGINT", onSigint);
        activeProc = null;
    }

    const counts = parseCucumberJson(reportPath);
    const scenario = counts.scenarios[0];
    if (scenario) {
        options.reporter.scenarioLine(scenario);
    } else if (interrupted) {
        options.reporter.scenarioLine({ name: scenarioName, status: "skipped" });
    } else {
        options.reporter.scenarioLine({
            name: scenarioName,
            status: "error",
            message: "no cucumber report",
        });
    }

    return { counts, exitCode, interrupted };
}

async function runBatch(
    batch: BddBatch,
    options: {
        env: NodeJS.ProcessEnv;
        featuresRoot: string;
        runDir: string;
        reporter: Reporter;
        verbose: boolean;
    },
): Promise<BatchResult> {
    mkdirSync(options.runDir, { recursive: true });
    const scope = batchScopeCounts(batch, options.featuresRoot);
    const scenarioNames = scope.selected;
    const started = performance.now();

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;
    const failedTests: string[] = [];
    const scenarios: ScenarioResult[] = [];
    let exitCode = 0;
    let interrupted = false;

    for (const scenarioName of scenarioNames) {
        const result = await runSingleScenario(batch, scenarioName, {
            env: options.env,
            featuresRoot: options.featuresRoot,
            runDir: options.runDir,
            reporter: options.reporter,
            verbose: options.verbose,
        });
        passed += result.counts.passed;
        failed += result.counts.failed;
        skipped += result.counts.skipped;
        errors += result.counts.errors;
        failedTests.push(...result.counts.failedTests);
        scenarios.push(...result.counts.scenarios);

        if (result.interrupted) {
            interrupted = true;
            exitCode = 130;
            break;
        }
        if (result.exitCode !== 0) {
            exitCode = result.exitCode;
        }
    }

    if (batch.publishGated && (passed === 0 || skipped > 0 || failed > 0 || errors > 0)) {
        exitCode = exitCode || 1;
    }

    const durationS = (performance.now() - started) / 1000;
    const aggregateReport = join(options.runDir, `${batch.id}.json`);
    writeFileSync(
        aggregateReport,
        `${JSON.stringify(
            [
                {
                    elements: scenarios.map((scenario) => ({
                        keyword: "Scenario",
                        name: scenario.name,
                        steps: [],
                    })),
                },
            ],
            null,
            2,
        )}\n`,
    );

    return {
        batchId: batch.id,
        label: batch.label,
        passed,
        failed,
        skipped,
        errors,
        durationS,
        exitCode: interrupted ? 130 : exitCode,
        failedTests,
        scenarios,
        reportPath: aggregateReport,
        interrupted,
        inScope: scope.inScope,
        deselected: scope.deselected,
    };
}

function stampRunDir(): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "-");
    return join(SDK_ROOT, "artifacts", "bdd", stamp);
}

function scopeLabel(
    selected: BddBatch[],
    options: { batchId?: string; group?: BddBatch["group"] },
): string {
    if (options.batchId) {
        return `batch=${options.batchId}`;
    }
    if (options.group) {
        return `group=${options.group}`;
    }
    if (selected.length === 1) {
        return `batch=${selected[0].id}`;
    }
    const groups = new Set(selected.map((batch) => batch.group));
    if (groups.size === 1) {
        return `group=${[...groups][0]}`;
    }
    return "all";
}

export async function runBatches(
    selected: BddBatch[],
    options: {
        featuresPath?: string;
        dataPath?: string;
        runDir?: string;
        verbose?: boolean;
        scope?: string;
    } = {},
): Promise<number> {
    const featuresRoot = options.featuresPath ?? resolvePortoFeaturesRoot();
    const dataPath =
        options.dataPath ??
        resolvePortoDataRoot({
            marker: "metadata.json",
            label: "bdd-runner",
        });
    const runDir = options.runDir ?? stampRunDir();
    const env = defaultEnv(featuresRoot, dataPath);
    const reporter = new Reporter();

    reporter.runStart({
        featuresPath: featuresRoot,
        dataPath,
        scope: options.scope ?? "all",
    });

    const results: BatchResult[] = [];
    let interrupted = false;
    let interruptedLabel: string | null = null;

    for (const [index, batch] of selected.entries()) {
        reporter.batchStart(index + 1, selected.length, batch.label, batch.id);
        const result = await runBatch(batch, {
            env,
            featuresRoot,
            runDir,
            reporter,
            verbose: options.verbose ?? false,
        });
        reporter.batchClose(result);
        results.push(result);

        if (result.interrupted) {
            interrupted = true;
            interruptedLabel = batch.label;
            break;
        }
    }

    const pending = interrupted ? selected.length - results.length : 0;
    return reporter.writeSummary(results, runDir, {
        interrupted,
        pendingBatches: pending,
        interruptedLabel,
    });
}

export function printBatchList(): void {
    new Reporter().printBatchList(BDD_BATCHES);
}

const BDD_GROUPS = ["cli", "core", "provider", "adapters"] as const;
type CliGroup = (typeof BDD_GROUPS)[number];

export function parseCliArgs(argv: string[]): {
    group?: CliGroup;
    batch?: string;
    list: boolean;
    verbose: boolean;
    featuresPath?: string;
    dataPath?: string;
} {
    const parsed = {
        list: false,
        verbose: false,
    } as ReturnType<typeof parseCliArgs>;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--list") {
            parsed.list = true;
        } else if (arg === "--verbose" || arg === "-v") {
            parsed.verbose = true;
        } else if (arg === "--group") {
            const group = argv[++index];
            if (!group || !(BDD_GROUPS as readonly string[]).includes(group)) {
                throw new Error(`--group must be one of: ${BDD_GROUPS.join(", ")}`);
            }
            parsed.group = group as CliGroup;
        } else if (arg === "--batch") {
            parsed.batch = argv[++index];
        } else if (arg === "--features-path") {
            parsed.featuresPath = argv[++index];
        } else if (arg === "--data-path") {
            parsed.dataPath = argv[++index];
        } else if (arg === "--help" || arg === "-h") {
            console.log(
                "Usage: tsx scripts/test/run_bdd_batches.ts [--group cli|core|provider|adapters] [--batch id] [--list] [-v]",
            );
            process.exit(0);
        }
    }

    return parsed;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    const args = parseCliArgs(argv);

    if (args.list) {
        printBatchList();
        return 0;
    }

    const selected = batchesFor({ batchId: args.batch, group: args.group });
    return runBatches(selected, {
        featuresPath: args.featuresPath,
        dataPath: args.dataPath,
        verbose: args.verbose,
        scope: scopeLabel(selected, { batchId: args.batch, group: args.group }),
    });
}

process.on("SIGINT", () => {
    if (activeProc && activeProc.exitCode === null) {
        terminateProcess(activeProc);
    }
});

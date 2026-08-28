import type { BddBatch } from "./batches.js";

import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PREFIX = "bdd";
const LINE_WIDTH = 88;

export interface ScenarioResult {
    name: string;
    status: "passed" | "failed" | "skipped" | "error";
    durationS?: number;
    message?: string | null;
}

export interface BatchResult {
    batchId: string;
    label: string;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    durationS: number;
    exitCode: number;
    failedTests: string[];
    scenarios: ScenarioResult[];
    reportPath: string | null;
    interrupted: boolean;
    inScope: number;
    deselected: number;
}

export function batchTotal(result: BatchResult): number {
    return result.passed + result.failed + result.skipped + result.errors;
}

export function batchOk(result: BatchResult): boolean {
    return (
        !result.interrupted && result.exitCode === 0 && result.failed === 0 && result.errors === 0
    );
}

export class Reporter {
    private readonly useColor: boolean;
    private liveNames = new Set<string>();

    constructor() {
        this.useColor = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
    }

    private c(code: string, text: string): string {
        if (!this.useColor) {
            return text;
        }
        return `\u001b[${code}m${text}\u001b[0m`;
    }

    bold(text: string): string {
        return this.c("1", text);
    }

    green(text: string): string {
        return this.c("32", text);
    }

    red(text: string): string {
        return this.c("31", text);
    }

    yellow(text: string): string {
        return this.c("33", text);
    }

    cyan(text: string): string {
        return this.c("36", text);
    }

    dim(text: string): string {
        return this.c("2", text);
    }

    private tag(): string {
        return this.cyan(`[${PREFIX}]`);
    }

    private bodyWidth(): number {
        return LINE_WIDTH - PREFIX.length - 3;
    }

    private rule(width?: number): string {
        return this.dim("─".repeat(width ?? this.bodyWidth()));
    }

    hr(): void {
        console.log(`${this.tag()} ${this.rule()}`);
    }

    header(title: string): void {
        console.log();
        this.hr();
        console.log(`${this.tag()} ${this.bold(title)}`);
        this.hr();
    }

    meta(label: string, value: string): void {
        console.log(`${this.tag()} ${this.dim(`${label}:`)} ${value}`);
    }

    runStart(options: { featuresPath: string; dataPath: string; scope: string }): void {
        const title = "run";
        const fill = Math.max(this.bodyWidth() - title.length - 4, 0);
        console.log();
        console.log(`${this.tag()} ${this.yellow("┌─")} ${this.bold(title)} ${this.rule(fill)}`);
        console.log(
            `${this.tag()} ${this.dim("│")} ${this.dim("features".padEnd(10))} ${options.featuresPath}`,
        );
        console.log(
            `${this.tag()} ${this.dim("│")} ${this.dim("data".padEnd(10))} ${options.dataPath}`,
        );
        console.log(
            `${this.tag()} ${this.dim("│")} ${this.dim("scope".padEnd(10))} ${options.scope}`,
        );
        console.log(
            `${this.tag()} ${this.yellow("└─")}${this.rule(Math.max(this.bodyWidth() - 2, 0))}`,
        );
    }

    batchStart(index: number, total: number, label: string, batchId: string): void {
        this.liveNames = new Set();
        console.log();
        const title = `[${index}/${total}] ${label}  (${batchId})`;
        const fill = Math.max(this.bodyWidth() - title.length - 4, 0);
        console.log(`${this.tag()} ${this.yellow("┌─")} ${this.bold(title)} ${this.rule(fill)}`);
    }

    printBatchList(batches: readonly BddBatch[]): void {
        const total = batches.length;
        const idWidth = Math.max(...batches.map((batch) => batch.id.length));
        const groups: BddBatch["group"][] = ["cli", "core", "provider", "adapters"];

        this.header(`BDD batches (${total})`);
        this.meta("run sdk", "make sdk");
        this.meta("run adapters", "make adapters");
        console.log(`${this.tag()} ${this.dim("│")}`);

        let index = 0;
        for (const group of groups) {
            const groupBatches = batches.filter((batch) => batch.group === group);
            if (groupBatches.length === 0) {
                continue;
            }

            const batchLabel = groupBatches.length === 1 ? "batch" : "batches";
            console.log(
                `${this.tag()} ${this.cyan(group)} ${this.dim(`(${groupBatches.length} ${batchLabel})`)}`,
            );

            for (const batch of groupBatches) {
                index += 1;
                console.log(
                    `${this.tag()} ${this.dim("│")}  ${this.dim(`${String(index).padStart(2)}.`)}  ${this.bold(batch.id.padEnd(idWidth))}  ${batch.label}`,
                );
                const detailParts: string[] = [];
                if (batch.featureGlob) {
                    detailParts.push(batch.featureGlob);
                }
                if (batch.namePattern) {
                    detailParts.push(`--name ${batch.namePattern}`);
                }
                if (detailParts.length > 0) {
                    console.log(
                        `${this.tag()} ${this.dim("│")}      ${this.dim(detailParts.join(" · "))}`,
                    );
                }
            }

            console.log(`${this.tag()} ${this.dim("│")}`);
        }

        this.hr();
    }

    batchClose(result: BatchResult): void {
        let outcome: string;
        if (result.interrupted) {
            outcome = this.yellow("INTERRUPTED");
        } else if (batchOk(result)) {
            outcome = this.green("OK");
        } else {
            outcome = this.red("FAIL");
        }
        const failures = result.failed + result.errors;
        const ran =
            result.inScope > 0
                ? `${batchTotal(result)}/${result.inScope}`
                : String(batchTotal(result));
        const parts = [
            `${this.dim("summary")} ${this.dim("batch=")}${outcome}`,
            `${this.dim("ran=")}${this.bold(ran)}`,
        ];
        if (result.deselected > 0) {
            parts.push(`${this.dim("deselected=")}${this.yellow(String(result.deselected))}`);
        }
        parts.push(
            `${this.dim("failures=")}${failures === 0 ? this.green("0") : this.red(String(failures))}`,
        );
        console.log(`${this.tag()} ${this.yellow("└─")} ${parts.join("  ")}`);
    }

    statusBadge(status: ScenarioResult["status"]): string {
        if (status === "passed") {
            return this.green("[OK]");
        }
        if (status === "skipped") {
            return this.yellow("[SKIP]");
        }
        if (status === "error") {
            return this.red("[ERR]");
        }
        return this.red("[FAIL]");
    }

    scenarioLine(scenario: ScenarioResult): void {
        const timing =
            scenario.durationS && scenario.durationS > 0
                ? this.dim(` (${scenario.durationS.toFixed(2)}s)`)
                : "";
        console.log(
            `${this.tag()} ${this.dim("│")}  ${this.statusBadge(scenario.status)}  ${scenario.name}${timing}`,
        );
        if (scenario.message && (scenario.status === "failed" || scenario.status === "error")) {
            for (const line of scenario.message.split("\n").slice(0, 4)) {
                const stripped = line.trim();
                if (stripped) {
                    console.log(`${this.tag()} ${this.dim("│")}     ${this.dim(stripped)}`);
                }
            }
        }
        this.liveNames.add(scenario.name);
    }

    printBatchScenarios(result: BatchResult): void {
        for (const scenario of result.scenarios) {
            if (this.liveNames.has(scenario.name)) {
                if (
                    scenario.message &&
                    (scenario.status === "failed" || scenario.status === "error")
                ) {
                    for (const line of scenario.message.split("\n").slice(0, 4)) {
                        const stripped = line.trim();
                        if (stripped) {
                            console.log(`${this.tag()} ${this.dim("│")}     ${this.dim(stripped)}`);
                        }
                    }
                }
                continue;
            }
            this.scenarioLine(scenario);
        }
    }

    batchProgress(line: string): void {
        const stripped = line.trimEnd();
        if (!stripped) {
            return;
        }
        if (/\bFAILED\b/.test(stripped) || stripped.startsWith("✖")) {
            console.log(`${this.tag()} ${this.dim("│")}  ${this.red(stripped)}`);
        }
    }

    private summaryBatchLine(result: BatchResult, labelWidth: number): void {
        let badge: string;
        let outcome: string;
        if (result.interrupted) {
            badge = this.yellow("[…]");
            outcome = this.yellow("INTERRUPTED");
        } else if (batchOk(result)) {
            badge = this.green("[OK]");
            outcome = this.green("OK");
        } else {
            badge = this.red("[FAIL]");
            outcome = this.red("FAIL");
        }
        const counts =
            result.inScope > 0
                ? `${batchTotal(result)}/${result.inScope}`
                : batchTotal(result) > 0
                  ? String(batchTotal(result))
                  : "—";
        const deselected =
            result.deselected > 0
                ? `  ${this.dim("deselected=")}${this.yellow(String(result.deselected))}`
                : "";
        console.log(
            `${this.tag()} ${this.dim("│")}  ${badge}  ` +
                `${result.label.padEnd(labelWidth)}  ` +
                `${this.dim("ran=")}${counts}${deselected}  ` +
                `${this.dim("time=")}${result.durationS.toFixed(1).padStart(5)}s  ` +
                `${outcome}`,
        );
    }

    writeSummary(
        results: BatchResult[],
        runDir: string,
        options: {
            interrupted?: boolean;
            pendingBatches?: number;
            interruptedLabel?: string | null;
        } = {},
    ): number {
        const interrupted = options.interrupted ?? false;
        const pendingBatches = options.pendingBatches ?? 0;
        const interruptedLabel = options.interruptedLabel ?? null;

        const totalPassed = results.reduce((sum, result) => sum + result.passed, 0);
        const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
        const totalErrors = results.reduce((sum, result) => sum + result.errors, 0);
        const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
        const totalTests = results.reduce((sum, result) => sum + batchTotal(result), 0);
        const failedBatches = results.filter((result) => !batchOk(result) && !result.interrupted);
        const passedBatches = results.filter((result) => batchOk(result)).length;
        const totalDuration = results.reduce((sum, result) => sum + result.durationS, 0);

        console.log();
        this.hr();
        const title = "total";
        const fill = Math.max(this.bodyWidth() - title.length - 4, 0);
        console.log(`${this.tag()} ${this.yellow("┌─")} ${this.bold(title)} ${this.rule(fill)}`);
        console.log(
            `${this.tag()} ${this.dim("│")}   ` +
                `${this.dim("summary batches=")}${this.bold(String(results.length))}  ` +
                `${this.dim("scenarios=")}${this.bold(String(totalTests))}  ` +
                `${this.dim("passed=")}${totalPassed > 0 ? this.green(String(totalPassed)) : this.bold("0")}  ` +
                `${this.dim("failed=")}${totalFailed === 0 ? this.green("0") : this.red(String(totalFailed))}  ` +
                `${this.dim("errors=")}${totalErrors === 0 ? this.green("0") : this.red(String(totalErrors))}  ` +
                `${this.dim("time=")}${totalDuration.toFixed(1)}s`,
        );
        if (pendingBatches > 0) {
            console.log(
                `${this.tag()} ${this.dim("│")}   ${this.yellow(`${pendingBatches} batch(es) not started`)}`,
            );
        }
        console.log(`${this.tag()} ${this.dim("│")}`);

        const labelWidth =
            results.length > 0 ? Math.max(...results.map((result) => result.label.length)) : 10;
        let currentGroup: string | null = null;
        for (const result of results) {
            const group = result.batchId.split("-", 1)[0];
            if (group !== currentGroup) {
                currentGroup = group;
                console.log(`${this.tag()} ${this.dim("│")}  ${this.cyan(group)}`);
            }
            this.summaryBatchLine(result, labelWidth);
        }

        console.log(`${this.tag()} ${this.yellow("└─")}`);
        this.hr();

        if (failedBatches.length > 0) {
            console.log();
            console.log(`${this.tag()} ${this.red(this.bold("Failed scenarios"))}`);
            for (const batch of failedBatches) {
                console.log(
                    `${this.tag()}   ${this.red(batch.label)} ${this.dim(`(${batch.batchId})`)}`,
                );
                for (const name of batch.failedTests) {
                    console.log(`${this.tag()}     • ${name}`);
                }
                if (batch.failedTests.length === 0) {
                    console.log(`${this.tag()}     • see ${batch.reportPath ?? "cucumber output"}`);
                }
            }
        }

        const summary = {
            passed_batches: passedBatches,
            failed_batches: failedBatches.length,
            interrupted,
            pending_batches: pendingBatches,
            interrupted_label: interruptedLabel,
            duration_s: totalDuration,
            tests: {
                total: totalTests,
                passed: totalPassed,
                failed: totalFailed,
                errors: totalErrors,
                skipped: totalSkipped,
            },
            batches: results.map((result) => ({
                batch_id: result.batchId,
                label: result.label,
                passed: result.passed,
                failed: result.failed,
                skipped: result.skipped,
                errors: result.errors,
                duration_s: result.durationS,
                exit_code: result.exitCode,
                failed_tests: result.failedTests,
                scenarios: result.scenarios,
                report_path: result.reportPath,
                interrupted: result.interrupted,
                in_scope: result.inScope,
                deselected: result.deselected,
            })),
        };

        mkdirSync(runDir, { recursive: true });
        const summaryPath = join(runDir, "summary.json");
        writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

        const latest = join(runDir, "..", "latest");
        try {
            unlinkSync(latest);
        } catch {
            // No previous latest link.
        }
        symlinkSync(runDir, latest);

        console.log();
        if (interrupted) {
            const where = interruptedLabel ?? "current batch";
            console.log(
                `${this.tag()} ${this.bold("RESULT")}  ${PREFIX} ${this.yellow("INTERRUPTED")} ${this.dim(`during ${where}`)}`,
            );
            console.log(`${this.tag()} ${this.dim(`partial report → ${summaryPath}`)}`);
            return 130;
        }

        if (failedBatches.length > 0) {
            console.log(
                `${this.tag()} ${this.bold("RESULT")}  ${PREFIX} ${this.red("FAILED")} ${this.dim(`${failedBatches.length} batch(es), ${totalFailed + totalErrors} scenario(s)`)}`,
            );
            console.log(`${this.tag()} ${this.dim(`report → ${summaryPath}`)}`);
            return 1;
        }

        console.log(
            `${this.tag()} ${this.bold("RESULT")}  ${PREFIX} ${this.green("OK")} ${this.dim(`${passedBatches} batches, ${totalPassed} scenarios`)}`,
        );
        console.log(`${this.tag()} ${this.dim(`report → ${summaryPath}`)}`);
        return 0;
    }
}

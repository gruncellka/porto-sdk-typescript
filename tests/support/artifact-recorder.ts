/**
 * Artifact Recorder for API Tests
 * Records test inputs, outputs, and responses for debugging and compliance
 */

import {
    existsSync,
    mkdirSync,
    readFileSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export interface ArtifactRecorderConfig {
    runDir: string;
    testId: string;
}

export class ArtifactRecorder {
    private runDir: string;
    private testId: string;
    private requestData: Record<string, unknown> = {};
    private responseData: Record<string, unknown> = {};

    constructor(config: ArtifactRecorderConfig) {
        this.runDir = config.runDir;
        this.testId = config.testId;
        this.ensureDirs();
    }

    private ensureDirs(): void {
        const subdirs = ["requests", "responses", "stamps", "errors"];
        for (const subdir of subdirs) {
            const dir = join(this.runDir, subdir);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }
    }

    recordSdkInput(data: Record<string, unknown>): void {
        this.requestData.sdk_input = data;
    }

    recordPreCalculation(zone: string, price: number, productCode: string): void {
        this.requestData.pre_calculated = {
            zone,
            price_cents: price,
            product_code: productCode,
        };
    }

    recordApiRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
    ): void {
        const safeHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers)) {
            safeHeaders[k] =
                k.toLowerCase().includes("auth") || k.toLowerCase().includes("token")
                    ? "[REDACTED]"
                    : v;
        }
        this.requestData.api_request = {
            url,
            method,
            headers: safeHeaders,
            body,
        };
    }

    recordApiResponse(
        status: number,
        headers: Record<string, string>,
        body: unknown,
        durationMs: number,
    ): void {
        this.responseData = {
            test_id: this.testId,
            timestamp: new Date().toISOString(),
            duration: durationMs / 1000,
            http: { status_code: status, headers },
            api_response: body,
        };
    }

    recordValidation(expected: number, actual: number): void {
        this.responseData.validation = {
            price_match: expected === actual,
            expected_price: expected,
            actual_price: actual,
            difference: actual - expected,
        };
    }

    recordError(errorType: string, message: string, details?: Record<string, unknown>): void {
        const errorData = {
            test_id: this.testId,
            timestamp: new Date().toISOString(),
            error_type: errorType,
            message,
            details: details || {},
        };
        const errorFile = join(this.runDir, "errors", `${this.testId}.json`);
        writeFileSync(errorFile, JSON.stringify(errorData, null, 2));
    }

    save(): void {
        if (
            Object.keys(this.requestData).length === 0 &&
            Object.keys(this.responseData).length === 0
        ) {
            return;
        }

        this.requestData.test_id = this.testId;
        this.requestData.timestamp = new Date().toISOString();

        const reqFile = join(this.runDir, "requests", `${this.testId}.json`);
        writeFileSync(reqFile, JSON.stringify(this.requestData, null, 2));

        if (Object.keys(this.responseData).length > 0) {
            const respFile = join(this.runDir, "responses", `${this.testId}.json`);
            writeFileSync(respFile, JSON.stringify(this.responseData, null, 2));
        }
    }
}

export function getArtifactsDir(): string {
    if (process.env.ARTIFACTS_DIR) {
        return process.env.ARTIFACTS_DIR;
    }
    return join(__dirname, "..", "..", "artifacts");
}

export function createRunDir(): string {
    const baseDir = getArtifactsDir();
    const timestamp = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z`;
    const env = process.env.CI ? "ci" : "local";
    const runId = `${timestamp}_${env}`;

    const runDir = join(baseDir, runId);
    mkdirSync(runDir, { recursive: true });

    // Create symlink to latest
    const latestLink = join(baseDir, "latest");
    try {
        if (existsSync(latestLink)) {
            unlinkSync(latestLink);
        }
        symlinkSync(runId, latestLink);
    } catch {
        // Symlinks may not work on all systems
    }

    // Write run metadata
    const metadata = {
        run_id: runId,
        timestamp: new Date().toISOString(),
        environment: env,
        cwd,
    };
    writeFileSync(join(runDir, "metadata.json"), JSON.stringify(metadata, null, 2));

    return runDir;
}

function getPortoFeaturesRoot(): string {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@gruncellka/porto-features");
    const packageRoot = dirname(entry);
    // Published package layout: content lives under porto_features/ next to package entry.
    const nested = join(packageRoot, "porto_features");
    if (existsSync(join(nested, "fixtures")) || existsSync(join(nested, "features"))) {
        return nested;
    }
    return packageRoot;
}

export function loadFixture(fixturePath: string): Record<string, unknown> {
    const root = getPortoFeaturesRoot();
    const fullPath = join(root, "fixtures", fixturePath);
    const content = readFileSync(fullPath, "utf-8");
    return JSON.parse(content);
}

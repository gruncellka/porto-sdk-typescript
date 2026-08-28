import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ExecutionBinding } from "../../src/services/execution-binding.js";
import { PortoResolver } from "../../src/services/porto-resolver.js";

const sdkRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const servicesDir = join(sdkRoot, "src", "services");

function walkTs(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name.endsWith(".test.ts")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name === "resolution") continue;
            walkTs(p, acc);
        } else if (name.endsWith(".ts")) {
            acc.push(p);
        }
    }
    return acc;
}

function walkAllTs(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            walkAllTs(p, acc);
        } else if (name.endsWith(".ts")) {
            acc.push(p);
        }
    }
    return acc;
}

describe("architecture boundaries", () => {
    it("PortoResolver does not patch service tariffs", () => {
        const src = readFileSync(join(servicesDir, "porto-resolver.ts"), "utf8");
        expect(src).not.toContain("einschreiben");
        expect(src).not.toContain("+105");
    });

    it("PortoResolver does not resolve wire codes", () => {
        const src = readFileSync(join(servicesDir, "porto-resolver.ts"), "utf8");
        expect(src).not.toContain("resolveWireCode(");
        expect(
            typeof (PortoResolver.prototype as { resolveWireCode?: unknown }).resolveWireCode,
        ).toBe("undefined");
    });

    it("ExecutionBinding does not import ProductResolver", () => {
        const src = readFileSync(join(servicesDir, "execution-binding.ts"), "utf8");
        expect(src).not.toContain("ProductResolver");
        expect(src).not.toContain("PriceResolver");
    });

    it("execute does not re-resolve", () => {
        const src = readFileSync(join(servicesDir, "porto-execution.ts"), "utf8");
        const postStart = src.indexOf("async execute(");
        const postEnd = src.indexOf("async bytes(", postStart);
        const postBody = src.slice(postStart, postEnd);
        expect(postBody).not.toContain("await this.resolve(");
        expect(postBody).toContain("prepared.resolvedProduct");
    });

    it("non-decision services do not call loader product/price helpers", () => {
        const allowed = new Set([
            "porto-resolver.ts",
            "product-options.ts",
            "porto-execution.ts",
            "execution-binding.ts",
        ]);
        const forbidden = ["getPriceByProductZoneWeightTier", "getAllProducts"];
        const violations: string[] = [];
        for (const file of walkTs(servicesDir)) {
            const base = file.split("/").pop()!;
            if (allowed.has(base)) continue;
            if (base === "mark-resolution.ts" || base === "wire-resolution.ts") continue;
            const src = readFileSync(file, "utf8");
            for (const name of forbidden) {
                if (src.includes(`dataLoader.${name}(`) || src.includes(`loader.${name}(`)) {
                    violations.push(`${base}:${name}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it("ExecutionBinding owns wire resolution", () => {
        expect(typeof ExecutionBinding.prototype.resolveWireCode).toBe("function");
    });

    it("adapters do not construct PortoMark directly", () => {
        const adaptersDir = join(sdkRoot, "src", "adapters");
        const violations: string[] = [];
        for (const file of walkTs(adaptersDir)) {
            const src = readFileSync(file, "utf8");
            if (src.includes("makePortoMarkId")) {
                violations.push(`${file}:makePortoMarkId`);
            }
            if (/id:\s*`\$\{provider\}:/.test(src) || /id:\s*makePortoMarkId/.test(src)) {
                violations.push(`${file}:composite-id`);
            }
            if (/:\s*PortoMark\s*=\s*\{/.test(src) || /as PortoMark/.test(src)) {
                violations.push(`${file}:literal-PortoMark`);
            }
        }
        expect(violations).toEqual([]);
    });

    it("root barrel exports public client surface", () => {
        const index = readFileSync(join(sdkRoot, "src", "index.ts"), "utf8");
        expect(index).toContain("export { PortoClient }");
        expect(index).toContain("export { ProviderClient }");
        expect(index).toContain("EnvelopeIdentity");
        expect(index).toContain("Envelopes");
        expect(index).toContain("Envelope");
        expect(index).toContain("Restrictions");
        expect(index).toContain("LegalRestriction");
        expect(index).toContain("RoutingRestriction");
        expect(index).toContain("RestrictionImpact");
        expect(index).toContain("PortoMarkRequest");
        expect(index).toContain("Balance");
        for (const leak of [
            "loadInternetmarkeConfig",
            "getDefaultWireId",
            "fetchMarkBytes",
            "PortoResolver",
            "PortoExecution",
        ]) {
            expect(index).not.toContain(leak);
        }
    });

    it("tests do not bypass via private _resolver except allowlist", () => {
        const allowlist = new Set([
            "client/clear_cache.test.ts",
            "resolution/service_options.test.ts",
            "resolution/quote.test.ts",
            "resolution/product_advice.test.ts",
            "adapters/ukrposhta_quote_currency.test.ts",
        ]);
        const testsRoot = join(sdkRoot, "tests");
        const violations: string[] = [];
        for (const file of walkAllTs(testsRoot)) {
            const rel = file.slice(testsRoot.length + 1).replaceAll("\\", "/");
            if (allowlist.has(rel) || rel.startsWith("architecture/")) continue;
            const src = readFileSync(file, "utf8");
            if (src.includes("._resolver")) {
                violations.push(rel);
            }
        }
        expect(violations).toEqual([]);
    });

    it("generic SDK has no commerce vocabulary (adapters may use provider cart/checkout)", () => {
        const coreRoots = [
            join(sdkRoot, "src", "execution"),
            join(sdkRoot, "src", "services"),
            join(sdkRoot, "src", "provider-client.ts"),
            join(sdkRoot, "src", "index.ts"),
            join(sdkRoot, "src", "client.ts"),
            join(sdkRoot, "src", "adapters", "protocols"),
            join(sdkRoot, "src", "errors"),
            join(sdkRoot, "src", "mark-content.ts"),
        ];
        for (const root of coreRoots) {
            if (!existsSync(root)) continue;
            const files = root.endsWith(".ts") ? [root] : walkAllTs(root);
            for (const file of files) {
                const src = readFileSync(file, "utf8");
                expect(src, file).not.toMatch(/shoppingcart/i);
                expect(src, file).not.toMatch(/shopping_cart/i);
                expect(src, file).not.toMatch(/\bcart\b/i);
                expect(src, file).not.toMatch(/\bcheckout\b/i);
                expect(src, file).not.toMatch(/\bpurchase\b/i);
                expect(src, file).not.toMatch(/\borderId\b/);
                expect(src, file).not.toMatch(/\border_id\b/);
            }
        }
    });
});

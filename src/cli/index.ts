/**
 * CLI entry point. Thin shell: parse args → bootstrap → dispatch to PortoClient.
 * Single config resolution in bootstrap; commands receive { config, provider, wire }.
 * Catches only PortoError; no adapter/vendor error handling.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { PortoClient } from "../client.js";
import { PortoError } from "../errors.js";
import { bootstrap } from "./bootstrap.js";
import {
    cmdAuthLogin,
    cmdAuthLogout,
    cmdAuthStatus,
    cmdConfigCheck,
    cmdConfigInit,
    cmdIdentify,
    cmdMark,
    cmdPrice,
    cmdResolve,
    cmdTrack,
} from "./commands.js";
import { BRANDING } from "./constants.js";

function addOutputFlags(cmd: Command): Command {
    return cmd.option("--json", "Output as JSON").option("--pretty", "Human-readable output");
}

function toOpts(cmd: Command): Record<string, unknown> {
    const opts = cmd.opts();
    return { ...opts } as Record<string, unknown>;
}

function getCliVersion(): string {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pkgPath = join(__dirname, "..", "package.json");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return pkg.version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
}

async function withClient(
    cmd: Command,
    name: string,
    handler: (opts: Record<string, unknown>, client: PortoClient) => Promise<void>,
): Promise<void> {
    const opts = toOpts(cmd);
    opts._command = name;
    const boot = bootstrap(opts);
    const client = new PortoClient(boot.config);
    await handler(opts, client);
}

export async function main(): Promise<void> {
    const prog = new Command();
    prog.name("porto").description("").version(getCliVersion());
    prog.addHelpText("beforeAll", `Porto SDK CLI ${BRANDING}\n`);

    addOutputFlags(
        prog
            .command("identify")
            .description("Identify envelope and candidate products from format/dimensions + weight")
            .option("--weight <grams>", "Weight in grams", (v) => Number.parseInt(v, 10))
            .option("--format <format>", "Envelope format")
            .option("--length <mm>", "Length in mm", (v) => Number.parseFloat(v))
            .option("--width <mm>", "Width in mm", (v) => Number.parseFloat(v))
            .option("--height <mm>", "Height in mm", (v) => Number.parseFloat(v))
            .option("--thickness <mm>", "Thickness in mm", (v) => Number.parseFloat(v))
            .option("--provider <id>", "Provider id"),
    ).action(async function (this: Command) {
        await withClient(this, "identify", cmdIdentify);
    });

    addOutputFlags(
        prog
            .command("resolve")
            .description("Resolve Porto for destination + weight")
            .option("--country <code>", "Destination country code")
            .option("--weight <grams>", "Weight in grams", (v) => Number.parseInt(v, 10))
            .option("--envelope <id>", "Envelope id")
            .option("--product <id>", "Product id")
            .option("--region <code>", "Region code")
            .option("--provider <id>", "Provider id"),
    ).action(async function (this: Command) {
        await withClient(this, "resolve", cmdResolve);
    });

    addOutputFlags(
        prog
            .command("price")
            .description("Price a letter for destination + weight")
            .option("--country <code>", "Destination country code")
            .option("--weight <grams>", "Weight in grams", (v) => Number.parseInt(v, 10))
            .option("--envelope <id>", "Envelope id")
            .option("--product <id>", "Product id")
            .option("--provider <id>", "Provider id"),
    ).action(async function (this: Command) {
        await withClient(this, "price", cmdPrice);
    });

    addOutputFlags(
        prog
            .command("mark")
            .description("Create a PortoMark using the selected provider")
            .option("--country <code>", "Destination country code")
            .option("--weight <grams>", "Weight in grams", (v) => Number.parseInt(v, 10))
            .option("--envelope <id>", "Envelope id")
            .option("--product <id>", "Product id")
            .option("--value <cents>", "Value in cents", (v) => Number.parseInt(v, 10))
            .option("--idempotency-key <key>", "Idempotency key")
            .option("--provider <id>", "Provider id"),
    ).action(async function (this: Command) {
        await withClient(this, "mark", cmdMark);
    });

    addOutputFlags(
        prog
            .command("track")
            .description("Track shipment status")
            .option("--tracking-number <number>", "Tracking number")
            .option("--provider <id>", "Provider id"),
    ).action(async function (this: Command) {
        await withClient(this, "track", cmdTrack);
    });

    const auth = prog.command("auth").description("Authentication and credential commands");

    addOutputFlags(
        auth
            .command("login")
            .description("Store provider credentials in local config")
            .requiredOption("--username <user>", "Username")
            .requiredOption("--password <pass>", "Password")
            .option("--provider <id>", "Provider id (default from config)")
            .option("--wire <id>", "Wire id (default per provider)")
            .option("--base-url <url>", "API base URL")
            .option("--dhl-api-key <key>", "DHL API key (Deutsche Post)")
            .option("--dhl-api-secret <secret>", "DHL API secret (Deutsche Post)")
            .option("--partner-id <id>", "Wire credential: partner_id")
            .option("--customer-id <id>", "Wire credential: customer_id")
            .option("--application-id <id>", "Wire credential: application_id"),
    ).action(function (this: Command) {
        const opts = toOpts(this);
        opts._command = "auth login";
        const boot = bootstrap(opts);
        cmdAuthLogin(opts, { provider: boot.provider, wire: boot.wire });
    });

    addOutputFlags(
        auth
            .command("status")
            .description("Show authentication status for provider/wire")
            .option("--provider <id>", "Provider id")
            .option("--wire <id>", "Wire id"),
    ).action(function (this: Command) {
        const opts = toOpts(this);
        opts._command = "auth status";
        const boot = bootstrap(opts);
        cmdAuthStatus(opts, { provider: boot.provider, wire: boot.wire });
    });

    addOutputFlags(
        auth
            .command("logout")
            .description("Remove stored credentials for provider/wire")
            .option("--provider <id>", "Provider id")
            .option("--wire <id>", "Wire id"),
    ).action(function (this: Command) {
        const opts = toOpts(this);
        opts._command = "auth logout";
        const boot = bootstrap(opts);
        cmdAuthLogout(opts, { provider: boot.provider, wire: boot.wire });
    });

    const config = prog.command("config").description("Runtime configuration commands");

    addOutputFlags(
        config
            .command("init")
            .description("Create ~/.porto/config.json with minimal structure (no credentials)")
            .option("--force", "Overwrite if config file already exists"),
    ).action(function (this: Command) {
        const opts = toOpts(this);
        opts._command = "config init";
        cmdConfigInit(opts);
    });

    addOutputFlags(
        config
            .command("check")
            .description("Validate and print current SDK configuration")
            .option("--provider <id>", "Provider id"),
    ).action(function (this: Command) {
        const opts = toOpts(this);
        opts._command = "config check";
        cmdConfigCheck(opts);
    });

    await prog.parseAsync();
}

if (process.env.VITEST === undefined) {
    main().catch((err) => {
        if (err instanceof PortoError) {
            console.error(err.message);
            process.exit(1);
        }
        console.error("Fatal error:", err);
        process.exit(1);
    });
}

/**
 * CLI command handlers. Thin orchestration only.
 * Receives resolved context from bootstrap. No provider/wire resolution here.
 */

import type { PortoClient } from "../client.js";
import { normalizePortoConfig } from "../config.js";
import type { BootstrapResult } from "./bootstrap.js";
import {
    clearProviderWire,
    configExists,
    getConfigCheckSummary,
    getConfigPath,
    getProviderWire,
    initConfig,
    saveProviderWire,
} from "./config-store.js";
import {
    buildLoginOutputSummary,
    buildWirePayload,
    getWireStatusSummary,
} from "./integrations/registry.js";
import { output } from "./output.js";
import { portoHumanSummary, serializePorto } from "./porto-serialize.js";
import { ensureRequiredOptions } from "./validation.js";

function boundFrom(client: PortoClient) {
    return client.provider(normalizePortoConfig(client.config).defaultProvider);
}

export async function cmdIdentify(opts: Record<string, unknown>, client: PortoClient) {
    ensureRequiredOptions("identify", opts, [{ key: "weight", flag: "--weight" }]);
    const hasFormat = typeof opts.format === "string" && opts.format.trim().length > 0;
    const hasDimensions = ["length", "width", "height"].some((dim) => opts[dim] != null);
    if (!hasFormat && !hasDimensions) {
        throw new Error("identify requires --format and/or dimensions");
    }
    const dimensions = ["length", "width", "height", "thickness"].some((dim) => opts[dim] != null)
        ? {
              length: opts.length as number | undefined,
              width: opts.width as number | undefined,
              height: opts.height as number | undefined,
              thickness: opts.thickness as number | undefined,
          }
        : undefined;
    const result = await client.envelopes.identify({
        format: hasFormat ? String(opts.format) : undefined,
        dimensions,
        weight: Number(opts.weight),
    });
    output(
        {
            dimensions: result.dimensions,
            format: result.format,
            resolutionWeight: result.resolutionWeight,
        },
        opts,
    );
}

export async function cmdResolve(opts: Record<string, unknown>, client: PortoClient) {
    ensureRequiredOptions("resolve", opts, [
        { key: "country", flag: "--country" },
        { key: "weight", flag: "--weight" },
    ]);
    const bound = boundFrom(client);
    const result = await bound.resolve({
        countryCode: String(opts.country),
        weight: Number(opts.weight),
        envelopeId: opts.envelope ? String(opts.envelope) : undefined,
        productId: opts.product ? String(opts.product) : undefined,
    });
    output(opts.json ? serializePorto(result) : portoHumanSummary(result), opts);
}

export async function cmdPrice(opts: Record<string, unknown>, client: PortoClient) {
    ensureRequiredOptions("price", opts, [
        { key: "country", flag: "--country" },
        { key: "weight", flag: "--weight" },
    ]);
    const bound = boundFrom(client);
    const pricing = await bound.price({
        countryCode: String(opts.country),
        weight: Number(opts.weight),
        envelopeId: opts.envelope ? String(opts.envelope) : undefined,
        productId: opts.product ? String(opts.product) : undefined,
    });
    output(
        {
            productId: pricing.productId,
            zone: pricing.zoneId,
            weight: pricing.weight,
            amount: pricing.amount,
            currency: pricing.currency,
        },
        opts,
    );
}

export async function cmdMark(opts: Record<string, unknown>, client: PortoClient) {
    ensureRequiredOptions("mark", opts, [
        { key: "country", flag: "--country" },
        { key: "weight", flag: "--weight" },
    ]);
    const bound = boundFrom(client);
    const porto = await bound.resolve({
        countryCode: String(opts.country),
        weight: Number(opts.weight),
        envelopeId: opts.envelope ? String(opts.envelope) : undefined,
        productId: opts.product ? String(opts.product) : undefined,
    });
    const result = await bound.mark({
        porto,
        idempotency: opts.idempotencyKey as string | undefined,
    });
    const mark = Array.isArray(result) ? result[0] : result;
    if (!mark) {
        throw new Error("mark() returned no result");
    }
    output(
        {
            id: mark.id,
            externalId: mark.externalId,
            amount: mark.amount,
            currency: mark.currency,
            idempotencyKey: opts.idempotencyKey,
        },
        opts,
    );
}

export async function cmdTrack(opts: Record<string, unknown>, client: PortoClient) {
    ensureRequiredOptions("track", opts, [{ key: "trackingNumber", flag: "--tracking-number" }]);
    const bound = boundFrom(client);
    const result = await bound.track.get(opts.trackingNumber as string);
    output(result, opts);
}

export type AuthContext = Pick<BootstrapResult, "provider" | "wire">;

export function cmdAuthLogin(opts: Record<string, unknown>, ctx: AuthContext) {
    ensureRequiredOptions("auth login", opts, [
        { key: "username", flag: "--username" },
        { key: "password", flag: "--password" },
    ]);
    const { provider, wire } = ctx;
    const payload = buildWirePayload(opts, provider, wire);
    saveProviderWire(provider, wire, payload);
    const summary = buildLoginOutputSummary(opts, provider, wire, getConfigPath());
    output(summary, opts);
}

export function cmdAuthStatus(opts: Record<string, unknown>, ctx: AuthContext) {
    const { provider, wire } = ctx;
    const wireConfig = getProviderWire(provider, wire);
    const summary = getWireStatusSummary(wireConfig, provider, wire);
    output(summary, opts);
}

export function cmdAuthLogout(opts: Record<string, unknown>, ctx: AuthContext) {
    if (!configExists()) {
        output({ loggedOut: false, reason: "No config file found" }, opts);
        return;
    }
    const { provider, wire } = ctx;
    const cleared = clearProviderWire(provider, wire);
    output(
        cleared
            ? { loggedOut: true, configPath: getConfigPath() }
            : { loggedOut: false, reason: "No credentials to remove" },
        opts,
    );
}

export function cmdConfigInit(opts: Record<string, unknown>) {
    const force = Boolean(opts.force);
    const result = initConfig(force);
    output(
        {
            created: result.created,
            path: result.path,
            message: result.created
                ? 'Config file created. Edit it or run "porto auth login" to add credentials.'
                : "Config file already exists. Use --force to overwrite.",
        },
        opts,
    );
}

export function cmdConfigCheck(opts: Record<string, unknown>) {
    const summary = getConfigCheckSummary(opts.provider as string | undefined);
    output(summary, opts);
}

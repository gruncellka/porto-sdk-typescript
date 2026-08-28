/**
 * Execution registry — maps operator to execution adapter (internetmarke only today).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PortoConfig, WireConfig } from "../config.js";
import { normalizePortoConfig, wiresFor } from "../config.js";
import { findPortoDataPath } from "../data/porto-data-registry.js";
import { createInternetmarkeAdapter } from "./deutschepost/internetmarke/bootstrap.js";
import type { ExecutionAdapter } from "./protocols/execution.js";
import { getTrackingAdapter as resolveTrackingAdapter } from "./tracking/adapter.js";
import { UnavailableExecutionAdapter } from "./unavailable-adapter.js";

type WireEntry = {
    billing?: string[];
    execution?: string[];
};

type ExecutionManifest = {
    wire?: string;
    adapter?: string;
    billing?: string[];
    execution?: string[];
};

function normalizeCapability(item: string): string {
    const token = item.trim().toLowerCase();
    if (token === "balance") return "wallet";
    return token;
}

function manifestWireView(manifest: ExecutionManifest): {
    wireId: string | null;
    wires: Record<string, WireEntry>;
} {
    const wire = manifest.wire ?? manifest.adapter;
    if (wire) {
        const wireId = wire.trim().toLowerCase();
        return {
            wireId,
            wires: {
                [wireId]: {
                    billing: (manifest.billing ?? []).map(normalizeCapability),
                    execution: (manifest.execution ?? []).map(normalizeCapability),
                },
            },
        };
    }
    return { wireId: null, wires: {} };
}

export function loadExecutionManifest(
    providerId: string,
    dataPath?: string | null,
): ExecutionManifest {
    const provider = providerId.trim().toLowerCase();
    const candidates: string[] = [];
    let resolvedPath = dataPath ?? null;
    if (!resolvedPath) {
        try {
            resolvedPath = findPortoDataPath();
        } catch {
            resolvedPath = null;
        }
    }
    if (resolvedPath) {
        for (const filename of ["execution.json"]) {
            candidates.push(join(resolvedPath, "providers", provider, filename));
            candidates.push(join(resolvedPath, "porto_data", "providers", provider, filename));
        }
    }
    for (const path of candidates) {
        try {
            return JSON.parse(readFileSync(path, "utf8")) as ExecutionManifest;
        } catch {}
    }
    return {};
}

export function listApplicableWires(
    providerId: string,
    operation: string,
    dataPath?: string | null,
): string[] {
    const cap =
        operation === "wallet"
            ? { group: "billing" as const, wanted: "wallet" }
            : { group: "execution" as const, wanted: operation === "mark" ? "mark" : operation };
    const wanted = normalizeCapability(cap.wanted);
    const { wires } = manifestWireView(loadExecutionManifest(providerId, dataPath));
    const found: string[] = [];
    for (const [wireId, entry] of Object.entries(wires)) {
        const methods = (entry[cap.group] ?? []).map((item) => normalizeCapability(item));
        if (methods.includes(wanted)) found.push(wireId);
    }
    return found;
}

export function getDefaultWireId(providerId: string, dataPath?: string | null): string | null {
    const manifest = loadExecutionManifest(providerId, dataPath);
    return manifestWireView(manifest).wireId;
}

export function listWireBillingMethods(
    providerId: string,
    wireId: string,
    dataPath?: string | null,
): string[] {
    const manifest = loadExecutionManifest(providerId, dataPath);
    const { wires } = manifestWireView(manifest);
    const entry = wires[wireId.trim().toLowerCase()];
    return (entry?.billing ?? []).map(String);
}

export function listWireExecutionMethods(
    providerId: string,
    wireId: string,
    dataPath?: string | null,
): string[] {
    const manifest = loadExecutionManifest(providerId, dataPath);
    const { wires } = manifestWireView(manifest);
    const entry = wires[wireId.trim().toLowerCase()];
    return (entry?.execution ?? []).map(String);
}

function resolveActiveWire(config: PortoConfig, dataPath?: string | null): string | null {
    const normalized = normalizePortoConfig(config);
    return resolveActiveWireFor(
        normalized.defaultProvider,
        wiresFor(config, normalized.defaultProvider),
        dataPath,
    );
}

export function resolveActiveWireFor(
    providerId: string,
    wires: Record<string, WireConfig> | undefined,
    dataPath?: string | null,
): string | null {
    const provider = providerId.trim().toLowerCase();
    if (wires && Object.keys(wires).length > 0) {
        const defaultId = getDefaultWireId(provider, dataPath);
        if (defaultId && wires[defaultId]) {
            return defaultId;
        }
        return Object.keys(wires)[0] ?? null;
    }
    return getDefaultWireId(provider, dataPath);
}

export function supportsBilling(
    providerId: string,
    method: string,
    args?: {
        config?: PortoConfig;
        wireId?: string;
        dataPath?: string | null;
        wires?: Record<string, WireConfig>;
    },
): boolean {
    const provider = providerId.trim().toLowerCase();
    const normalizedMethod = normalizeCapability(method);
    const dataPath = args?.dataPath ?? args?.config?.data ?? null;
    const wire =
        args?.wireId ??
        (args?.wires
            ? resolveActiveWireFor(provider, args.wires, dataPath)
            : args?.config
              ? resolveActiveWire(args.config, dataPath)
              : getDefaultWireId(provider, dataPath));
    if (!wire) {
        return false;
    }
    return listWireBillingMethods(provider, wire, dataPath).some(
        (item) => item.toLowerCase() === normalizedMethod,
    );
}

export function supportsExecution(
    providerId: string,
    method: string,
    args?: {
        config?: PortoConfig;
        wireId?: string;
        dataPath?: string | null;
        wires?: Record<string, WireConfig>;
    },
): boolean {
    const provider = providerId.trim().toLowerCase();
    const normalizedMethod = normalizeCapability(method);
    const dataPath = args?.dataPath ?? args?.config?.data ?? null;
    const wire =
        args?.wireId ??
        (args?.wires
            ? resolveActiveWireFor(provider, args.wires, dataPath)
            : args?.config
              ? resolveActiveWire(args.config, dataPath)
              : getDefaultWireId(provider, dataPath));
    if (!wire) {
        return false;
    }
    return listWireExecutionMethods(provider, wire, dataPath).some(
        (item) => item.toLowerCase() === normalizedMethod,
    );
}

export function getExecutionAdapter(
    providerId: string,
    wires: Record<string, WireConfig> | undefined,
    env?: NodeJS.ProcessEnv,
    dataPath?: string | null,
    httpClient?: import("../transport/http-client.js").Transport,
): ExecutionAdapter {
    const provider = providerId.trim().toLowerCase();
    const wireId = getDefaultWireId(provider, dataPath);
    if (!wireId) {
        return new UnavailableExecutionAdapter(provider, "none");
    }

    if (wireId === "internetmarke") {
        return createInternetmarkeAdapter(wires, env, provider, httpClient);
    }

    return new UnavailableExecutionAdapter(provider, wireId);
}

export function getTrackingAdapter(
    providerId: string,
    wires: Record<string, WireConfig> | undefined,
    _env?: NodeJS.ProcessEnv,
    dataPath?: string | null,
) {
    const wireId =
        resolveActiveWireFor(providerId, wires, dataPath) ?? getDefaultWireId(providerId, dataPath);
    return resolveTrackingAdapter(providerId, { wireId, dataPath });
}

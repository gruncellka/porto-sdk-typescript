/**
 * Step definitions for CLI BDD tests (TypeScript)
 * Tests CLI functions directly (not via subprocess)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { getConfigCheckSummary } from "../../../src/cli/config-store.js";
import { PortoClient } from "../../../src/client.js";
import { PortoError } from "../../../src/errors.js";
import { addressJson } from "../../support/addresses.js";
import { resolvePortoDataPathForTests } from "../../support/porto-data-path.js";
import { bddContext as context } from "./bdd-context.js";
import {
    bound,
    countryForZone,
    providerHomeCountry,
    providerIdFromContext,
    publicPrice,
} from "./bdd-helpers.js";

function getDataPath(): string {
    return resolvePortoDataPathForTests();
}

async function samplePorto() {
    const client = bound(context);
    const home = providerHomeCountry(context);
    try {
        return await client.resolve({
            countryCode: home,
            weight: 20,
            productId: context.productId,
        });
    } catch (error) {
        if (!(error instanceof PortoError)) throw error;
        const options = client.options({ countryCode: home, weight: 20 });
        expect(options.length).toBeGreaterThan(0);
        return client.resolve({
            countryCode: home,
            weight: 20,
            productId: options[0].id,
        });
    }
}

Given("I have porto-data available", () => {
    const dataPath = getDataPath();
    if (!context.client) {
        context.client = new PortoClient({ data: dataPath });
    }
    expect(context.client.envelopes.list().length).toBeGreaterThan(0);
    context.dataPath = dataPath;
});

function addressFromJson(data: Record<string, unknown>) {
    const street = String(data.street ?? "");
    const houseNumber = String(data.house_number ?? data.houseNumber ?? "1");
    return {
        name: String(data.name ?? "Test"),
        street,
        houseNumber,
        postalCode: String(data.postal_code ?? data.postalCode ?? ""),
        locality: String(data.locality ?? ""),
        countryCode: String(data.country_code ?? data.countryCode ?? ""),
        regionCode: (data.region_code ?? data.regionCode) as string | undefined,
    };
}

Given("I have a valid address JSON data", () => {
    context.addressData = addressJson("valid_DE");
});

When("I call CLI config command", () => {
    const dataPath = context.dataPath ?? getDataPath();
    const provider = context.providerId ?? providerIdFromContext(context);
    const summary = getConfigCheckSummary(provider);
    const metadataPath = join(dataPath, "metadata.json");
    let metadata: Record<string, unknown> | null = null;
    try {
        metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    } catch {
        // Ignore
    }

    context.cliResult = {
        provider: provider ?? summary.provider,
        data: summary.data ?? dataPath,
        data_path: summary.data ?? dataPath,
        timeout: summary.timeout,
        retries: summary.retries,
        has_auth: summary.hasAuth,
        porto_data_version:
            (metadata?.project as { version?: string } | undefined)?.version ?? "unknown",
    };
});

When("I call CLI data info command", () => {
    const metadataPath = join(context.dataPath ?? getDataPath(), "metadata.json");
    let metadata: Record<string, unknown> | null = null;
    try {
        metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    } catch {
        // Ignore
    }

    if (metadata) {
        context.cliResult = {
            version: (metadata.project as { version?: string } | undefined)?.version ?? "unknown",
            generated_at: metadata.generated_at ?? "unknown",
            entities:
                metadata.global && metadata.providers
                    ? [
                          ...new Set([
                              ...Object.keys(metadata.global as object),
                              ...Object.values(
                                  metadata.providers as Record<string, Record<string, unknown>>,
                              ).flatMap((p) => Object.keys(p || {})),
                          ]),
                      ]
                    : Object.keys((metadata.entities as object) || {}),
        };
    } else {
        context.cliResult = { error: "metadata not found" };
    }
});

When("I call CLI data products command", async () => {
    const client = bound(context);
    const home = providerHomeCountry(context);
    const found = new Map<string, { id: string; name: string }>();
    for (const weight of [20, 50, 100, 500, 1000, 2000]) {
        try {
            for (const row of client.options({ countryCode: home, weight })) {
                found.set(row.id, { id: row.id, name: row.name });
            }
        } catch (error) {
            if (!(error instanceof PortoError)) throw error;
        }
    }
    context.cliResult = { products: [...found.values()] };
});

function zoneProbeCountries(): string[] {
    const home = providerHomeCountry(context);
    const provider = providerIdFromContext(context);
    const extras: Record<string, string[]> = {
        deutschepost: ["FR", "US"],
        laposte: ["BE", "US"],
        ukrposhta: ["US"],
        swisspost: ["DE", "US"],
    };
    const seen = new Set<string>();
    const ordered = [home, ...(extras[provider] ?? ["US"])];
    return ordered.filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
    });
}

When("I call CLI data zones command", async () => {
    const client = bound(context);
    const found = new Map<string, { id: string; name: string }>();
    for (const country of zoneProbeCountries()) {
        try {
            const porto = await client.resolve({
                countryCode: country,
                weight: 20,
                productId: context.productId,
            });
            found.set(porto.zone.id, { id: porto.zone.id, name: porto.zone.name });
        } catch (error) {
            if (!(error instanceof PortoError)) continue;
            const options = client.options({ countryCode: country, weight: 20 });
            if (options.length === 0) continue;
            try {
                const porto = await client.resolve({
                    countryCode: country,
                    weight: 20,
                    productId: options[0].id,
                });
                found.set(porto.zone.id, { id: porto.zone.id, name: porto.zone.name });
            } catch {
                // Skip destinations this provider cannot quote.
            }
        }
    }
    context.cliResult = { zones: [...found.values()] };
});

When("I call CLI data services command", async () => {
    const porto = await samplePorto();
    context.cliResult = {
        services: porto.availableServices.map((row) => ({ id: row.id, name: row.name })),
    };
});

When(
    "I call CLI data price command with product {string} zone {string} weight {int}",
    async (product: string, zone: string, weight: number) => {
        const provider = providerIdFromContext(context);
        const country = countryForZone(provider, zone);
        const pricing = await publicPrice(context, {
            countryCode: country,
            weight,
            productId: product,
        });
        context.cliResult = {
            product,
            zone: pricing.zoneId,
            weight,
            price: pricing.amount,
            currency: pricing.currency,
        };
    },
);

async function cliPricePayload(country: string, weight: number) {
    const resolved = await bound(context).resolve({
        countryCode: country,
        weight,
        deliveryPreference: context.deliveryPreference,
        productId: context.productId,
    });
    return {
        product: {
            id: resolved.product.id,
            name: resolved.product.name,
        },
        zone: {
            id: resolved.zone.id,
            name: resolved.zone.name,
        },
        amount: resolved.amount,
        currency: resolved.currency,
        is_valid: resolved.isValid,
    };
}

When(
    "I call CLI price command with country {string} weight {int}",
    async (country: string, weight: number) => {
        context.cliResult = await cliPricePayload(country, weight);
    },
);

When(
    "I call CLI price command with type {string} country {string} weight {int}",
    async (_ignored: string, country: string, weight: number) => {
        void _ignored;
        context.cliResult = await cliPricePayload(country, weight);
    },
);

When("I call CLI validate address command", async () => {
    const client = context.client!;
    const addressData = context.addressData;

    if (!addressData) {
        throw new Error("No address data in context");
    }

    const result = await client.address.validate(
        addressFromJson(addressData as Record<string, unknown>),
    );

    context.cliResult = {
        valid: result.isValid,
        errors: result.errors || [],
        warnings: result.warnings || [],
    };
});

function resultPayload(): Record<string, unknown> {
    if (context.cliResult && typeof context.cliResult === "object") {
        return context.cliResult as Record<string, unknown>;
    }
    if (context.result && typeof context.result === "object") {
        return context.result;
    }
    return {};
}

function coerceStepValue(value: string): unknown {
    if (/^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
    }
    if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
        return value.toLowerCase() === "true";
    }
    return value;
}

When("the result should be stored for comparison", () => {
    context.previousCliResult = context.cliResult;
});

Then("the result should have field {string}", (field: string) => {
    const result = resultPayload();
    expect(result).toHaveProperty(field);
});

Then("the result should have array {string}", (field: string) => {
    const result = resultPayload();
    expect(result).toHaveProperty(field);
    expect(Array.isArray(result[field])).toBe(true);
});

Then(
    /^the result should have field "([^"]+)" with value (?:"([^"]+)"|(\d+)|(true|false))$/,
    (field: string, quoted: string, numeric: string, bool: string) => {
        const result = resultPayload();
        expect(result).toHaveProperty(field);
        const raw = quoted ?? numeric ?? bool;
        expect(result[field]).toEqual(coerceStepValue(raw));
    },
);

Then(
    /^the result should have field "([^"]+)" as (number|string|boolean|array|object)$/,
    (field: string, typeName: string) => {
        const result = resultPayload();
        expect(result).toHaveProperty(field);
        const actualValue = result[field];
        if (typeName === "array") {
            expect(Array.isArray(actualValue)).toBe(true);
            return;
        }
        if (typeName === "object") {
            expect(typeof actualValue).toBe("object");
            return;
        }
        if (typeName === "number") {
            expect(typeof actualValue).toBe("number");
            return;
        }
        expect(typeof actualValue).toBe(typeName);
    },
);

Then(
    "the result should have field {string} with nested {string} {string}",
    (field: string, nestedField: string, nestedValue: string) => {
        expect(context.cliResult).toBeDefined();
        expect(context.cliResult).toHaveProperty(field);
        expect(typeof context.cliResult?.[field as keyof typeof context.cliResult]).toBe("object");
        const nested = context.cliResult?.[field as keyof typeof context.cliResult] as Record<
            string,
            unknown
        >;
        expect(nested).toHaveProperty(nestedField);

        let expectedValue: unknown = nestedValue;
        if (/^\d+$/.test(nestedValue)) {
            expectedValue = Number.parseInt(nestedValue, 10);
        } else if (nestedValue.toLowerCase() === "true" || nestedValue.toLowerCase() === "false") {
            expectedValue = nestedValue.toLowerCase() === "true";
        }

        expect(nested[nestedField]).toEqual(expectedValue);
    },
);

Then("the products array should be stored for comparison", () => {
    const products = (context.cliResult?.products ?? []) as Array<{ id?: string }>;
    context.storedProductIds = new Set(products.map((row) => row.id).filter(Boolean));
});

Then("the products array should differ from the stored products array", () => {
    const products = (context.cliResult?.products ?? []) as Array<{ id?: string }>;
    const current = new Set(products.map((row) => row.id).filter(Boolean));
    const stored = context.storedProductIds ?? new Set<string>();
    expect(current.size).toBeGreaterThan(0);
    expect([...current].some((id) => !stored.has(id))).toBe(true);
    context.storedProductIds = current;
});

Then("the products array should contain product with id {string}", (productId: string) => {
    expect(context.cliResult?.products ?? context.products).toBeDefined();
    const products = (context.cliResult?.products ?? context.products) as Array<{ id?: string }>;
    const productIds = products.map((p) => p?.id).filter(Boolean);
    expect(productIds).toContain(productId);
});

Then("the zones array should contain zone with id {string}", (zoneId: string) => {
    expect(context.cliResult?.zones ?? context.zones).toBeDefined();
    const zones = (context.cliResult?.zones ?? context.zones) as Array<{ id?: string }>;
    const zoneIds = zones.map((z) => z?.id).filter(Boolean);
    expect(zoneIds).toContain(zoneId);
});

Then("the services array should contain service with id {string}", (serviceId: string) => {
    expect(context.cliResult?.services ?? context.services).toBeDefined();
    const services = (context.cliResult?.services ?? context.services) as Array<{ id?: string }>;
    const serviceIds = services.map((s) => s?.id).filter(Boolean);
    expect(serviceIds).toContain(serviceId);
});

Then("the errors array should not be empty", () => {
    expect(context.cliResult).toBeDefined();
    expect(context.cliResult).toHaveProperty("errors");
    expect(Array.isArray(context.cliResult?.errors)).toBe(true);
    expect(context.cliResult?.errors?.length).toBeGreaterThan(0);
});

Then("the results should be identical", () => {
    expect(context.previousCliResult).toBeDefined();
    expect(context.cliResult).toBeDefined();
    expect(context.previousCliResult).toEqual(context.cliResult);
});

Then("the results should have same structure", () => {
    expect(context.previousCliResult).toBeDefined();
    expect(context.cliResult).toBeDefined();

    const firstKeys = Object.keys(context.previousCliResult || {});
    const lastKeys = Object.keys(context.cliResult || {});
    expect(firstKeys.sort()).toEqual(lastKeys.sort());
});

Then("the {string} fields should match", (field: string) => {
    expect(context.previousCliResult).toBeDefined();
    expect(context.cliResult).toBeDefined();
    expect(context.previousCliResult).toHaveProperty(field);
    expect(context.cliResult).toHaveProperty(field);
    expect(context.previousCliResult?.[field as keyof typeof context.previousCliResult]).toEqual(
        context.cliResult?.[field as keyof typeof context.cliResult],
    );
});

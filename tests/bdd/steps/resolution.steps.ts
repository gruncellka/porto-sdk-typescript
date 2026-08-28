/**
 * Step definitions for resolution.feature and delivery_resolution.feature
 */

import { Before, Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { PortoClient } from "../../../src/client.js";
import { PortoErrorCode } from "../../../src/errors.js";
import { resolvePortoDataPathForTests } from "../../support/porto-data-path.js";
import { type BddContext, bddContext as context } from "./bdd-context.js";
import { bound, providerHomeCountry, publicResolve } from "./bdd-helpers.js";

Before(() => {
    context.porto = undefined;
    context.resolutionError = undefined;
    context.deliveryPreference = undefined;
    context.productId = undefined;
    context.envelopeId = undefined;
    context.servicesKinds = undefined;
    context.serviceIds = undefined;
    context.quotedAmount = undefined;
    context.pricing = undefined;
    context.price = undefined;
    context.result = undefined;
    context.zoneId = undefined;
});

Given("provider is {string}", (provider: string) => {
    context.providerId = provider;
    context.client = new PortoClient({
        providers: { [provider]: {} },
        data: resolvePortoDataPathForTests(),
    });
});

Given("the letter weight is {int} grams", (weight: number) => {
    context.letterWeight = weight;
});

Given("delivery preference is {string}", (preference: string) => {
    context.deliveryPreference = preference as BddContext["deliveryPreference"];
});

Given("product id is {string}", (productId: string) => {
    context.productId = productId;
});

Given("service ids are {string}", (raw: string) => {
    const token = raw.trim();
    if (!token || ["none", "-", "null"].includes(token.toLowerCase())) {
        context.serviceIds = [];
        return;
    }
    context.serviceIds = token
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
});

When("I resolve the shipping configuration", async () => {
    await resolveLetter();
});

When("I resolve the letter", async () => {
    await resolveLetter();
});

async function resolveLetter(): Promise<void> {
    try {
        context.porto = await publicResolve(context);
        context.resolutionError = undefined;
    } catch (error: any) {
        context.porto = undefined;
        context.resolutionError = {
            code: error?.code ?? "UNKNOWN",
            message: error?.message ?? String(error),
            details: error?.details,
        };
    }
}

Then("I should get product with id {string}", (productId: string) => {
    expect(context.porto?.product?.id).toBe(productId);
});

Then("I should get zone with id {string}", (zoneId: string) => {
    expect(context.porto?.zone?.id).toBe(zoneId);
});

Then("I should get weight tier {string}", (weightTierId: string) => {
    const tier = context.porto?.weightTier;
    const id = typeof tier === "object" && tier ? (tier as { id?: string }).id : tier;
    expect(id).toBe(weightTierId);
});

Then("the resolution should be valid", () => {
    expect(context.porto?.isValid).toBe(true);
});

Then("the resolution should be invalid", () => {
    expect(context.resolutionError).toBeDefined();
});

Then("I should get an error about weight exceeding maximum", () => {
    if (context.resolutionError) {
        expect(context.resolutionError.code).toBe(PortoErrorCode.PORTO_TOO_HEAVY);
        return;
    }
    const errors = (context.validationErrors ?? []).join(" ").toLowerCase();
    expect(errors.includes("weight") || errors.includes("heavy")).toBe(true);
});

Then("the resolution should include base price", () => {
    expect(context.porto?.amount).toBeGreaterThan(0);
});

Then("the resolved amount should be a positive number", () => {
    expect(context.porto?.amount).toBeGreaterThan(0);
});

Then("the base price should be a positive number", () => {
    expect(context.porto?.amount).toBeGreaterThan(0);
});

Then("the resolved Porto should have a product id", () => {
    expect(context.porto?.product?.id).toBeTruthy();
});

Then("the resolved Porto should include a restrictions result", () => {
    expect(context.porto?.restrictions).toBeDefined();
    expect("impact" in (context.porto?.restrictions as object)).toBe(true);
    expect("legal" in (context.porto?.restrictions as object)).toBe(true);
    expect("routing" in (context.porto?.restrictions as object)).toBe(true);
    const impact = context.porto?.restrictions?.impact;
    expect(impact === null || impact === "block" || impact === "warn").toBe(true);
});

Then("the quoted amount should equal the resolved amount", async () => {
    const pricing = context.pricing ?? (await publicPrice(context));
    const amount =
        (pricing as { amount?: number })?.amount ?? context.quotedAmount ?? context.price;
    expect(amount).toBe(context.porto?.amount);
});

Then("the resolved Porto should include service kind {string}", (kind: string) => {
    expect(context.porto?.services).toContain(kind);
});

Then("the resolved Porto should include service id {string}", (serviceId: string) => {
    expect(context.porto?.serviceIds).toContain(serviceId);
});

Then("the resolved Porto should include feature kind {string}", (featureKind: string) => {
    const kinds = new Set(
        ((context.porto?.features as Array<{ kind?: string }>) ?? []).map((row) => row.kind),
    );
    expect(kinds.has(featureKind)).toBe(true);
});

Then("the resolved amount should be greater than the product component amount", () => {
    const porto = context.porto!;
    const productAmount = (
        (porto.components as Array<{ kind?: string; amount?: number }>) ?? []
    ).find((row) => row.kind === "product")?.amount;
    expect(porto.amount).toBeGreaterThan(productAmount ?? 0);
});

Given("a concrete product id is pinned from catalog options", () => {
    const client = bound(context);
    const country = context.destinationCountry ?? providerHomeCountry(context);
    const weight = context.letterWeight ?? 20;
    const options = client.options({ countryCode: country, weight });
    expect(options.length).toBeGreaterThan(0);
    context.productId = options[0].id;
    context.pinnedProductId = options[0].id;
});

Then("the resolved Porto should have the pinned product id", () => {
    expect(context.porto?.product?.id).toBe(context.pinnedProductId);
});

Then("the resolved Porto components should sum to the resolved amount", () => {
    const porto = context.porto!;
    const total = ((porto.components as Array<{ amount?: number }>) ?? []).reduce(
        (sum, row) => sum + (row.amount ?? 0),
        0,
    );
    expect(total).toBe(porto.amount);
});

Then("the resolved currency is present", () => {
    const currency = context.porto?.currency;
    expect(typeof currency).toBe("string");
    expect(String(currency).trim().length).toBeGreaterThan(0);
});

Then("the resolution should include currency {string}", (currency: string) => {
    expect(context.porto?.currency).toBe(currency);
});

Then("delivery hint span should be {string}", (span: string) => {
    expect(context.porto?.deliveryHint?.span).toBe(span);
});

Then("delivery hint days max should be {int}", (daysMax: number) => {
    expect(context.porto?.deliveryHint?.daysMax).toBe(daysMax);
});

Then("delivery hint weekdays should be {string}", (weekdays: string) => {
    expect(context.porto?.deliveryHint?.workingDays?.weekdays).toBe(weekdays);
});

Then("resolution should be product ambiguous", () => {
    expect(context.resolutionError?.code).toBe(PortoErrorCode.PORTO_PRODUCT_AMBIGUOUS);
});

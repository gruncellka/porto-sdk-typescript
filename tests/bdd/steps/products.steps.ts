/**
 * Step definitions for product_options.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { boundProvider } from "../../support/bound-provider.js";
import { bddContext as context } from "./bdd-context.js";

Given("envelope id is {string}", (envelopeId: string) => {
    context.envelopeId = envelopeId;
});

When("I list product options", () => {
    const client = context.client!;
    context.productOptions = boundProvider(client, context.providerId).options({
        countryCode: context.destinationCountry || "DE",
        weight: context.letterWeight || 20,
        envelopeId: context.envelopeId,
    });
});

function optionById(productId: string) {
    return (context.productOptions ?? []).find((row) => row.id === productId);
}

Then("product options should include {string}", (productId: string) => {
    expect(optionById(productId)).toBeDefined();
});

Then("product options should not include {string}", (productId: string) => {
    expect(optionById(productId)).toBeUndefined();
});

Then("product option {string} should have a price", (productId: string) => {
    const row = optionById(productId);
    expect(row?.amount).toBeGreaterThan(0);
});

Then(
    "product option {string} should include service {string}",
    (productId: string, serviceId: string) => {
        const row = optionById(productId);
        expect(row).toBeDefined();
        expect(row!.services.some((svc) => svc.id === serviceId)).toBe(true);
    },
);

When(
    "I resolve using product {string} and discovered service {string}",
    async (productId: string, serviceId: string) => {
        const row = optionById(productId);
        expect(row).toBeDefined();
        const svc = row!.services.find((item) => item.id === serviceId);
        expect(svc).toBeDefined();
        expect(svc!.kind).toBeTruthy();
        context.productId = productId;
        context.servicesKinds = [svc!.kind!];
        context.serviceIds = [svc!.id];
        const { publicResolve } = await import("./bdd-helpers.js");
        try {
            context.porto = await publicResolve(context);
            context.resolvedPorto = context.porto;
            context.resolutionError = undefined;
        } catch (error: any) {
            context.porto = undefined;
            context.resolvedPorto = undefined;
            context.resolutionError = {
                code: error?.code ?? "UNKNOWN",
                message: error?.message ?? String(error),
                details: error?.details,
            };
        }
    },
);

Then("I should get a non-empty list of product options", () => {
    expect((context.productOptions ?? []).length).toBeGreaterThan(0);
});

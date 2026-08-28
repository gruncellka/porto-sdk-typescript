/**
 * Step definitions for pricing.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { bddContext as context } from "./bdd-context.js";
import { productReferenceAmount, publicPrice, resolvePrice } from "./bdd-helpers.js";

Given("the weight is {int} grams", (weight: number) => {
    context.weight = weight;
    context.letterWeight = weight;
});

Given("I have product {string}", (productId: string) => {
    context.productId = productId;
});

Given("I have zone {string}", (zoneId: string) => {
    context.zoneId = zoneId;
});

When("I get the price", async () => {
    await resolvePrice(context);
});

When("I get the price again with the same parameters", async () => {
    await resolvePrice(context);
});

Then("I should get a price in cents", () => {
    expect((context.price ?? 0) > 0).toBe(true);
});

Then("the currency should be {string}", (currency: string) => {
    const pricing = context.pricing;
    if (pricing && typeof pricing === "object" && "currency" in pricing) {
        expect(pricing.currency).toBe(currency);
        return;
    }
    expect(context.porto?.currency ?? context.result?.currency).toBe(currency);
});

Then("the quoted amount should be higher than the domestic amount", async () => {
    const domestic = await publicPrice(context, { countryCode: "DE" });
    expect(context.price!).toBeGreaterThan(domestic.amount);
});

Then("the price should be higher than domestic price", async () => {
    const domestic = await publicPrice(context, { countryCode: "DE" });
    expect(context.price!).toBeGreaterThan(domestic.amount);
});

Then(
    "the quoted amount should be higher than the price of product {string}",
    async (productId: string) => {
        const reference = await productReferenceAmount(context, productId);
        expect(context.price!).toBeGreaterThan(reference);
    },
);

Then("the price should be greater than 0", () => {
    expect((context.price ?? 0) > 0).toBe(true);
});

Then("the quoted amount should be {int}", (amount: number) => {
    expect(context.price).toBe(amount);
});

Then("the quoted product id should be {string}", (productId: string) => {
    const pricing = context.pricing as { productId?: string } | undefined;
    expect(pricing?.productId).toBe(productId);
});

Then("the quoted components should sum to the quoted amount", () => {
    const pricing = context.pricing as
        | {
              amount?: number;
              components?: Array<{ amount: number }>;
          }
        | undefined;
    expect(pricing).toBeDefined();
    const total = (pricing?.components ?? []).reduce((sum, row) => sum + row.amount, 0);
    expect(total).toBe(pricing?.amount);
});

Then("I should store the result", () => {
    context.storedPrice = context.price;
    context.storedPricing = context.pricing;
});

Then("the prices should be identical", () => {
    expect(context.storedPrice).toBe(context.price);
});

Given("destination country {string}", (countryCode: string) => {
    context.destinationCountry = countryCode;
});

Given("zone id is {string}", (zoneId: string) => {
    context.zoneId = zoneId;
});

When("I pre-calculate the price", async () => {
    const price = await resolvePrice(context);
    context.preCalculatedPrice = price;
});

Then("the resolved zone id should be {string}", (zoneId: string) => {
    const pricing = context.pricing as { zoneId?: string; zone?: string } | undefined;
    const zone = pricing?.zoneId ?? pricing?.zone;
    if (zone != null) {
        expect(zone).toBe(zoneId);
        return;
    }
    expect(context.porto?.zone?.id).toBe(zoneId);
});

Then("the price should be consistent with product and zone", () => {
    const pricing = context.pricing as
        | {
              zoneId?: string;
              zone?: string;
              productId?: string;
          }
        | undefined;
    expect(pricing).toBeDefined();
    expect(pricing?.productId || pricing?.zoneId || pricing?.zone).toBeTruthy();
    if (context.zoneId) {
        expect(pricing?.zoneId ?? pricing?.zone).toBe(context.zoneId);
    }
});

Then("I should get a pre-calculated price in cents", () => {
    if (context.preCalculatedPrice != null) {
        expect(typeof context.preCalculatedPrice).toBe("number");
        return;
    }
    expect((context.price ?? 0) > 0).toBe(true);
});

Then("the pre-calculated price should be greater than 0", () => {
    if (context.preCalculatedPrice != null) {
        expect(context.preCalculatedPrice > 0).toBe(true);
        return;
    }
    expect((context.price ?? 0) > 0).toBe(true);
});

/**
 * Step definitions for validation.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { AddressSchema } from "../../../src/schemas/index.js";
import type { Address } from "../../../src/types/index.js";
import { bddContext as context } from "./bdd-context.js";
import { addressFromFixture, loadAddressFixture } from "./bdd-helpers.js";

Given("length {int} mm", (length: number) => {
    context.letterLength = length;
});

Given("width {int} mm", (width: number) => {
    context.letterWidth = width;
});

Given("height {int} mm", (height: number) => {
    context.letterHeight = height;
});

Given("invalid destination address", () => {
    context.destinationAddress = {
        id: "invalid",
        country_code: "DE",
        postal_code: "",
        locality: "",
        street: "",
    };
});

Given("I have an address with name {string}", (name: string) => {
    context.address = { name };
});

Given("street {string}", (street: string) => {
    context.address = context.address ?? {};
    context.address.street = street;
});

Given("house number {string}", (houseNumber: string) => {
    context.address = context.address ?? {};
    context.address.house_number = houseNumber;
});

Given("postal code {string}", (postalCode: string) => {
    context.address = context.address ?? {};
    context.address.postal_code = postalCode;
});

Given("locality {string}", (locality: string) => {
    context.address = context.address ?? {};
    context.address.locality = locality;
});

Given("country code {string}", (countryCode: string) => {
    context.address = context.address ?? {};
    context.address.country_code = countryCode;
});

Given("missing street", () => {
    context.address = context.address ?? {};
    context.address.street = "";
});

Given("missing postal code", () => {
    context.address = context.address ?? {};
    context.address.postal_code = "";
});

When("I validate the address", async () => {
    const client = context.client!;
    const addressData = context.address ?? context.destinationAddress ?? {};
    const parseResult = AddressSchema.safeParse({
        name: addressData.name ?? "Test",
        street: addressData.street || undefined,
        houseNumber: addressData.house_number || undefined,
        postBox: addressData.post_box || undefined,
        postalCode: addressData.postal_code ?? "",
        locality: addressData.locality ?? "",
        countryCode: addressData.country_code ?? "",
        regionCode: addressData.region_code,
    });
    if (!parseResult.success) {
        context.validationResult = {
            isValid: false,
            errors: parseResult.error.errors.map((err) => err.message),
            warnings: [],
        };
        context.validationErrors = context.validationResult.errors;
        context.validationWarnings = [];
        return;
    }
    const result = await client.address.validate(parseResult.data as Address);
    context.validationResult = result;
    context.validationErrors = result.errors ?? [];
    context.validationWarnings = result.warnings ?? [];
});

Then("the validation should pass", () => {
    expect(context.validationResult?.isValid).toBe(true);
});

Then("the validation should fail", () => {
    expect(context.validationResult?.isValid).toBe(false);
});

Then("there should be no errors", () => {
    expect(context.validationErrors ?? []).toHaveLength(0);
});

Then("I should get an error about invalid dimensions", () => {
    const errors = (context.validationErrors ?? []).join(" ").toLowerCase();
    expect(errors.includes("dimension")).toBe(true);
});

Then("I should get an error about invalid address", () => {
    const errors = (context.validationErrors ?? []).join(" ").toLowerCase();
    expect(
        ["address", "postal", "street", "post_box", "post box", "character", "pattern"].some(
            (token) => errors.includes(token),
        ),
    ).toBe(true);
});

Then("I should get errors about missing required fields", () => {
    expect((context.validationErrors ?? []).length).toBeGreaterThan(0);
});

Then("I should get an error about invalid country code", () => {
    if (context.resolutionError) {
        expect(String(context.resolutionError.code)).toBe("PORTO_DESTINATION_INVALID");
        return;
    }
    const errors = (context.validationErrors ?? []).join(" ").toLowerCase();
    expect(errors.includes("country")).toBe(true);
});

Then("the resolved product id should be {string}", (productId: string) => {
    expect(context.resolvedProductId).toBe(productId);
});

import { describe, expect, it } from "vitest";

import { PositionFactory } from "../../src/adapters/deutschepost/internetmarke/positions.js";

describe("PositionFactory", () => {
    it("includes PNG discriminator and address for labels", () => {
        const pos = new PositionFactory().png({
            productCode: 21,
            markType: "label",
            recipientAddress: {
                name: "A",
                addressLine1: "Street 1",
                postalCode: "10115",
                city: "Berlin",
                country: "DEU",
            },
            senderAddress: {
                name: "B",
                addressLine1: "Street 2",
                postalCode: "10115",
                city: "Berlin",
                country: "DEU",
            },
        });
        const wire = pos.toWire();
        expect(wire.positionType).toBe("AppShoppingCartPosition");
        expect(wire.productCode).toBe(21);
        expect(wire.voucherLayout).toBe("ADDRESS_ZONE");
        expect(wire.address).toBeDefined();
    });

    it("omits address for franking-zone stamps", () => {
        const pos = new PositionFactory().png({
            productCode: 21,
            markType: "stamp",
            recipientAddress: {
                name: "A",
                addressLine1: "Street 1",
                postalCode: "10115",
                city: "Berlin",
                country: "DEU",
            },
            senderAddress: {
                name: "B",
                addressLine1: "Street 2",
                postalCode: "10115",
                city: "Berlin",
                country: "DEU",
            },
        });
        expect(pos.toWire().voucherLayout).toBe("FRANKING_ZONE");
        expect(pos.toWire().address).toBeUndefined();
    });
});

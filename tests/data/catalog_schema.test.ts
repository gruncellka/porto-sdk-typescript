import { describe, expect, it } from "vitest";

import {
    SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE,
    SUPPORTED_PORTO_DATA_VERSION_MIN,
    assertCatalogSchemaSupported,
} from "../../src/data/catalog-schema";
import { ConfigurationError, PortoErrorCode } from "../../src/errors";

describe("assertCatalogSchemaSupported", () => {
    it("accepts the supported porto-data package version", () => {
        expect(
            assertCatalogSchemaSupported({
                project: { version: SUPPORTED_PORTO_DATA_VERSION_MIN },
            }),
        ).toBe(SUPPORTED_PORTO_DATA_VERSION_MIN);
    });

    it("rejects missing package version", () => {
        try {
            assertCatalogSchemaSupported({});
            expect.unreachable("expected ConfigurationError");
        } catch (err) {
            expect(err).toBeInstanceOf(ConfigurationError);
            expect((err as ConfigurationError).code).toBe(PortoErrorCode.PORTO_DATA_INVALID);
        }
    });

    it("rejects malformed package version", () => {
        try {
            assertCatalogSchemaSupported({ project: { version: "not-a-version" } });
            expect.unreachable("expected ConfigurationError");
        } catch (err) {
            expect(err).toBeInstanceOf(ConfigurationError);
            expect((err as ConfigurationError).code).toBe(PortoErrorCode.PORTO_DATA_INVALID);
        }
    });

    it("rejects older package version", () => {
        try {
            assertCatalogSchemaSupported({ project: { version: "0.0.1" } });
            expect.unreachable("expected ConfigurationError");
        } catch (err) {
            expect(err).toBeInstanceOf(ConfigurationError);
            expect((err as ConfigurationError).code).toBe(PortoErrorCode.PORTO_DATA_TOO_OLD);
        }
    });

    it("rejects porto-data package version at max exclusive", () => {
        try {
            assertCatalogSchemaSupported({
                project: { version: SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE },
            });
            expect.unreachable("expected ConfigurationError");
        } catch (err) {
            expect(err).toBeInstanceOf(ConfigurationError);
            expect((err as ConfigurationError).code).toBe(PortoErrorCode.PORTO_DATA_TOO_NEW);
        }
    });
});

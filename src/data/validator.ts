/**
 * Porto Data Validator - Validates against porto-data schemas
 */

import { z } from "zod";
import type { ValidationResult } from "../types/index";
import type { PortoDataLoader } from "./loader";

export class DomainIds {
    constructor(private loader: PortoDataLoader) {}

    getProductIdSchema(): z.ZodEnum<[string, ...string[]]> {
        const products = this.loader.getAllProducts();
        const productIds = products.map((p) => p.id) as [string, ...string[]];
        if (productIds.length === 0) {
            throw new Error("No products found in porto-data");
        }
        return z.enum(productIds);
    }

    getZoneIdSchema(): z.ZodEnum<[string, ...string[]]> {
        const zones = this.loader.getAllZones();
        const zoneIds = zones.map((z) => z.id) as [string, ...string[]];
        if (zoneIds.length === 0) {
            throw new Error("No zones found in porto-data");
        }
        return z.enum(zoneIds);
    }

    /** Validate product_id (provider-native) exists. Uses only getProduct. */
    validateProductId(productId: string): ValidationResult {
        const product = this.loader.getProduct(productId);
        if (product) return { isValid: true, errors: [], warnings: [] };
        return {
            isValid: false,
            errors: [`Product ${productId} not found in porto-data`],
            warnings: [],
        };
    }

    validateZone(zoneId: string): ValidationResult {
        const zone = this.loader.getZone(zoneId);
        if (!zone) {
            return {
                isValid: false,
                errors: [`Zone ${zoneId} not found in porto-data`],
                warnings: [],
            };
        }
        return { isValid: true, errors: [], warnings: [] };
    }

    validateCountryCode(countryCode: string): ValidationResult {
        const zone = this.loader.getZoneByCountryCode(countryCode);
        if (!zone) {
            return {
                isValid: false,
                errors: [`Country ${countryCode} not found in any zone`],
                warnings: [],
            };
        }
        return {
            isValid: true,
            errors: [],
            warnings: [],
            data: { zone },
        };
    }
}

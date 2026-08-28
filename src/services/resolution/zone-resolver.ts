/**
 * Zone Resolver - Resolves zone from country code.
 *
 * Resolution primitive: country_code -> PortoZone via validator + loader.
 */

import type { PortoZone } from "../../data/loader.js";
import type { DomainIds } from "../../data/validator.js";

export interface ZoneResolutionResult {
    isValid: boolean;
    data?: { zone: PortoZone };
    errors?: string[];
}

export class ZoneResolver {
    constructor(private readonly validator: DomainIds) {}

    resolve(countryCode: string): ZoneResolutionResult {
        const result = this.validator.validateCountryCode(countryCode) as {
            isValid: boolean;
            data?: { zone: PortoZone };
            errors?: string[];
        };
        if (!result.isValid || !result.data) {
            return { isValid: false, errors: result.errors };
        }
        return { isValid: true, data: { zone: result.data.zone } };
    }
}

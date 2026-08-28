/**
 * AddressResolver — jurisdiction address forms + external formats.
 *
 * Public accessor remains `client.address`. Format failures populate
 * ValidationResult; mark prepare raises role-specific PORTO_ADDRESS_* codes.
 */

import type { PortoDataLoader } from "../data/loader";
import type { DomainIds } from "../data/validator";
import type { Address, ValidationResult } from "../types/index";

interface GoogleMapsAddress {
    street_number?: string;
    route?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
    administrative_area_level_1?: string;
    formatted_address?: string;
    name?: string;
    address_components?: Array<{
        types: string[];
        short_name?: string;
        long_name?: string;
    }>;
}

interface PostalAPIAddress {
    name?: string;
    address_line1?: string;
    city?: string;
    postal_code?: string;
    state_province?: string;
    country?: string;
    house_number?: string;
}

const FIELD_ATTR: Record<string, keyof Address> = {
    name: "name",
    street: "street",
    house_number: "houseNumber",
    post_box: "postBox",
    postal_code: "postalCode",
    locality: "locality",
    country_code: "countryCode",
    region_code: "regionCode",
};

const LINE_FIELDS = [
    "name",
    "street",
    "house_number",
    "post_box",
    "postal_code",
    "locality",
] as const;

function hasText(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

export class AddressResolver {
    constructor(
        private dataLoader: PortoDataLoader,
        private validator: DomainIds,
    ) {}

    /** Preferred public name: client.address.validate */
    async validate(address: Address): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const data: Record<string, any> = {};

        const basicValidation = await this.validateAddressBasic(address);
        if (!basicValidation.isValid) {
            errors.push(...basicValidation.errors);
        }
        warnings.push(...basicValidation.warnings);
        if (basicValidation.data) {
            Object.assign(data, basicValidation.data);
        }

        if (address.regionCode) {
            const regionValidation = await this.validateRegionCode(
                address.countryCode,
                address.regionCode,
            );
            if (!regionValidation.isValid) {
                warnings.push(...regionValidation.errors);
            }
            if (regionValidation.warnings) {
                warnings.push(...regionValidation.warnings);
            }
            if (regionValidation.data) {
                data.region = regionValidation.data;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            data: Object.keys(data).length > 0 ? data : undefined,
        };
    }

    private async validateAddressBasic(address: Address): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const data: Record<string, any> = {};

        const countryValidation = this.validator.validateCountryCode(address.countryCode);
        if (!countryValidation.isValid) {
            errors.push(...countryValidation.errors);
        }

        const jurisdiction = address.countryCode.toUpperCase();
        const catalog = this.dataLoader.getAddressForm(jurisdiction);
        if (!catalog) {
            return {
                isValid: errors.length === 0,
                errors,
                warnings,
            };
        }

        const formIssues: Array<{
            field: string;
            code: string;
            jurisdiction: string;
            kind?: string;
        }> = [];

        const hasPostBox = hasText(address.postBox);
        const hasStreetLine = hasText(address.street) || hasText(address.houseNumber);

        if (hasPostBox && hasStreetLine) {
            formIssues.push({
                field: "post_box",
                code: "xor",
                jurisdiction,
                kind: "post_box",
            });
            errors.push(
                `post_box: cannot combine with street/house_number for jurisdiction ${jurisdiction}`,
            );
        }

        const kind = hasPostBox ? "post_box" : "street";
        const formKind = catalog.getKind(kind);
        if (!formKind) {
            formIssues.push({
                field: kind === "post_box" ? "post_box" : "street",
                code: "unsupported_kind",
                jurisdiction,
                kind,
            });
            errors.push(`${kind}: form kind not available for jurisdiction ${jurisdiction}`);
        } else {
            for (const fieldName of formKind.required) {
                const attr = FIELD_ATTR[fieldName];
                if (!attr) continue;
                const value = address[attr];
                const missing = fieldName === "country_code" ? !value : !hasText(value);
                if (missing) {
                    formIssues.push({
                        field: fieldName,
                        code: "required",
                        jurisdiction,
                        kind,
                    });
                    errors.push(
                        `${fieldName}: required for ${kind} form in jurisdiction ${jurisdiction}`,
                    );
                }
            }
        }

        if (!catalog.postalCodeRe().test(address.postalCode || "")) {
            formIssues.push({
                field: "postal_code",
                code: "pattern",
                jurisdiction,
                kind,
            });
            errors.push(`postal_code: does not match pattern for jurisdiction ${jurisdiction}`);
        }

        if (catalog.max_line_length != null) {
            const limit = catalog.max_line_length;
            for (const fieldName of LINE_FIELDS) {
                const attr = FIELD_ATTR[fieldName];
                const value = address[attr];
                if (typeof value === "string" && value.length > limit) {
                    formIssues.push({
                        field: fieldName,
                        code: "max_line_length",
                        jurisdiction,
                        kind,
                    });
                    errors.push(
                        `${fieldName}: exceeds max_line_length ${limit} for jurisdiction ${jurisdiction}`,
                    );
                }
            }
        }

        if (formIssues.length > 0) {
            data.form_issues = formIssues;
            data.jurisdiction = jurisdiction;
            data.standard = catalog.standard;
            data.kind = kind;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            data: Object.keys(data).length > 0 ? data : undefined,
        };
    }

    private async validateRegionCode(
        countryCode: string,
        regionCode: string,
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const data: Record<string, any> = {};

        if (regionCode.includes("-")) {
            const parts = regionCode.split("-");
            if (parts.length === 2) {
                const regionCountry = parts[0].toUpperCase();
                const regionSub = parts[1].toUpperCase();
                if (regionCountry !== countryCode) {
                    warnings.push(
                        `Region code country (${regionCountry}) doesn't match ` +
                            `address country (${countryCode})`,
                    );
                }
                data.regionFormat = "iso_3166_2";
                data.regionCountry = regionCountry;
                data.regionSubdivision = regionSub;
            } else {
                warnings.push("Region code format unclear. Expected ISO 3166-2 format (CC-RR)");
            }
        } else {
            data.regionFormat = "simple";
            data.regionCode = regionCode.toUpperCase();
            warnings.push(
                "Region code format not ISO 3166-2. For better compatibility with " +
                    "external APIs, use ISO 3166-2 format (e.g., 'DE-BE' for Berlin, Germany)",
            );
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            data: Object.keys(data).length > 0 ? data : undefined,
        };
    }

    toGoogleMapsFormat(address: Address): GoogleMapsAddress {
        return {
            street_number: address.houseNumber ?? undefined,
            route: address.postBox ? `PO Box ${address.postBox}` : (address.street ?? undefined),
            locality: address.locality,
            postal_code: address.postalCode,
            country: address.countryCode,
            administrative_area_level_1: address.regionCode || undefined,
            formatted_address: this.formatAddress(address),
        };
    }

    fromGoogleMapsFormat(googleAddress: GoogleMapsAddress): Address {
        const components = googleAddress.address_components || [];

        const getComponent = (typeName: string, short = false): string | undefined => {
            for (const comp of components) {
                const types = comp.types || [];
                if (types.includes(typeName)) {
                    return short ? comp.short_name : comp.long_name;
                }
            }
            return undefined;
        };

        const streetNumber = getComponent("street_number");
        const route = getComponent("route");
        const locality = getComponent("locality");
        const postalCode = getComponent("postal_code");
        const country = getComponent("country", true);
        const region = getComponent("administrative_area_level_1", true);

        const streetParts: string[] = [];
        if (streetNumber) streetParts.push(streetNumber);
        if (route) streetParts.push(route);
        const street = streetParts.length > 0 ? streetParts.join(" ") : route || "";

        if (!locality || !postalCode || !country) {
            throw new Error("Missing required address fields from Google Maps format");
        }

        const name = googleAddress.name || googleAddress.formatted_address || "";

        return {
            name: name.substring(0, 100),
            street: street.substring(0, 100) || locality.substring(0, 100),
            houseNumber: streetNumber || "1",
            postalCode,
            locality,
            countryCode: country,
            regionCode: region,
        };
    }

    toPostalAPIFormat(address: Address): PostalAPIAddress {
        const line1 = address.postBox
            ? `PO Box ${address.postBox}`
            : `${address.street ?? ""} ${address.houseNumber ?? ""}`.trim();
        return {
            name: address.name,
            address_line1: line1,
            city: address.locality,
            postal_code: address.postalCode,
            state_province: address.regionCode ?? undefined,
            country: address.countryCode,
        };
    }

    fromPostalAPIFormat(postalAddress: PostalAPIAddress): Address {
        const addressLine1 = postalAddress.address_line1 || "";
        const parts = addressLine1.split(/\s+/);
        let street: string;
        let houseNumber: string;

        if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1];
            if (/^\d+[a-zA-Z]?$/.test(lastPart)) {
                houseNumber = lastPart;
                street = parts.slice(0, -1).join(" ");
            } else {
                street = addressLine1;
                houseNumber = postalAddress.house_number || "1";
            }
        } else {
            street = addressLine1;
            houseNumber = postalAddress.house_number || "1";
        }

        return {
            name: (postalAddress.name || "").substring(0, 100),
            street: street.substring(0, 100),
            houseNumber: houseNumber.substring(0, 10),
            postalCode: postalAddress.postal_code || "",
            locality: postalAddress.city || "",
            countryCode: postalAddress.country || "",
            regionCode: postalAddress.state_province,
        };
    }

    private formatAddress(address: Address): string {
        const line = address.postBox
            ? `PO Box ${address.postBox}`
            : `${address.street ?? ""} ${address.houseNumber ?? ""}`.trim();
        const parts = [line, address.postalCode, address.locality];
        if (address.regionCode) {
            parts.push(address.regionCode);
        }
        parts.push(address.countryCode);
        return parts.filter(Boolean).join(", ");
    }
}

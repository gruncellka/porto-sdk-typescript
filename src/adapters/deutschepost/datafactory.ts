/**
 * Deutsche Post DataFactory API adapter
 */

import type { PortoClient } from "../../client.js";
import { PortoError, PortoErrorCode } from "../../errors.js";
import { HttpClient, type Transport } from "../../transport/http-client.js";
import type { Address, ValidationResult } from "../../types/index.js";

export class DataFactoryAdapter {
    private accessToken: string | null = null;
    private tokenExpiresAt = 0;
    private readonly httpClient: Transport;

    constructor(
        private clientId: string,
        private clientSecret: string,
        private baseUrl = "https://api-eu.dhl.com/datafactory/autocomplete",
        private client?: PortoClient,
        httpClient?: Transport,
    ) {
        this.httpClient = httpClient ?? new HttpClient();
    }

    private async authenticate(): Promise<void> {
        if (this.accessToken && this.tokenExpiresAt) {
            if (Date.now() < this.tokenExpiresAt) {
                return;
            }
        }

        const params = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });

        const response = await this.httpClient.request({
            method: "POST",
            url: `${this.baseUrl}/oauth/token`,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
            idempotent: true,
        });

        if (!response.ok) {
            throw new PortoError(
                "DATAFACTORY authentication failed",
                PortoErrorCode.PORTO_AUTH_FAILED,
                response.status,
                undefined,
                true,
                "deutschepost",
                "datafactory",
            );
        }

        const data = (await response.json()) as Record<string, any>;
        this.accessToken = data.access_token;
        const expiresIn = data.expires_in || 3600;
        this.tokenExpiresAt = Date.now() + expiresIn * 1000;
    }

    async validateAddress(address: Address): Promise<ValidationResult> {
        await this.authenticate();

        const response = await this.httpClient.request({
            method: "POST",
            url: `${this.baseUrl}/v2/validate`,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify({
                name: address.name,
                street: address.street,
                houseNumber: address.houseNumber,
                postalCode: address.postalCode,
                city: address.locality,
                countryCode: address.countryCode,
                regionCode: address.regionCode,
            }),
            idempotent: true,
        });

        if (!response.ok) {
            throw new PortoError(
                "Address validation failed",
                PortoErrorCode.PORTO_MARK_INVALID,
                response.status,
                undefined,
                response.status >= 500,
                "deutschepost",
                "datafactory",
            );
        }

        const data = (await response.json()) as Record<string, any>;
        const issues = data.issues || [];
        const errors = issues
            .filter((i: any) => i.severity === "error")
            .map((i: any) => i.message || "");
        const warnings = issues
            .filter((i: any) => i.severity === "warning")
            .map((i: any) => i.message || "");

        return {
            isValid: data.isValid || false,
            errors,
            warnings,
            data: data.normalizedAddress ? { normalized: data.normalizedAddress } : undefined,
        };
    }

    async validate(address: Address): Promise<ValidationResult> {
        return this.validateAddress(address);
    }
}

export class OfflineDataFactoryAdapter {
    async validateAddress(address: Address): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!address.name || !address.name.trim()) {
            errors.push("Address name is required");
        }

        if (!address.street || !address.street.trim()) {
            errors.push("Street is required");
        }

        if (!address.postalCode || !/^\d+$/.test(address.postalCode)) {
            errors.push("Postal code must be numeric");
        }

        if (!address.countryCode || address.countryCode.length !== 2) {
            errors.push("Country code must be 2 characters");
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    async validate(address: Address): Promise<ValidationResult> {
        return this.validateAddress(address);
    }
}

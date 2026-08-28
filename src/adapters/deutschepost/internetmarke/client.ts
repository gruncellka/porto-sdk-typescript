/**
 * Dumb Internetmarke HTTP client — POST JSON, return status/body/headers.
 */

import type { Transport } from "../../../transport/http-client.js";

export interface HttpJsonResult {
    status: number;
    ok: boolean;
    text: string;
    headers: Record<string, string>;
    json: unknown;
}

export class InternetmarkeClient {
    readonly baseUrl: string;

    constructor(
        baseUrl: string,
        private readonly http: Transport,
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }

    async createCart(
        headers: Record<string, string>,
        idempotencyKey?: string,
    ): Promise<HttpJsonResult> {
        return this.post(`${this.baseUrl}/app/shoppingcart`, {}, headers, idempotencyKey);
    }

    async checkoutPng(
        body: Record<string, unknown>,
        headers: Record<string, string>,
        idempotencyKey?: string,
    ): Promise<HttpJsonResult> {
        return this.post(
            `${this.baseUrl}/app/shoppingcart/png?directCheckout=true`,
            body,
            headers,
            idempotencyKey,
        );
    }

    async checkoutPdf(
        body: Record<string, unknown>,
        headers: Record<string, string>,
        idempotencyKey?: string,
    ): Promise<HttpJsonResult> {
        return this.post(
            `${this.baseUrl}/app/shoppingcart/pdf?directCheckout=true`,
            body,
            headers,
            idempotencyKey,
        );
    }

    private async post(
        url: string,
        body: Record<string, unknown>,
        headers: Record<string, string>,
        idempotencyKey?: string,
    ): Promise<HttpJsonResult> {
        const resp = await this.http.request({
            method: "POST",
            url,
            headers,
            body: JSON.stringify(body),
            idempotent: false,
            idempotencyKey,
        });
        const text = await resp.text();
        let json: unknown;
        try {
            json = text ? JSON.parse(text) : undefined;
        } catch {
            json = undefined;
        }
        return {
            status: resp.status,
            ok: resp.ok,
            text,
            headers: Object.fromEntries(resp.headers.entries()),
            json,
        };
    }
}

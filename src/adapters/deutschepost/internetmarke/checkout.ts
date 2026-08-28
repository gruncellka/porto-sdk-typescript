/**
 * One Internetmarke shopping-cart checkout: init → request → directCheckout.
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import type { ExecutionParameters } from "../../../execution/index.js";
import { HttpClient, type Transport } from "../../../transport/http-client.js";
import type { InternetmarkeAuth } from "./auth.js";
import { type HttpJsonResult, InternetmarkeClient } from "./client.js";
import { InternetmarkeErrorMapper } from "./error-mapper.js";
import type { PdfPosition, PngPosition } from "./positions.js";

const PROVIDER = "deutschepost";
const WIRE = "internetmarke";

export interface CheckoutResult {
    shopOrderId: string;
    link: string;
    headers: Record<string, string>;
    url: string;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
}

export function checkoutTrace(result: CheckoutResult): Record<string, unknown> {
    return {
        url: result.url,
        request: result.request,
        response: result.response,
        response_headers: result.headers,
    };
}

export class InternetmarkeCheckout {
    private readonly baseUrl: string;
    private readonly errors: InternetmarkeErrorMapper;

    constructor(
        private readonly auth: InternetmarkeAuth,
        baseUrl: string,
        private readonly httpClient?: Transport,
        private readonly client?: InternetmarkeClient,
        errors?: InternetmarkeErrorMapper,
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.errors = errors ?? new InternetmarkeErrorMapper();
    }

    async png(input: {
        positions: PngPosition[];
        total: number;
        execution?: ExecutionParameters;
    }): Promise<CheckoutResult> {
        if (!input.positions.length) {
            throw new PortoError(
                "mark(many) requires at least one request",
                PortoErrorCode.PORTO_MARK_INVALID,
                400,
                undefined,
                false,
                PROVIDER,
                WIRE,
            );
        }
        const session = await this.session(input.execution);
        const shopOrderId = await this.createCart(session);
        const body: Record<string, unknown> = {
            type: "AppShoppingCartPNGRequest",
            shopOrderId,
            positions: input.positions.map((position) => position.toWire()),
            total: input.total,
            createManifest: true,
            dpi: "DPI300",
            optimizePNG: true,
        };
        const url = `${session.client.baseUrl}/app/shoppingcart/png?directCheckout=true`;
        return this.checkout(
            () => session.client.checkoutPng(body, session.headers, session.idempotencyKey),
            body,
            url,
            shopOrderId,
            session.requestId,
            input.positions[0]!.productCode,
        );
    }

    async pdf(input: {
        positions: PdfPosition[];
        total: number;
        execution?: ExecutionParameters;
        pageFormatId?: number;
    }): Promise<CheckoutResult> {
        if (!input.positions.length) {
            throw new PortoError(
                "mark(many) requires at least one request",
                PortoErrorCode.PORTO_MARK_INVALID,
                400,
                undefined,
                false,
                PROVIDER,
                WIRE,
            );
        }
        const session = await this.session(input.execution);
        const shopOrderId = await this.createCart(session);
        const body: Record<string, unknown> = {
            type: "AppShoppingCartPDFRequest",
            shopOrderId,
            pageFormatId: input.pageFormatId ?? 2,
            positions: input.positions.map((position) => position.toWire()),
            total: input.total,
            createManifest: true,
            dpi: "DPI300",
        };
        const url = `${session.client.baseUrl}/app/shoppingcart/pdf?directCheckout=true`;
        return this.checkout(
            () => session.client.checkoutPdf(body, session.headers, session.idempotencyKey),
            body,
            url,
            shopOrderId,
            session.requestId,
            input.positions[0]!.productCode,
        );
    }

    private async session(execution?: ExecutionParameters): Promise<{
        headers: Record<string, string>;
        client: InternetmarkeClient;
        requestId: string;
        idempotencyKey?: string;
    }> {
        await this.auth.authenticate();
        const token = this.auth.getToken();
        if (!token) {
            throw new PortoError(
                "Not authenticated",
                PortoErrorCode.PORTO_AUTH_FAILED,
                401,
                {},
                false,
                PROVIDER,
                WIRE,
            );
        }
        const requestId = execution?.requestId ?? "";
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Request-ID": requestId,
        };
        const transport = this.httpClient ?? new HttpClient();
        const client = this.client ?? new InternetmarkeClient(this.baseUrl, transport);
        return {
            headers,
            client,
            requestId,
            idempotencyKey: execution?.idempotencyKey,
        };
    }

    private async createCart(session: {
        headers: Record<string, string>;
        client: InternetmarkeClient;
        requestId: string;
        idempotencyKey?: string;
    }): Promise<string> {
        let init: Awaited<ReturnType<InternetmarkeClient["createCart"]>>;
        try {
            init = await session.client.createCart(session.headers, session.idempotencyKey);
        } catch (error: unknown) {
            if (error instanceof PortoError) throw error;
            throw this.errors.network(error, session.requestId);
        }
        this.errors.raiseIfInitFailed(init, session.requestId);
        const payload =
            init.json && typeof init.json === "object" && !Array.isArray(init.json)
                ? (init.json as Record<string, unknown>)
                : {};
        const shopOrderId = payload.shopOrderId;
        if (typeof shopOrderId !== "string" || !shopOrderId) {
            throw new PortoError(
                "shopOrderId not in init response",
                PortoErrorCode.PORTO_MARK_FAILED,
                500,
                { response: payload, requestId: session.requestId },
                false,
                PROVIDER,
                WIRE,
            );
        }
        return shopOrderId;
    }

    private async checkout(
        send: () => Promise<HttpJsonResult>,
        body: Record<string, unknown>,
        url: string,
        shopOrderId: string,
        requestId: string,
        productCode: number,
    ): Promise<CheckoutResult> {
        let result: HttpJsonResult;
        try {
            result = await send();
        } catch (error: unknown) {
            if (error instanceof PortoError) throw error;
            throw this.errors.network(error, requestId);
        }
        this.errors.raiseIfCheckoutFailed(result, requestId, productCode, body);
        const payload =
            result.json && typeof result.json === "object" && !Array.isArray(result.json)
                ? (result.json as Record<string, unknown>)
                : {};
        const externalId =
            typeof payload.shopOrderId === "string" && payload.shopOrderId
                ? payload.shopOrderId
                : shopOrderId;
        return {
            shopOrderId: externalId,
            link: typeof payload.link === "string" ? payload.link : "",
            headers: result.headers,
            url,
            request: body,
            response: payload,
        };
    }
}

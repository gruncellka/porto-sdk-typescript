/**
 * Deutsche Post Internetmarke adapter
 *
 * Credentials are resolved per call and never written onto adapter instance state.
 */

import type { PortoProduct } from "../../../data/loader.js";
import { PortoError, PortoErrorCode } from "../../../errors.js";
import type { ExecutionParameters, MarkExecution, PortoMark } from "../../../execution/index.js";
import { createBoundMarkFactory, validateOutputMime } from "../../../execution/index.js";
import type { MarkRequest, TrackingStatus } from "../../../types/index.js";
import type { Balance, ExecutionAdapter } from "../../protocols/execution.js";
import { InternetmarkeAuthImpl } from "./auth.js";
import { InternetmarkeCheckout, checkoutTrace } from "./checkout.js";
import { normalizeDocumentPayload } from "./document-payload.js";
import { requireMarkManyPrepared } from "./mark-many-policy.js";
import { PositionFactory, type PositionMark } from "./positions.js";
import { normalizeAddress, requireInternetmarkeProductCode } from "./utils.js";

export class InternetmarkeAdapter implements ExecutionAdapter {
    readonly isOnline = true;
    readonly providerId = "deutschepost";
    readonly wireId = "internetmarke";
    private readonly allowedMimeTypes: string[];
    private readonly apiKey?: string;
    private readonly apiSecret?: string;
    private readonly baseUrl: string;
    private readonly partnerId?: string;
    private readonly httpClient?: import("../../../transport/http-client.js").Transport;
    private readonly defaultUserCredentials?: Record<string, string>;
    lastManyTrace: Record<string, unknown> | null = null;
    private countryCode3Lookup?: (alpha2: string) => string;
    private readonly newMark = createBoundMarkFactory("deutschepost", "internetmarke").newMark;
    private readonly positions = new PositionFactory();

    constructor(
        username?: string,
        password?: string,
        apiKey?: string,
        apiSecret?: string,
        baseUrl = "https://api-eu.dhl.com/post/de/shipping/im/v1",
        partnerId?: string,
        allowedMimeTypes?: string[],
        httpClient?: import("../../../transport/http-client.js").Transport,
        countryCode3Lookup?: (alpha2: string) => string,
    ) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.partnerId = partnerId;
        this.httpClient = httpClient;
        this.allowedMimeTypes = allowedMimeTypes ?? ["image/png", "application/pdf"];
        this.countryCode3Lookup = countryCode3Lookup;
        if (username && password) {
            this.defaultUserCredentials = { username, password };
        }
    }

    setCountryCode3Lookup(lookup: (alpha2: string) => string): void {
        this.countryCode3Lookup = lookup;
    }

    private resolveCountryCode3(alpha2: string): string {
        if (!this.countryCode3Lookup) {
            throw new PortoError(
                "Internetmarke country_code_3 lookup is not bound; use PortoClient.provider()",
                PortoErrorCode.PORTO_MARK_FAILED,
                500,
                undefined,
                false,
                this.providerId,
                this.wireId,
            );
        }
        return this.countryCode3Lookup(alpha2);
    }

    private credentialsFor(execution?: ExecutionParameters): Record<string, string> {
        if (execution?.credentials) return { ...execution.credentials };
        if (this.defaultUserCredentials) return { ...this.defaultUserCredentials };
        return {};
    }

    private authFor(execution?: ExecutionParameters): InternetmarkeAuthImpl {
        const creds = this.credentialsFor(execution);
        const username = creds.username ?? creds.email;
        const password = creds.password;
        const apiKey = creds.dhl_api_key ?? this.apiKey;
        const apiSecret = creds.dhl_api_secret ?? this.apiSecret;
        const partnerId = creds.partner_id ?? this.partnerId;
        if (!username || !password || !apiKey || !apiSecret) {
            throw new PortoError(
                "Authentication could not be completed because credentials are missing, invalid, or expired.",
                PortoErrorCode.PORTO_AUTH_FAILED,
                401,
                undefined,
                false,
                this.providerId,
                this.wireId,
            );
        }
        return new InternetmarkeAuthImpl(
            username,
            password,
            this.baseUrl,
            apiKey,
            apiSecret,
            partnerId,
            this.httpClient,
        );
    }

    async mark(
        request: MarkRequest,
        resolvedProduct?: PortoProduct,
        execution?: ExecutionParameters,
    ): Promise<PortoMark> {
        if (!resolvedProduct) {
            throw new PortoError(
                "Resolved product required for mark creation. " +
                    "Ensure PortoExecution resolves before calling adapter.",
                PortoErrorCode.PORTO_MARK_FAILED,
                400,
                undefined,
                false,
                "deutschepost",
                "internetmarke",
            );
        }
        const requestId = execution?.requestId ?? crypto.randomUUID();
        const productCode = requireInternetmarkeProductCode(request.wireCode);
        const recipientAddress = request.destination
            ? normalizeAddress(request.destination, (c) => this.resolveCountryCode3(c))
            : undefined;
        const senderAddress = request.origin
            ? normalizeAddress(request.origin, (c) => this.resolveCountryCode3(c))
            : undefined;
        const opts = this.bindExecution(execution, requestId, request.idempotencyKey);
        const line: PositionMark = {
            productCode,
            markType: resolvedProduct.mark_type ?? "stamp",
            recipientAddress,
            senderAddress,
        };
        const checkout = this.checkoutFor(execution);
        if (opts.outputMime === "application/pdf") {
            const result = await checkout.pdf({
                positions: [this.positions.pdf(line)],
                total: request.value,
                execution: opts,
            });
            return this.newMark({
                content: result.link,
                contentType: "application/pdf",
                amount: request.value,
                externalId: result.shopOrderId,
            });
        }
        const result = await checkout.png({
            positions: [this.positions.png(line)],
            total: request.value,
            execution: opts,
        });
        return this.newMark({
            content: result.link,
            contentType: "image/png",
            amount: request.value,
            externalId: result.shopOrderId,
        });
    }

    async markMany(
        prepared: MarkExecution[],
        execution?: ExecutionParameters,
    ): Promise<PortoMark[]> {
        requireMarkManyPrepared(prepared);
        const requestId = execution?.requestId ?? crypto.randomUUID();
        const values: number[] = [];
        let firstIdempotency: string | undefined;
        const lines: PositionMark[] = [];
        for (const item of prepared) {
            const req = item.request;
            firstIdempotency ??= req.idempotencyKey ?? execution?.idempotencyKey;
            if (!item.resolvedProduct) {
                throw new PortoError(
                    "Resolved product required for mark creation. " +
                        "Ensure PortoExecution resolves before calling adapter.",
                    PortoErrorCode.PORTO_MARK_FAILED,
                    400,
                    undefined,
                    false,
                    "deutschepost",
                    "internetmarke",
                );
            }
            const productCode = requireInternetmarkeProductCode(req.wireCode);
            lines.push({
                productCode,
                recipientAddress: req.destination
                    ? normalizeAddress(req.destination, (c) => this.resolveCountryCode3(c))
                    : undefined,
                senderAddress: req.origin
                    ? normalizeAddress(req.origin, (c) => this.resolveCountryCode3(c))
                    : undefined,
                markType: item.markType ?? item.resolvedProduct.mark_type ?? "stamp",
            });
            values.push(req.value);
        }
        const opts = this.bindExecution(execution, requestId, firstIdempotency);
        const checkout = this.checkoutFor(execution);
        const total = values.reduce((sum, value) => sum + value, 0);
        if (opts.outputMime === "application/pdf") {
            const result = await checkout.pdf({
                positions: lines.map((line) => this.positions.pdf(line)),
                total,
                execution: opts,
            });
            this.lastManyTrace = checkoutTrace(result);
            return values.map((value) =>
                this.newMark({
                    content: result.link,
                    contentType: "application/pdf",
                    amount: value,
                    externalId: result.shopOrderId,
                }),
            );
        }
        const result = await checkout.png({
            positions: lines.map((line) => this.positions.png(line)),
            total,
            execution: opts,
        });
        this.lastManyTrace = checkoutTrace(result);
        return values.map((value) =>
            this.newMark({
                content: result.link,
                contentType: "image/png",
                amount: value,
                externalId: result.shopOrderId,
            }),
        );
    }

    private bindExecution(
        execution: ExecutionParameters | undefined,
        requestId: string,
        idempotencyKey?: string,
    ): ExecutionParameters {
        return {
            ...execution,
            requestId,
            idempotencyKey: idempotencyKey ?? execution?.idempotencyKey,
            outputMime: validateOutputMime(
                execution?.outputMime ?? "image/png",
                this.allowedMimeTypes,
            ) as ExecutionParameters["outputMime"],
        };
    }

    private checkoutFor(execution?: ExecutionParameters): InternetmarkeCheckout {
        return new InternetmarkeCheckout(this.authFor(execution), this.baseUrl, this.httpClient);
    }

    async trackStamp(trackingNumber: string): Promise<TrackingStatus> {
        throw new PortoError(
            "Tracking not available for INTERNETMARKE stamps",
            PortoErrorCode.PORTO_TRACKING_UNSUPPORTED,
            501,
            {
                provider_id: "deutschepost",
                wire: "internetmarke",
                tracking_kind: "stamp",
                tracking_number: trackingNumber,
            },
            false,
            "deutschepost",
            "internetmarke",
        );
    }

    async balance(execution?: ExecutionParameters): Promise<Balance> {
        const auth = this.authFor(execution);
        await auth.authenticate();
        const balanceCents = auth.getWalletBalanceCents();
        if (balanceCents === null) {
            throw new PortoError(
                "Wallet balance not returned by provider",
                PortoErrorCode.PORTO_MARK_FAILED,
                502,
                undefined,
                false,
                this.providerId,
                this.wireId,
            );
        }
        return {
            balanceCents,
            currency: "EUR",
            provider: this.providerId,
            wire: this.wireId,
            accountRef: null,
            asOf: new Date(),
            billingModel: "prepaid",
        };
    }

    normalizeDocument(payload: Uint8Array): Uint8Array {
        return normalizeDocumentPayload(payload);
    }

    async health() {
        const { CapabilityState } = await import("../../../states.js");
        return { state: CapabilityState.Ready };
    }
}

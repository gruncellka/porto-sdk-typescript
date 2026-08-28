/**
 * PortoExecution — prepare and execute marks via ExecutionAdapter.
 */

import type { ExecutionAdapter } from "../adapters/protocols/execution.js";
import { UnavailableExecutionAdapter } from "../adapters/unavailable-adapter.js";
import type { PortoDataLoader } from "../data/loader.js";
import { PortoError, PortoErrorCode } from "../errors.js";
import type {
    ExecutionParameters,
    MarkExecution,
    PortoMark,
    PortoMarkRequest,
} from "../execution/index.js";
import {
    DEFAULT_MARK_OUTPUT_MIME,
    parseMarkType,
    parseTrackingMode,
    validateOutputMime,
} from "../execution/index.js";
import {
    DEFAULT_MARK_FETCH_RETRIES,
    DEFAULT_MARK_FETCH_TIMEOUT,
    type FetchMarkBytesOptions,
    fetchMarkBytes,
} from "../mark-content.js";
import { RECIPIENT, SENDER } from "../requires.js";
import type { Address, MarkRequest, ValidationResult } from "../types/index.js";
import { ExecutionBinding } from "./execution-binding.js";
import type { PortoResolver } from "./porto-resolver.js";
import type { LetterValidationService } from "./validation.js";
import { selectWire } from "./wire-selection.js";

function addressInvalidDetails(
    result: ValidationResult,
    countryCode: string,
): Record<string, unknown> {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const issues = (data.form_issues as Array<Record<string, string>>) || [];
    const first = issues[0] ?? {};
    const details: Record<string, unknown> = { country_code: countryCode };
    if (typeof data.jurisdiction === "string") {
        details.jurisdiction = data.jurisdiction;
    } else if (countryCode) {
        details.jurisdiction = countryCode.toUpperCase();
    }
    if (first.field) details.field = first.field;
    if (first.code) details.reason = first.code;
    if (issues.length) details.form_issues = issues;
    return details;
}

/** Mark prepare/post via ExecutionBinding + adapters (not a second resolver). */
export class PortoExecution {
    private _api: ExecutionAdapter;
    private _resolver?: PortoResolver;
    private _validation?: LetterValidationService;
    private _binding: ExecutionBinding;

    constructor(
        private dataLoader: PortoDataLoader,
        api?: ExecutionAdapter,
        resolver?: PortoResolver,
        validation?: LetterValidationService,
    ) {
        this._api = api ?? new UnavailableExecutionAdapter(dataLoader.providerId, "none");
        this._resolver = resolver;
        this._validation = validation;
        this._binding = new ExecutionBinding(dataLoader);
    }

    get api(): ExecutionAdapter {
        return this._api;
    }

    set api(value: ExecutionAdapter) {
        this._api = value;
    }

    setResolver(resolver: PortoResolver): void {
        this._resolver = resolver;
    }

    setValidation(validation: LetterValidationService): void {
        this._validation = validation;
    }

    private async role(
        address: Address | undefined,
        opts: {
            required: boolean;
            missing: PortoErrorCode;
            invalid: PortoErrorCode;
            role: string;
        },
    ): Promise<Address | undefined> {
        if (!opts.required) return undefined;
        if (!address) {
            throw new PortoError(
                `${opts.role} address is required for this resolved Porto`,
                opts.missing,
                400,
                { role: opts.role },
                false,
            );
        }
        if (this._validation) {
            const result = await this._validation.validateAddress(address);
            if (!result.isValid) {
                throw new PortoError(
                    `Invalid ${opts.role} address: ${result.errors.join(", ")}`,
                    opts.invalid,
                    400,
                    addressInvalidDetails(result, address.countryCode),
                    false,
                );
            }
        }
        return address;
    }

    async prepare(request: PortoMarkRequest): Promise<MarkExecution> {
        const porto = request.porto;
        const sender = await this.role(request.sender, {
            required: porto.requires.includes(SENDER),
            missing: PortoErrorCode.PORTO_ADDRESS_SENDER_REQUIRED,
            invalid: PortoErrorCode.PORTO_ADDRESS_SENDER_INVALID,
            role: "sender",
        });
        const recipient = await this.role(request.recipient, {
            required: porto.requires.includes(RECIPIENT),
            missing: PortoErrorCode.PORTO_ADDRESS_RECIPIENT_REQUIRED,
            invalid: PortoErrorCode.PORTO_ADDRESS_RECIPIENT_INVALID,
            role: "recipient",
        });
        const serviceIds = [...porto.serviceIds];
        const binding = this._binding.bind({
            wire: this._api.wireId,
            productId: porto.product.id,
            zoneId: porto.zone.id,
            serviceIds: serviceIds.length ? serviceIds : undefined,
        });
        const markProfileId = binding.markProfileId;
        const profile = markProfileId
            ? this.dataLoader.getMarkProfile(markProfileId)
            : this.dataLoader.getDefaultMarkProfile();
        const allowed = profile?.mime_types?.length
            ? [...profile.mime_types]
            : ["image/png", "application/pdf"];
        const totalMinor = porto.amount;
        const adapterRequest: MarkRequest = {
            destination: recipient,
            origin: sender,
            value: totalMinor,
            idempotencyKey: request.idempotency,
            wireCode: binding.wireCode,
        };
        return {
            porto,
            request: adapterRequest,
            preCalculatedPrice: totalMinor,
            markProfileId: markProfileId ?? profile?.id,
            allowedMimeTypes: allowed,
            zoneId: porto.zone.id,
            productId: porto.product.id,
            wireCode: binding.wireCode,
            markType: parseMarkType(porto.markType),
            tracking: parseTrackingMode(porto.tracking ?? porto.product.tracking),
            resolvedProduct: porto.product,
        };
    }

    private async one(
        request: PortoMarkRequest,
        execution?: ExecutionParameters,
    ): Promise<PortoMark> {
        let opts: ExecutionParameters = { ...execution };
        const wire = selectWire({
            providerId: this.dataLoader.providerId,
            operation: "mark",
            pin: opts.wire,
            dataPath: this.dataLoader.dataPath,
        });
        if (this._api.wireId !== wire) {
            throw new PortoError(
                `mark is not supported for wire ${JSON.stringify(wire)}`,
                PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
                501,
                { capability: "mark", provider_id: this.dataLoader.providerId, wire },
                false,
                this.dataLoader.providerId,
                wire,
            );
        }
        const prepared = await this.prepare(request);
        if (request.mime) opts = { ...opts, outputMime: request.mime };
        if (request.idempotency && !opts.idempotencyKey) {
            opts = { ...opts, idempotencyKey: request.idempotency };
        }
        return this.execute(prepared, 0, opts);
    }

    private async many(
        requests: PortoMarkRequest[],
        execution?: ExecutionParameters,
    ): Promise<PortoMark[]> {
        if (!requests.length) {
            throw new PortoError(
                "mark(many) requires at least one request",
                PortoErrorCode.PORTO_MARK_INVALID,
                400,
                undefined,
                false,
            );
        }
        const opts: ExecutionParameters = { ...execution };
        const wire = selectWire({
            providerId: this.dataLoader.providerId,
            operation: "mark",
            pin: opts.wire,
            dataPath: this.dataLoader.dataPath,
        });
        if (this._api.wireId !== wire) {
            throw new PortoError(
                `mark is not supported for wire ${JSON.stringify(wire)}`,
                PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
                501,
                { capability: "mark", provider_id: this.dataLoader.providerId, wire },
                false,
                this.dataLoader.providerId,
                wire,
            );
        }
        const prepared: MarkExecution[] = [];
        for (const item of requests) {
            prepared.push(await this.prepare(item));
        }
        const markMany = this._api.markMany?.bind(this._api);
        if (markMany) {
            return markMany(prepared, opts);
        }
        const marks: PortoMark[] = [];
        for (const row of prepared) {
            marks.push(await this.execute(row, 0, opts));
        }
        return marks;
    }

    async mark(request: PortoMarkRequest, execution?: ExecutionParameters): Promise<PortoMark>;
    async mark(request: PortoMarkRequest[], execution?: ExecutionParameters): Promise<PortoMark[]>;
    async mark(
        request: PortoMarkRequest | PortoMarkRequest[],
        execution?: ExecutionParameters,
    ): Promise<PortoMark | PortoMark[]> {
        if (Array.isArray(request)) {
            return this.many(request, execution);
        }
        return this.one(request, execution);
    }

    async execute(
        prepared: MarkExecution,
        _weight: number,
        execution?: ExecutionParameters,
    ): Promise<PortoMark> {
        if (!prepared.resolvedProduct) {
            throw new PortoError(
                "MarkExecution missing resolvedProduct; call prepare first",
                PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
                422,
                undefined,
                false,
            );
        }
        const outputMime = validateOutputMime(
            execution?.outputMime ?? DEFAULT_MARK_OUTPUT_MIME,
            prepared.allowedMimeTypes,
        ) as ExecutionParameters["outputMime"];
        const mark = await this._api.mark(prepared.request, prepared.resolvedProduct, {
            ...execution,
            outputMime,
        });
        return mark;
    }

    async bytes(
        mark: PortoMark,
        options?: Omit<FetchMarkBytesOptions, "httpClient">,
    ): Promise<Uint8Array> {
        return fetchMarkBytes(mark, {
            retries: options?.retries ?? DEFAULT_MARK_FETCH_RETRIES,
            timeout: options?.timeout ?? DEFAULT_MARK_FETCH_TIMEOUT,
            backoff: options?.backoff,
            normalize: (payload) => this._api.normalizeDocument(payload),
        });
    }
}

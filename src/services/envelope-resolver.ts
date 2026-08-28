import type { PortoEnvelope } from "../data/entities/envelopes";
import type { PortoDataLoader } from "../data/loader";
import { EnvelopeMatchService, JsonFormatCatalog } from "../envelopes/match";
import type { Match } from "../envelopes/types";
import type {
    Envelope,
    EnvelopeGeometry,
    EnvelopeLayout,
    EnvelopeMark,
    EnvelopeMarkFact,
    EnvelopeRect,
    EnvelopeSheet,
} from "../envelopes/types";
import { PortoError, PortoErrorCode } from "../errors";
import type { Dimensions } from "../types/index";
import { ExecutionBinding } from "./execution-binding";
import { WeightTierResolver } from "./resolution/weight-tier-resolver";
import type { LetterValidationService } from "./validation";

export type EnvelopeFold = "flat" | "half" | "quarter" | "trifold";

export function formatEnvelopeSheets(envelope: PortoEnvelope): EnvelopeSheet[] {
    const rows: EnvelopeSheet[] = [];
    for (const raw of envelope.sheets ?? []) {
        const sheet = String(raw.sheet ?? "").trim();
        const fold = String(raw.fold ?? "").trim() as EnvelopeFold;
        if (!sheet || !fold) continue;
        const row: EnvelopeSheet = { sheet, fold };
        if (raw.description) row.description = String(raw.description);
        rows.push(row);
    }
    return rows;
}

export interface IdentifyEnvelopeInput {
    format?: string;
    dimensions?: Partial<Dimensions>;
    weight: number;
}

export interface EnvelopeIdentity {
    dimensions: Dimensions;
    format: string | null;
    resolutionWeight: number;
}

/** Public catalog façade for `client.envelopes`. */
export interface Envelopes {
    list(): Envelope[];
    geometry(envelopeId: string, jurisdiction?: string): EnvelopeGeometry;
    layout(
        envelopeId: string,
        jurisdiction?: string,
        productId?: string,
        options?: { zoneId?: string; serviceIds?: string[] },
    ): EnvelopeLayout;
    getMark(
        productId?: string,
        options?: { envelopeId?: string; zoneId?: string; serviceIds?: string[] },
    ): EnvelopeMark;
    identify(input: IdentifyEnvelopeInput): Promise<EnvelopeIdentity>;
    validateForProduct(envelopeId: string, productId: string): Match;
    resolve(candidate: Record<string, unknown>, productId: string, mode?: string): Match;
}

/** @internal */
export class EnvelopeResolverService implements Envelopes {
    private readonly matchService: EnvelopeMatchService;
    private readonly executionBinding: ExecutionBinding;

    constructor(
        private readonly validation: LetterValidationService,
        private readonly dataLoader: PortoDataLoader,
    ) {
        this.matchService = new EnvelopeMatchService(
            new JsonFormatCatalog(dataLoader.envelopesLoader),
        );
        this.executionBinding = new ExecutionBinding(dataLoader);
    }

    listSupportedFormats(): string[] {
        return Object.keys(this.getEnvelopeFormatMap()) as string[];
    }

    normalizeEnvelopeFormat(input: string): string {
        const normalized = input
            .trim()
            .toUpperCase()
            .replace(/[\s_-]+/g, "");
        if (normalized in this.getEnvelopeFormatMap()) {
            return normalized as string;
        }
        throw new Error(
            `Unknown envelope format: ${input}. Supported formats: ${this.listSupportedFormats().join(", ")}.`,
        );
    }

    parseEnvelopeDimensions(input: IdentifyEnvelopeInput): Dimensions {
        const hasFormat = typeof input.format === "string" && input.format.trim().length > 0;
        const dimensions = input.dimensions ?? {};
        const hasAnyDimensions =
            dimensions.length !== undefined ||
            dimensions.width !== undefined ||
            dimensions.height !== undefined;

        if (hasFormat && hasAnyDimensions) {
            throw new Error("Use either --format OR --length --width --height, not both.");
        }

        if (hasFormat) {
            const format = this.normalizeEnvelopeFormat(input.format as string);
            return this.getEnvelopeFormatMap()[format];
        }

        const length = Number(dimensions.length);
        const width = Number(dimensions.width);
        const height = Number(dimensions.height);
        const thicknessRaw = dimensions.thickness;

        if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) {
            throw new Error(
                "Provide --format (e.g., C5) or all of --length --width --height in mm.",
            );
        }

        const resolved: Dimensions = { length, width, height };
        if (thicknessRaw !== undefined) {
            const thickness = Number(thicknessRaw);
            if (!Number.isFinite(thickness)) {
                throw new Error("Invalid --thickness value. Must be a number in mm.");
            }
            resolved.thickness = thickness;
        }
        return resolved;
    }

    detectEnvelopeFormat(dimensions: Dimensions): string | null {
        for (const [format, spec] of Object.entries(this.getEnvelopeFormatMap())) {
            const sameOrientation =
                dimensions.length === spec.length &&
                dimensions.width === spec.width &&
                dimensions.height === spec.height;
            const swappedOrientation =
                dimensions.length === spec.width &&
                dimensions.width === spec.length &&
                dimensions.height === spec.height;
            if (sameOrientation || swappedOrientation) {
                return format as string;
            }
        }
        return null;
    }

    async identify(input: IdentifyEnvelopeInput): Promise<EnvelopeIdentity> {
        const dimensions = this.parseEnvelopeDimensions(input);
        const dimensionValidation = await this.validation.validateDimensions(dimensions);
        if (!dimensionValidation.isValid) {
            throw new Error(`Invalid dimensions: ${dimensionValidation.errors.join("; ")}`);
        }

        const weightTierId = new WeightTierResolver(this.dataLoader).resolve(input.weight);
        if (!weightTierId) {
            throw new PortoError(
                `Weight ${input.weight}g exceeds maximum`,
                PortoErrorCode.PORTO_TOO_HEAVY,
                400,
                { weight: input.weight },
            );
        }

        const format = this.detectEnvelopeFormat(dimensions);
        return {
            dimensions,
            format,
            resolutionWeight: input.weight,
        };
    }

    listPolicyFormatIds(): string[] {
        return this.dataLoader.listEnvelopes().map((e) => e.id);
    }

    list(): Envelope[] {
        return this.dataLoader.listEnvelopes().map((e) => ({
            id: e.id,
            name: e.label,
            width: e.width,
            height: e.height,
            sheets: formatEnvelopeSheets(e),
        }));
    }

    geometry(envelopeId: string, jurisdiction?: string): EnvelopeGeometry {
        const envelope = this.requireEnvelope(envelopeId);
        const payload: EnvelopeGeometry = {
            id: envelope.id,
            name: envelope.label,
            width: envelope.width,
            height: envelope.height,
            sheets: formatEnvelopeSheets(envelope),
        };
        const window = this.windowRect(envelopeId, jurisdiction);
        if (window) payload.window = window;
        if (envelope.notes) payload.notes = envelope.notes;
        return payload;
    }

    layout(
        envelopeId: string,
        jurisdiction?: string,
        productId?: string,
        options?: { zoneId?: string; serviceIds?: string[] },
    ): EnvelopeLayout {
        const envelope = this.requireEnvelope(envelopeId);
        const payload: EnvelopeLayout = {
            envelopeId,
            width: envelope.width,
            height: envelope.height,
        };
        const window = this.windowRect(envelopeId, jurisdiction);
        if (window) payload.window = window;
        const mark = this.layoutMark({
            envelopeId,
            productId,
            zoneId: options?.zoneId,
            serviceIds: options?.serviceIds,
        });
        if (mark) payload.mark = mark;
        return payload;
    }

    getMark(
        productId?: string,
        options?: {
            envelopeId?: string;
            zoneId?: string;
            serviceIds?: string[];
        },
    ): EnvelopeMark {
        const mark = this.layoutMark({
            envelopeId: options?.envelopeId,
            productId,
            zoneId: options?.zoneId,
            serviceIds: options?.serviceIds,
        });
        if (!mark) {
            throw new PortoError(
                "Mark profile not found",
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                404,
            );
        }
        const payload: EnvelopeMark = {
            providerId: this.dataLoader.providerId,
            profileId: mark.profileId,
            type: mark.type,
            size: mark.size,
        };
        if (productId !== undefined) payload.productId = productId;
        if (options?.zoneId !== undefined) payload.zoneId = options.zoneId;
        if (mark.clearance !== undefined) payload.clearance = mark.clearance;
        if (mark.placement) payload.placement = mark.placement;
        return payload;
    }

    match(envelopeId: string, productId: string): Match {
        const product = this.dataLoader.getProduct(productId);
        if (!product) {
            throw new PortoError(
                `Product not found: ${productId}`,
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                404,
            );
        }
        return this.matchService.resolveById(envelopeId, product);
    }

    validateForProduct(envelopeId: string, productId: string): Match {
        return this.match(envelopeId, productId);
    }

    resolve(candidate: Record<string, unknown>, productId: string, _mode?: string): Match {
        const product = this.dataLoader.getProduct(productId);
        if (!product) {
            throw new PortoError(
                `Product not found: ${productId}`,
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                404,
            );
        }
        const kind = String(candidate.kind ?? "by_id");
        if (kind === "by_dimensions") {
            return this.matchService.resolveByDimensions(
                Number(candidate.width ?? candidate.width_mm),
                Number(candidate.height ?? candidate.height_mm),
                product,
            );
        }
        const envelopeId = String(candidate.envelope_id ?? candidate.envelopeId ?? "");
        return this.matchService.resolveById(envelopeId, product);
    }

    private requireEnvelope(envelopeId: string): PortoEnvelope {
        const envelope = this.dataLoader.getEnvelope(envelopeId);
        if (!envelope) {
            throw new PortoError(
                `Envelope not found: ${envelopeId}`,
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                404,
            );
        }
        return envelope;
    }

    private windowRect(envelopeId: string, jurisdiction?: string): EnvelopeRect | undefined {
        if (!jurisdiction) return undefined;
        const layout = this.dataLoader.getLayout(jurisdiction, envelopeId);
        if (!layout?.window_supported || !layout.window_area) return undefined;
        return {
            x: layout.window_area.x,
            y: layout.window_area.y,
            width: layout.window_area.width,
            height: layout.window_area.height,
        };
    }

    private layoutMark(input: {
        envelopeId?: string;
        productId?: string;
        zoneId?: string;
        serviceIds?: string[];
    }): EnvelopeMarkFact | undefined {
        const profileId = this.executionBinding.resolveMarkProfileId({
            zoneId: input.zoneId ?? null,
            serviceIds: input.serviceIds ?? null,
        });
        const profile = profileId
            ? this.dataLoader.getMarkProfile(profileId)
            : this.dataLoader.getDefaultMarkProfile();
        if (!profile) return undefined;
        const row: EnvelopeMarkFact = {
            type: profile.mark_type,
            size: { width: profile.width, height: profile.height },
            profileId: profile.id,
        };
        if (profile.clearance !== undefined) {
            row.clearance = profile.clearance;
        }
        if (input.envelopeId) {
            const placement = this.dataLoader.getMarkPlacement(input.envelopeId);
            if (placement) {
                row.placement = {
                    x: placement.x,
                    y: placement.y,
                    width: placement.width,
                    height: placement.height,
                };
            }
        }
        return row;
    }

    private getEnvelopeFormatMap(): Record<string, Dimensions> {
        const result: Record<string, Dimensions> = {};
        for (const envelope of this.dataLoader.listEnvelopes()) {
            const shortEdge = Math.min(envelope.width, envelope.height);
            const longEdge = Math.max(envelope.width, envelope.height);
            result[envelope.id.toUpperCase()] = {
                length: shortEdge,
                width: longEdge,
                height: 5,
            };
        }
        if (Object.keys(result).length > 0) {
            return result;
        }
        for (const raw of this.dataLoader.getAllDimensions() as Array<Record<string, unknown>>) {
            const dimensionId = String(raw?.id ?? "")
                .trim()
                .toUpperCase();
            const normalized = this.normalizeDataDimension(raw);
            if (!dimensionId || !normalized) continue;
            result[dimensionId] = normalized;
        }
        return result;
    }

    private normalizeDataDimension(raw: Record<string, unknown>): Dimensions | null {
        const size = raw?.size;
        if (!size || typeof size !== "object") return null;
        const sizeRecord = size as Record<string, unknown>;
        const width = Number(sizeRecord.width);
        const height = Number(sizeRecord.height);
        const thickness = Number(sizeRecord.thickness);
        if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(thickness)) {
            return null;
        }
        const shortEdge = Math.min(width, height);
        const longEdge = Math.max(width, height);
        return {
            length: shortEdge,
            width: longEdge,
            height: thickness,
        };
    }
}

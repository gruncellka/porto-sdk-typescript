/**
 * Letter Validation Service
 *
 * Implements SOLID principles:
 * - Single Responsibility: Handles letter validation only
 * - Open/Closed: Extensible via interfaces/protocols
 * - Dependency Inversion: Depends on abstractions (PortoResolver, DomainIds)
 *
 * Uses Zod for runtime validation matching Pydantic in Python SDK
 */

import type { DomainIds } from "../data/validator";
import { PortoError, PortoErrorCode } from "../errors";
import { AddressSchema, DimensionsSchema } from "../schemas/index";
import type { Address, Dimensions, ValidationResult } from "../types/index";
import type { AddressResolver } from "./address.js";
import type { PortoResolver } from "./porto-resolver.js";

export class LetterValidationService {
    constructor(
        private resolver: PortoResolver,
        private validator: DomainIds,
        private addressService: AddressResolver,
    ) {}

    async validateAddress(address: Address): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const addressResult = AddressSchema.safeParse(address);
        if (!addressResult.success) {
            errors.push(
                ...addressResult.error.issues.map((issue) => {
                    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
                    return `${path}${issue.message}`;
                }),
            );
            return { isValid: false, errors, warnings };
        }

        return this.addressService.validate(address);
    }

    async validateDimensions(dimensions: Dimensions): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const dimResult = DimensionsSchema.safeParse(dimensions);
        if (!dimResult.success) {
            errors.push(
                ...dimResult.error.issues.map((issue) => {
                    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
                    return `${path}${issue.message}`;
                }),
            );
            return { isValid: false, errors, warnings };
        }

        if (dimensions.length < 1 || dimensions.width < 1) {
            errors.push("Length and width must be positive");
        }

        if (dimensions.width > 0) {
            const aspectRatio = dimensions.length / dimensions.width;
            if (aspectRatio < 1.0 || aspectRatio > 2.0) {
                warnings.push(
                    `Unusual aspect ratio (${aspectRatio.toFixed(2)}); ` +
                        `many letter formats are typically 1.0-2.0`,
                );
            }
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    identifyCandidateProducts(dimensions: Dimensions, weight: number): string[] {
        const maxWeight = this.maxWeight();
        if (weight > maxWeight) {
            throw new PortoError(
                `Weight ${weight}g exceeds maximum ${maxWeight}g`,
                PortoErrorCode.PORTO_TOO_HEAVY,
                400,
                { weight, max_weight: maxWeight },
            );
        }
        const dimensionProducts = this.findProductsByDimensions(
            dimensions.length,
            dimensions.width,
            dimensions.height,
            dimensions.thickness ?? undefined,
        );
        const weightProducts = this.findProductsByWeight(weight);
        const dimIds = new Set(dimensionProducts.map((product) => product.id));
        if (dimIds.size > 0) {
            const both = weightProducts.filter((product) => dimIds.has(product.id));
            return (both.length > 0 ? both : dimensionProducts).map((product) => product.id);
        }
        return weightProducts.map((product) => product.id);
    }

    private findProductsByDimensions(
        length: number,
        width: number,
        height: number,
        thickness?: number,
    ) {
        const matching: ReturnType<PortoResolver["listProducts"]> = [];
        const products = this.resolver.listProducts();
        const dimensions = this.resolver.listDimensions();
        for (const dim of dimensions) {
            const size = (dim.size ?? {}) as Record<string, number>;
            const dimLength = size.width ?? 0;
            const dimWidth = size.height ?? 0;
            const dimThick = size.thickness ?? 0;
            if (
                length <= dimLength &&
                width <= dimWidth &&
                height <= dimThick &&
                (thickness === undefined || thickness <= dimThick)
            ) {
                const dimId = dim.id as string | undefined;
                for (const product of products) {
                    if (
                        dimId &&
                        (product.envelope_ids ?? []).includes(dimId) &&
                        !matching.includes(product)
                    ) {
                        matching.push(product);
                    }
                }
            }
        }
        return matching;
    }

    private findProductsByWeight(weight: number) {
        const weightTierId = this.resolver.weightTierResolver.resolve(weight);
        if (!weightTierId) {
            return [];
        }
        const zones = this.resolver.listZones();
        return this.resolver
            .listProducts()
            .filter((product) =>
                zones.some((zone) =>
                    this.resolver.productResolver.isValidCombination(
                        product.id,
                        zone.id,
                        weightTierId,
                    ),
                ),
            );
    }

    private maxWeight(): number {
        const tiers = this.resolver.listWeightTiers();
        if (tiers.length === 0) {
            return 1000;
        }
        return Math.max(...tiers.map((tier) => tier.max_weight));
    }
}

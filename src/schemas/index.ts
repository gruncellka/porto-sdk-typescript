/**
 * Zod schemas for runtime validation
 *
 * These schemas match the Pydantic models in the Python SDK
 * to ensure identical validation behavior across both SDKs.
 * Public field shapes for surface extraction live in types/ (interfaces);
 * keep those interfaces aligned with these schemas.
 */

import { z } from "zod";

/**
 * Dimensions schema — provider-specific limits live in porto-data.
 */
export const DimensionsSchema = z
    .object({
        length: z.number().int().min(1).max(2000).describe("Length in mm"),
        width: z.number().int().min(1).max(2000).describe("Width in mm"),
        height: z.number().int().min(0).max(2000).describe("Height in mm"),
        thickness: z
            .number()
            .int()
            .min(0)
            .max(2000)
            .optional()
            .describe("Thickness in mm (optional)"),
    })
    .strict();

const optionalTrimmed = (max: number) =>
    z
        .string()
        .max(max)
        .trim()
        .optional()
        .transform((v) => (v && v.length > 0 ? v : undefined));

/**
 * Address schema — jurisdiction forms validated in AddressResolver; provider wire ACL in adapters.
 * Street vs postBox: XOR enforced in AddressResolver (catalog forms).
 */
export const AddressSchema = z
    .object({
        name: z.string().min(1).max(100).trim().describe("Recipient/sender name"),
        street: optionalTrimmed(100).describe("Street name (street form)"),
        houseNumber: optionalTrimmed(20).describe("House number (street form)"),
        postBox: optionalTrimmed(40).describe("Post box id (post_box form)"),
        postalCode: z.string().min(1).max(16).trim().describe("Postal / ZIP code"),
        locality: z.string().min(1).max(100).trim().describe("Locality (town / place / city)"),
        countryCode: z
            .string()
            .length(2)
            .transform((v) => v.trim().toUpperCase())
            .describe("ISO 3166-1 alpha-2 country code"),
        regionCode: z.string().max(10).optional().describe("Optional region code"),
    })
    .strict();

/** Inferred runtime types — prefer types/ interfaces for public barrel exports. */
export type DimensionsInferred = z.infer<typeof DimensionsSchema>;
export type AddressInferred = z.infer<typeof AddressSchema>;

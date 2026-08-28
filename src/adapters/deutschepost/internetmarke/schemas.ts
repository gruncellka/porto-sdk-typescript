/**
 * Zod validation schemas for Deutsche Post Internetmarke API
 */

import { z } from "zod";

export const InternetmarkeAddressSchema = z
    .object({
        name: z.string().min(1).max(100).trim(),
        street: z.string().min(1).max(100).trim(),
        houseNumber: z.string().min(1).max(10).trim(),
        postalCode: z.preprocess(
            (value) => {
                if (typeof value !== "string") return value;
                const cleaned = value.trim().replace(/[\s-]/g, "");
                return /^\d+$/.test(cleaned) ? cleaned.padStart(5, "0") : cleaned;
            },
            z.string().regex(/^\d{5}$/, "Postal code must be exactly 5 digits"),
        ),
        city: z.string().min(1).max(100).trim(),
        countryCode: z
            .string()
            .length(2, "Country code must be 2 characters (ISO 3166-1 alpha-2)")
            .transform((v) => v.trim().toUpperCase()),
        regionCode: z.string().max(10).trim().optional(),
    })
    .strict();

export type InternetmarkeAddress = z.infer<typeof InternetmarkeAddressSchema>;

export const InternetmarkeRequestSchema = z
    .object({
        productCode: z.enum(["STANDARD", "KOMPAKT", "GROSSBRIEF", "MAXIBRIEF", "WARENSENDUNG"], {
            errorMap: () => ({
                message:
                    "Invalid product code. Must be one of: STANDARD, KOMPAKT, GROSSBRIEF, MAXIBRIEF, WARENSENDUNG",
            }),
        }),
        frankingZone: z.string().min(1, "Franking zone cannot be empty").trim(),
        totalAmount: z.number().int().positive("Total amount must be greater than 0"),
        recipientAddress: InternetmarkeAddressSchema.optional(),
        senderAddress: InternetmarkeAddressSchema.optional(),
    })
    .strict();

export type InternetmarkeRequest = z.infer<typeof InternetmarkeRequestSchema>;

export const InternetmarkeErrorResponseSchema = z
    .object({
        message: z.string().min(1),
        code: z.string().optional(),
        details: z.record(z.unknown()).optional(),
        timestamp: z.string().optional(),
    })
    .passthrough();

export type InternetmarkeErrorResponse = z.infer<typeof InternetmarkeErrorResponseSchema>;

export const InternetmarkeSuccessResponseSchema = z
    .object({
        stampId: z.string().min(1, "Stamp ID cannot be empty"),
        barcode: z.string().min(1, "Barcode cannot be empty"),
        qrCode: z.string().optional(),
        totalAmount: z.number().int().positive(),
        imageUrl: z.string().url().optional(),
        printFormat: z.enum(["A4", "A6", "label"]).optional(),
        validUntil: z.string().optional(),
    })
    .passthrough();

export type InternetmarkeSuccessResponse = z.infer<typeof InternetmarkeSuccessResponseSchema>;

export const InternetmarkeAuthRequestSchema = z
    .object({
        username: z.string().min(1, "Username cannot be empty"),
        password: z.string().min(1, "Password cannot be empty"),
    })
    .strict();

export type InternetmarkeAuthRequest = z.infer<typeof InternetmarkeAuthRequestSchema>;

export const InternetmarkeAuthResponseSchema = z
    .object({
        token: z.string().min(1, "Token cannot be empty"),
        expires_in: z.number().int().positive("Expires in must be positive"),
    })
    .passthrough();

export type InternetmarkeAuthResponse = z.infer<typeof InternetmarkeAuthResponseSchema>;

/**
 * Internetmarke shopping-cart position DTOs.
 */

import type { DHLAddress } from "./utils.js";

export type VoucherLayout = "ADDRESS_ZONE" | "FRANKING_ZONE";
export const ADDRESS_ZONE: VoucherLayout = "ADDRESS_ZONE";
export const FRANKING_ZONE: VoucherLayout = "FRANKING_ZONE";

export interface PositionMark {
    productCode: number;
    markType?: string;
    recipientAddress?: DHLAddress;
    senderAddress?: DHLAddress;
}

export interface PdfPlacement {
    labelX?: number;
    labelY?: number;
    page?: number;
}

export interface CartAddressBlock {
    sender: DHLAddress;
    receiver: DHLAddress;
}

export interface PngPositionWire {
    productCode: number;
    voucherLayout: VoucherLayout;
    positionType: "AppShoppingCartPosition";
    address?: CartAddressBlock;
}

export interface PdfSheetSlot {
    labelX: number;
    labelY: number;
    page: number;
}

export interface PdfPositionWire {
    productCode: number;
    voucherLayout: VoucherLayout;
    position: PdfSheetSlot;
    positionType: "AppShoppingCartPDFPosition";
    address?: CartAddressBlock;
}

export interface PngPosition {
    readonly productCode: number;
    readonly voucherLayout: VoucherLayout;
    readonly address?: CartAddressBlock;
    readonly positionType: "AppShoppingCartPosition";
    toWire(): PngPositionWire;
}

export interface PdfPosition {
    readonly productCode: number;
    readonly voucherLayout: VoucherLayout;
    readonly placement: Required<PdfPlacement>;
    readonly address?: CartAddressBlock;
    readonly positionType: "AppShoppingCartPDFPosition";
    toWire(): PdfPositionWire;
}

export function voucherLayoutForMarkType(markType?: string): VoucherLayout {
    return markType === "label" ? ADDRESS_ZONE : FRANKING_ZONE;
}

function cartAddress(
    recipientAddress: DHLAddress | undefined,
    senderAddress: DHLAddress | undefined,
    voucherLayout: VoucherLayout,
): CartAddressBlock | undefined {
    if (voucherLayout !== ADDRESS_ZONE || !recipientAddress || !senderAddress) {
        return undefined;
    }
    return { sender: { ...senderAddress }, receiver: { ...recipientAddress } };
}

export class PositionFactory {
    png(mark: PositionMark): PngPosition {
        const voucherLayout = voucherLayoutForMarkType(mark.markType);
        const address = cartAddress(mark.recipientAddress, mark.senderAddress, voucherLayout);
        return {
            productCode: mark.productCode,
            voucherLayout,
            address,
            positionType: "AppShoppingCartPosition",
            toWire(): PngPositionWire {
                const body: PngPositionWire = {
                    productCode: mark.productCode,
                    voucherLayout,
                    positionType: "AppShoppingCartPosition",
                };
                if (address) body.address = address;
                return body;
            },
        };
    }

    pdf(mark: PositionMark, placement?: PdfPlacement): PdfPosition {
        const voucherLayout = voucherLayoutForMarkType(mark.markType);
        const address = cartAddress(mark.recipientAddress, mark.senderAddress, voucherLayout);
        const slot: Required<PdfPlacement> = {
            labelX: placement?.labelX ?? 1,
            labelY: placement?.labelY ?? 1,
            page: placement?.page ?? 1,
        };
        return {
            productCode: mark.productCode,
            voucherLayout,
            placement: slot,
            address,
            positionType: "AppShoppingCartPDFPosition",
            toWire(): PdfPositionWire {
                const body: PdfPositionWire = {
                    productCode: mark.productCode,
                    voucherLayout,
                    position: {
                        labelX: slot.labelX,
                        labelY: slot.labelY,
                        page: slot.page,
                    },
                    positionType: "AppShoppingCartPDFPosition",
                };
                if (address) body.address = address;
                return body;
            },
        };
    }
}

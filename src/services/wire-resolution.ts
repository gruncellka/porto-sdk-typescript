import { PortoError, PortoErrorCode } from "../errors.js";

export type WireCode = number | string;

export function resolveWireCode(input: {
    wireEdges: Record<
        string,
        Record<
            string,
            Record<string, { base?: WireCode | null; services?: Record<string, WireCode> }>
        >
    >;
    strategy?: string | null;
    wire: string;
    productId: string;
    zoneId: string;
    serviceIds?: string[] | null;
}): WireCode {
    const { wireEdges, strategy, wire, productId, zoneId, serviceIds } = input;

    const wireEntry = wireEdges[wire];
    if (!wireEntry) {
        throw new PortoError(
            `No wire edges for wire '${wire}'`,
            PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
            422,
            { wire, productId, zoneId },
            false,
        );
    }

    const productWire = wireEntry[productId];
    if (!productWire) {
        throw new PortoError(
            `No wire edge for product '${productId}' on wire '${wire}'`,
            PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
            422,
            { wire, productId, zoneId },
            false,
        );
    }

    const zoneEntry = productWire[zoneId];
    if (!zoneEntry || typeof zoneEntry !== "object") {
        throw new PortoError(
            `No wire edge for product '${productId}' in zone '${zoneId}'`,
            PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
            422,
            { wire, productId, zoneId },
            false,
        );
    }

    let wireCode: WireCode | null | undefined = undefined;
    if (strategy === "service" && serviceIds?.length) {
        const serviceMap = zoneEntry.services ?? {};
        for (const serviceId of serviceIds) {
            const candidate = serviceMap[serviceId];
            if (candidate != null) {
                wireCode = candidate;
            }
        }
    }

    if (wireCode == null) {
        wireCode = zoneEntry.base ?? null;
    }

    if (wireCode == null) {
        throw new PortoError(
            "Wire code missing for valid product/zone combination",
            PortoErrorCode.PORTO_PRODUCT_NOT_FOUND,
            422,
            {
                wire,
                productId,
                zoneId,
                serviceIds: serviceIds ?? [],
                strategy,
            },
            false,
        );
    }

    return wireCode;
}

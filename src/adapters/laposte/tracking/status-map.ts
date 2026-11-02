import { PortoStatus } from "../../../types/index.js";

export const MAP: Record<string, PortoStatus> = {
    PC1: PortoStatus.CREATED,
    PC2: PortoStatus.TRANSIT,
    PC3: PortoStatus.DELIVERY,
    LIV: PortoStatus.DELIVERED,
    REN: PortoStatus.RETURNED,
    NDR: PortoStatus.UNDELIVERABLE,
};

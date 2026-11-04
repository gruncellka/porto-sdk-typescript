import { PortoStatus } from "../../../types/index.js";

export const MAP: Record<string, PortoStatus> = {
    "pre-transit": PortoStatus.CREATED,
    transit: PortoStatus.TRANSIT,
    "out-for-delivery": PortoStatus.DELIVERY,
    delivered: PortoStatus.DELIVERED,
    return: PortoStatus.RETURNED,
    failure: PortoStatus.UNDELIVERABLE,
};

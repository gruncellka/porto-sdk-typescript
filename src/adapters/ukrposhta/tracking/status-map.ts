import { PortoStatus } from "../../../types/index.js";

export const MAP: Record<string, PortoStatus> = {
    "101": PortoStatus.CREATED,
    "102": PortoStatus.TRANSIT,
    "103": PortoStatus.DELIVERY,
    "104": PortoStatus.DELIVERED,
    "105": PortoStatus.RETURNED,
    "106": PortoStatus.UNDELIVERABLE,
};

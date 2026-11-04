import { PortoStatus } from "../../../types/index.js";

export const MAP: Record<string, PortoStatus> = {
    NOT_YET_SENT: PortoStatus.CREATED,
    ON_THE_WAY: PortoStatus.TRANSIT,
    OUT_FOR_DELIVERY: PortoStatus.DELIVERY,
    DELIVERED: PortoStatus.DELIVERED,
    RETURNED: PortoStatus.RETURNED,
    NOT_DELIVERED: PortoStatus.UNDELIVERABLE,
};

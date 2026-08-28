import { TrackingState } from "../../../types/index.js";

export const UKRPOSHTA_STATUS_MAP: Record<string, TrackingState> = {
    "101": TrackingState.CREATED,
    "102": TrackingState.IN_TRANSIT,
    "103": TrackingState.OUT_FOR_DELIVERY,
    "104": TrackingState.DELIVERED,
    "105": TrackingState.RETURNED,
    "106": TrackingState.UNDELIVERABLE,
};

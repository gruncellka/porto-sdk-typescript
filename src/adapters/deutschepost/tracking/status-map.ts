import { TrackingState } from "../../../types/index.js";

export const DEUTSCHEPOST_SHIPMENT_STATUS_MAP: Record<string, TrackingState> = {
    "pre-transit": TrackingState.CREATED,
    transit: TrackingState.IN_TRANSIT,
    "out-for-delivery": TrackingState.OUT_FOR_DELIVERY,
    delivered: TrackingState.DELIVERED,
    return: TrackingState.RETURNED,
    failure: TrackingState.UNDELIVERABLE,
};

import { TrackingState } from "../../../types/index.js";

export const LAPOSTE_STATUS_MAP: Record<string, TrackingState> = {
    PC1: TrackingState.CREATED,
    PC2: TrackingState.IN_TRANSIT,
    PC3: TrackingState.OUT_FOR_DELIVERY,
    LIV: TrackingState.DELIVERED,
    REN: TrackingState.RETURNED,
    NDR: TrackingState.UNDELIVERABLE,
};

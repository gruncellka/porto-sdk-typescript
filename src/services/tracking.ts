import type { TrackingAdapter } from "../adapters/tracking/adapter.js";
import { PortoError, PortoErrorCode } from "../errors.js";
import type { TrackingStatus } from "../types/index.js";

export class TrackingService {
    constructor(private readonly adapter: TrackingAdapter) {}

    get supportsTracking(): boolean {
        return this.adapter.supportsTracking;
    }

    async get(trackingNumber: string): Promise<TrackingStatus> {
        const number = String(trackingNumber).trim();
        if (!number) {
            throw new PortoError(
                "Tracking number is required.",
                PortoErrorCode.PORTO_TRACKING_NOT_FOUND,
                404,
                {
                    provider_id: this.adapter.providerId,
                    tracking_number: number,
                },
                false,
                this.adapter.providerId,
            );
        }
        return this.adapter.track(number);
    }
}

/**
 * Capability and availability states — not boolean collapse.
 */

export const CapabilityState = {
    Absent: "absent",
    Unsupported: "unsupported",
    Unavailable: "unavailable",
    Failed: "failed",
    Ready: "ready",
} as const;

export type CapabilityState = (typeof CapabilityState)[keyof typeof CapabilityState];

export function isReady(state: CapabilityState): boolean {
    return state === CapabilityState.Ready;
}

export function capabilityState(args: {
    supported: boolean;
    available?: boolean;
}): CapabilityState {
    if (!args.supported) {
        return CapabilityState.Unsupported;
    }
    if (args.available === false) {
        return CapabilityState.Unavailable;
    }
    return CapabilityState.Ready;
}

export interface HealthStatus {
    state: CapabilityState;
    detail?: string;
}

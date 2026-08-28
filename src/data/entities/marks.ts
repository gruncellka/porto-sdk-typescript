/** Marks entity loader — providers/<id>/marks.json */

import { type MarkType, parseMarkType } from "../../execution/index.js";
import { type Requirement, parseRequiresList } from "../../requires.js";
import { BaseEntityLoader, type EntityData } from "./base";

export interface MarkProfile {
    id: string;
    mark_type: MarkType;
    label: string;
    width: number;
    height: number;
    mime_types: string[];
    requires: Requirement[];
    clearance?: number;
}

export interface MarkRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MarkAssetSize {
    width_px: number;
    height_px: number;
    width_mm: number;
    height_mm: number;
}

/**
 * One marks.json calibrations[] row.
 * `mark_profile` is the wire mark-layout token (e.g. FRANKING_ZONE /
 * ADDRESS_ZONE), not profiles[].id. Porto profile ids select by_mark_profile.
 */
export interface MarkCalibration {
    wire: string;
    mark_profile: string;
    mime_type: string;
    dpi: number;
    by_mark_profile: Record<string, MarkAssetSize>;
    label_canvas?: MarkAssetSize;
}

function parseRect(raw: unknown): MarkRect | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const row = raw as Record<string, unknown>;
    const x = Number(row.x);
    const y = Number(row.y);
    const width = Number(row.width);
    const height = Number(row.height);
    if (![x, y, width, height].every(Number.isFinite)) return undefined;
    return { x, y, width, height };
}

function parseAssetSize(raw: unknown): MarkAssetSize | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const row = raw as Record<string, unknown>;
    const width_px = Number(row.width_px);
    const height_px = Number(row.height_px);
    const width_mm = Number(row.width_mm);
    const height_mm = Number(row.height_mm);
    if (
        !Number.isFinite(width_px) ||
        !Number.isFinite(height_px) ||
        !Number.isFinite(width_mm) ||
        !Number.isFinite(height_mm)
    ) {
        return undefined;
    }
    return { width_px, height_px, width_mm, height_mm };
}

export class MarksLoader extends BaseEntityLoader {
    private profiles: Map<string, MarkProfile> = new Map();
    private defaultProfileId?: string;
    private calibrations: MarkCalibration[] = [];
    private placement: Map<string, MarkRect> = new Map();

    load(data: EntityData): void {
        this.profiles = new Map();
        this.calibrations = [];
        this.placement = new Map();
        this.defaultProfileId = data.default_profile;
        for (const row of data.profiles ?? []) {
            const size = row.size ?? {};
            const clearanceRaw = row.clearance;
            const clearance =
                clearanceRaw === undefined || clearanceRaw === null
                    ? undefined
                    : Number(clearanceRaw);
            const profile: MarkProfile = {
                id: String(row.id),
                mark_type: parseMarkType(row.type ?? row.mark_type),
                label: String(row.label ?? row.id),
                width: Number(size.width ?? 0),
                height: Number(size.height ?? 0),
                mime_types: [...((row.mime_type as string[] | undefined) ?? [])],
                requires: parseRequiresList(row.requires, "marks.requires"),
                clearance: Number.isFinite(clearance) ? clearance : undefined,
            };
            this.profiles.set(profile.id, profile);
        }

        const envelopesMap = (data.placement as EntityData | undefined)?.envelopes ?? {};
        if (envelopesMap && typeof envelopesMap === "object") {
            for (const [envelopeId, raw] of Object.entries(envelopesMap)) {
                const parsed = parseRect(raw);
                if (parsed) this.placement.set(envelopeId, parsed);
            }
        }

        for (const row of data.calibrations ?? []) {
            if (!row || typeof row !== "object") continue;
            const byMarkProfile: Record<string, MarkAssetSize> = {};
            const rawBy = row.by_mark_profile;
            if (rawBy && typeof rawBy === "object") {
                for (const [profileId, dims] of Object.entries(rawBy)) {
                    const parsed = parseAssetSize(dims);
                    if (parsed) byMarkProfile[profileId] = parsed;
                }
            }
            this.calibrations.push({
                wire: String(row.wire ?? ""),
                mark_profile: String(row.mark_profile ?? ""),
                mime_type: String(row.mime_type ?? "image/png"),
                dpi: Number(row.dpi ?? 0),
                by_mark_profile: byMarkProfile,
                label_canvas: parseAssetSize(row.label_canvas),
            });
        }
    }

    getData(): Map<string, MarkProfile> {
        return this.profiles;
    }

    getProfile(profileId: string): MarkProfile | undefined {
        return this.profiles.get(profileId);
    }

    getDefaultProfile(): MarkProfile | undefined {
        if (this.defaultProfileId) {
            return this.profiles.get(this.defaultProfileId);
        }
        const first = this.profiles.values().next().value;
        return first;
    }

    getPlacement(envelopeId: string): MarkRect | undefined {
        return this.placement.get(envelopeId);
    }

    getCalibrations(): MarkCalibration[] {
        return [...this.calibrations];
    }

    getCalibration(input: {
        wire: string;
        mark_profile: string;
        mime_type?: string;
        dpi?: number;
    }): MarkCalibration | undefined {
        const mimeType = input.mime_type ?? "image/png";
        const dpi = input.dpi ?? 300;
        return this.calibrations.find(
            (row) =>
                row.wire === input.wire &&
                row.mark_profile === input.mark_profile &&
                row.mime_type === mimeType &&
                row.dpi === dpi,
        );
    }

    getCalibrationAssetSize(input: {
        wire: string;
        mark_profile: string;
        mark_profile_id?: string | null;
        mime_type?: string;
        dpi?: number;
    }): MarkAssetSize | undefined {
        const row = this.getCalibration(input);
        if (!row) return undefined;
        if (input.mark_profile_id && row.by_mark_profile[input.mark_profile_id]) {
            return row.by_mark_profile[input.mark_profile_id];
        }
        return row.label_canvas;
    }
}

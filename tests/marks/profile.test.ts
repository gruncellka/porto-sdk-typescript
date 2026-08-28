import { describe, expect, it } from "vitest";

import { MarksLoader } from "../../src/data/entities/marks.js";
import { resolveMarkProfileId } from "../../src/services/mark-resolution.js";

describe("mark resolution", () => {
    it("overrides profile when registered service selected", () => {
        const markEdges = {
            domestic: {
                profile: "domestic",
                services: { einschreiben: "registered" },
            },
        };
        expect(
            resolveMarkProfileId({
                markEdges,
                zoneId: "domestic",
                serviceIds: ["einschreiben"],
                defaultProfileId: "domestic",
            }),
        ).toBe("registered");
    });
});

describe("MarksLoader calibrations", () => {
    it("loads mark_profile layout tokens and by_mark_profile sizes", () => {
        const loader = new MarksLoader("/tmp", {});
        loader.load({
            file_type: "marks",
            default_profile: "domestic",
            profiles: [
                {
                    id: "domestic",
                    mark_type: "stamp",
                    label: "D",
                    size: { width: 37, height: 20 },
                    mime_type: ["image/png"],
                },
            ],
            calibrations: [
                {
                    wire: "internetmarke",
                    mark_profile: "FRANKING_ZONE",
                    mime_type: "image/png",
                    dpi: 300,
                    by_mark_profile: {
                        domestic: {
                            width_px: 437,
                            height_px: 236,
                            width_mm: 37,
                            height_mm: 20,
                        },
                    },
                },
                {
                    wire: "internetmarke",
                    mark_profile: "ADDRESS_ZONE",
                    mime_type: "image/png",
                    dpi: 300,
                    label_canvas: {
                        width_px: 1004,
                        height_px: 508,
                        width_mm: 85,
                        height_mm: 43,
                    },
                },
            ],
        });
        expect(
            loader.getCalibrationAssetSize({
                wire: "internetmarke",
                mark_profile: "FRANKING_ZONE",
                mark_profile_id: "domestic",
            })?.width_mm,
        ).toBe(37);
        expect(
            loader.getCalibrationAssetSize({
                wire: "internetmarke",
                mark_profile: "ADDRESS_ZONE",
            })?.width_mm,
        ).toBe(85);
    });
});

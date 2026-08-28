import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FEATURE_KINDS, SERVICE_KINDS } from "../../src/kinds.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

describe("kind literals match kinds.schema.json", () => {
    it("locks service and feature enums to the schema", () => {
        const schemaPath = join(resolvePortoDataPathForTests(), "schemas", "kinds.schema.json");
        const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as {
            definitions: {
                service_kind: { enum: string[] };
                feature_kind: { enum: string[] };
            };
        };
        expect(schema.definitions.service_kind.enum).toEqual([...SERVICE_KINDS]);
        expect(schema.definitions.feature_kind.enum).toEqual([...FEATURE_KINDS]);
    });
});

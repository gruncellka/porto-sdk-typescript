/**
 * Porto-data validator types.
 * Single supported shape: global + providers (no guessing mode).
 */

/** Schema-to-data path mapping for one scope (global or provider). */
export type SchemaDataMapping = Record<string, string>;

/** Provider-aware mappings structure from mappings.json */
export interface PortoDataMappings {
    global?: SchemaDataMapping;
    policy?: SchemaDataMapping;
    formats?: SchemaDataMapping;
    registry?: SchemaDataMapping;
    providers?: Record<string, SchemaDataMapping>;
}

/** Parsed mapping pair: [schemaPath, dataPath] */
export type MappingPair = [schemaPath: string, dataPath: string];

/** Entity entry in metadata (data + schema paths and checksums). */
export interface MetadataEntity {
    data?: { path: string; checksum: string };
    schema?: { path: string; checksum: string };
}

/** Single supported metadata shape: global + providers. */
export interface PortoDataMetadata {
    global: Record<string, MetadataEntity>;
    providers: Record<string, Record<string, MetadataEntity>>;
}

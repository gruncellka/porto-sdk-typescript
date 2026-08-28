/**
 * Base Entity Loader - Abstract base class for all entity loaders
 *
 * All entity loaders inherit from this class and implement:
 * - load(): Transform JSON data to typed objects
 * - getData(): Return loaded entity data
 */

export interface EntityData {
    [key: string]: any;
}

export abstract class BaseEntityLoader {
    protected dataPath: string;
    protected checksumMap: Map<string, string>;

    /**
     * Initialize entity loader
     *
     * @param dataPath - Path to porto-data directory
     * @param checksumMap - Pre-built checksum map from metadata.json
     */
    constructor(dataPath: string, checksumMap: Map<string, string>) {
        this.dataPath = dataPath;
        this.checksumMap = checksumMap;
    }

    /**
     * Load and transform entity data from JSON
     *
     * @param data - Parsed JSON data from file
     */
    abstract load(data: EntityData): void;

    /**
     * Get loaded entity data
     *
     * @returns Loaded entity data (type depends on entity)
     */
    abstract getData(): any;
}

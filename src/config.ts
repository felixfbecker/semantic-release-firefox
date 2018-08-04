export interface SharedConfig {
    /** The file path for the .xpi archive that will be created */
    xpiPath: string

    /**
     * The file path for the zip with the source files that will be created
     *
     * @default 'sources.zip'
     */
    sourcesArchivePath?: string
}

export const DEFAULT_SOURCES_ARCHIVE_PATH = 'sources.zip'

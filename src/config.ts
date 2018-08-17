export interface SharedConfig {
    /** The file path for the .xpi archive that will be created */
    xpiPath: string

    /**
     * The file path for the zip with the source files that will be created.
     * `null` means to not create/upload a sources archive.
     *
     * @default 'sources.zip'
     */
    sourcesArchivePath?: string | null
}

export const DEFAULT_SOURCES_ARCHIVE_PATH = 'sources.zip'

import archiver = require('archiver')
import { createWriteStream } from 'fs'
import { IOptions } from 'glob'
import { readFile, writeFile } from 'mz/fs'
import * as path from 'path'
import prettyBytes = require('pretty-bytes')
import { DEFAULT_SOURCES_ARCHIVE_PATH, SharedConfig } from './config'
import { Logger } from './semantic-release'

export interface PrepareConfig extends SharedConfig {
    /** The folder to be packaged as .xpi */
    distFolder: string

    /** The file path to the manifest.json */
    manifestPath?: string

    /**
     * A glob pattern of source files that will be zipped and submitted for review.
     *
     * @default '**'
     */
    sourcesGlob?: string

    /**
     * Glob options passed to node-glob.
     * You can use this for example if you need to include dotfiles (set `dot: true`),
     * or if you need to include certain private packages from `node_modules` (set `ignore`)
     *
     * @default { ignore: 'node_modules/**' }
     */
    sourcesGlobOptions?: IOptions
}

export const prepareFirefoxExtension = async (
    {
        xpiPath,
        distFolder,
        manifestPath = path.join(distFolder, 'manifest.json'),
        sourcesArchivePath = DEFAULT_SOURCES_ARCHIVE_PATH,
        sourcesGlob = '**',
        sourcesGlobOptions = {},
    }: PrepareConfig,
    { version, logger, cwd }: { version: string; logger: Logger; cwd: string }
) => {
    manifestPath = path.resolve(cwd, manifestPath)
    sourcesArchivePath = path.resolve(cwd, sourcesArchivePath)
    xpiPath = path.resolve(cwd, xpiPath)

    // Write version to manifest
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    manifest.version = version
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    logger.success(`Wrote version ${version} to ${manifestPath}`)

    // Create .xpi
    logger.log(`Writing xpi archive to ${xpiPath}`)
    await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(xpiPath)
        const archive = archiver('zip', {
            zlib: { level: 9 },
        })
        archive.on('error', reject)
        /* istanbul ignore next */
        archive.on('warning', warning => logger.log(warning))
        archive.on('end', () => {
            const totalBytes = prettyBytes(archive.pointer())
            logger.success(`Size: ${totalBytes}`)
            resolve()
        })
        archive.pipe(out)
        archive.directory(distFolder, false)
        archive.finalize()
    })

    // zip sources
    logger.log(`Writing sources archive to ${sourcesArchivePath}`)
    await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(sourcesArchivePath)
        const archive = archiver('zip', {
            zlib: { level: 9 },
        })
        archive.on('error', reject)
        /* istanbul ignore next */
        archive.on('warning', warning => logger.log(warning))
        archive.on('end', () => {
            const totalBytes = prettyBytes(archive.pointer())
            logger.success(`Size: ${totalBytes}`)
            resolve()
        })
        archive.pipe(out)
        const distFolderRelative = path.relative(cwd, distFolder)
        archive.glob(sourcesGlob, {
            cwd,
            ignore: ['node_modules/**', distFolderRelative, path.posix.join(distFolderRelative, '**')],
            ...sourcesGlobOptions,
        })
        archive.finalize()
    })
}

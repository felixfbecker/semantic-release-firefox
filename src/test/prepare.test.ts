import assert = require('assert')
import decompress = require('decompress')
import { exists, mkdtemp, readFile } from 'mz/fs'
import * as os from 'os'
import * as path from 'path'
import rmfr = require('rmfr')
// @ts-ignore
import getLogger = require('semantic-release/lib/get-logger')
import { prepareFirefoxExtension } from '../prepare'

const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures')

describe('prepareFirefoxExtension()', () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'semantic-release-firefox-test-'), 'utf-8')
    })

    afterEach(async () => {
        await rmfr(tmpDir)
    })

    it('should prepare files needed for submitting an extension', async () => {
        const xpiPath = path.join(tmpDir, 'test.xpi')
        const sourcesArchivePath = path.join(tmpDir, 'testsources.zip')
        const distFolder = path.join(FIXTURES_DIR, 'extension', 'dist')
        await prepareFirefoxExtension(
            {
                distFolder,
                xpiPath,
                sourcesArchivePath,
            },
            {
                version: '1.2.3',
                logger: getLogger(process),
                cwd: path.join(FIXTURES_DIR, 'extension'),
            }
        )
        assert.deepStrictEqual(JSON.parse(await readFile(path.join(distFolder, 'manifest.json'), 'utf-8')), {
            name: 'Test',
            version: '1.2.3',
        })
        assert(await exists(xpiPath), `Expected ${xpiPath} to exist`)
        const xpiContents = await decompress(xpiPath)
        assert.deepEqual(new Set(xpiContents.map(entry => entry.path)), new Set(['manifest.json', 'bundle.js']))

        assert(await exists(sourcesArchivePath), `Expected ${sourcesArchivePath} to exist`)
        const sourcesContents = await decompress(sourcesArchivePath)
        assert.deepEqual(
            new Set(sourcesContents.map(entry => entry.path)),
            new Set(['README.md', 'src/', 'src/script.js'])
        )
    })
})

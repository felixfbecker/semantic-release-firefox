import * as assert from 'assert'
import { Server } from 'http'
import * as path from 'path'

import getLogger from 'semantic-release/lib/get-logger'

import { publishFirefoxExtension } from '../publish'

import { createMockAMOServer, MockAMO } from './server'

const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures')
const PORT = 45032

describe('publishFirefoxExtension()', () => {
    const email = 'test@test.com'
    const password = 'test123'
    const totpSecret = 'BMOEOJQ4LYUB4Q27'

    let mockAMO: MockAMO
    let server: Server
    const amoBaseUrl = `http://localhost:${PORT}`

    beforeEach(done => {
        mockAMO = createMockAMOServer({ email, password, totpSecret })
        server = mockAMO.app.listen(PORT, done)
    })

    afterEach(done => {
        server.close(done)
    })

    it('should release an extension with sources', async () => {
        await publishFirefoxExtension(
            {
                addOnSlug: 'testextension',
                xpiPath: path.join(FIXTURES_DIR, 'test.xpi'),
                sourcesArchivePath: path.join(FIXTURES_DIR, 'testsources.zip'),
                notesToReviewer: 'Please dont judge',
            },
            {
                notes: 'Lots of exciting changes',
                email,
                password,
                totpSecret,
                logger: getLogger(process),
                amoBaseUrl,
            }
        )
        assert.deepStrictEqual(mockAMO.extensionVersionUploads, [
            {
                slug: 'testextension',
                versionId: 0,
                sourcesFileName: 'testsources.zip',
                hasSources: true,
                releaseNotes: 'Lots of exciting changes',
                notesToReviewer: 'Please dont judge',
            },
        ])
    })

    it('should release an extension without sources', async () => {
        await publishFirefoxExtension(
            {
                addOnSlug: 'testextension',
                xpiPath: path.join(FIXTURES_DIR, 'test.xpi'),
                sourcesArchivePath: null,
                notesToReviewer: 'Please dont judge',
            },
            {
                notes: 'Lots of exciting changes',
                email,
                password,
                totpSecret,
                logger: getLogger(process),
                amoBaseUrl,
            }
        )
        assert.deepStrictEqual(mockAMO.extensionVersionUploads, [
            {
                slug: 'testextension',
                versionId: 0,
                hasSources: false,
                releaseNotes: 'Lots of exciting changes',
                notesToReviewer: 'Please dont judge',
            },
        ])
    })
})

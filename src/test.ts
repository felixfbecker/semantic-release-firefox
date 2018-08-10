// @ts-ignore
import getLogger = require('semantic-release/lib/get-logger')
import { prepareFirefoxExtension } from './prepare'

const browserExt = '/Users/felix/src/github.com/sourcegraph/browser-extensions'

prepareFirefoxExtension(
    {
        xpiPath: browserExt + '/extension.xpi',
        distFolder: browserExt + '/build/firefox',
        manifestPath: browserExt + '/build/firefox/manifest.json',
        sourcesGlobOptions: {
            dot: true,
            debug: true,
            ignore: [
                '.git',
                '.git/**',
                '.github',
                '.github/**',
                'build',
                'build/**',
                'ci',
                'ci/**',
                'cypress',
                'cypress/**',
                'node_modules',
                'node_modules/**',
                'Sourcegraph.safariextension',
                'Sourcegraph.safariextension/**',
                'sources.zip',
            ],
        },
    },
    {
        cwd: browserExt,
        version: '1.2.3',
        logger: getLogger(process),
    }
)

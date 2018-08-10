import { Browser, launch } from 'puppeteer'
// @ts-ignore
import HtmlToMdConverter = require('upndown')
import { DEFAULT_SOURCES_ARCHIVE_PATH, SharedConfig } from './config'
import { Logger, ReleaseInfo } from './semantic-release'

export interface PublishConfig extends SharedConfig {
    /** Add-on slug as in the URL, i.e. https://addons.mozilla.org/en-US/firefox/addon/SLUG/ */
    addOnSlug: string

    /**
     * Notes to the reviewer that will be submitted for every version.
     * For example, you could link to the source code on GitHub.
     */
    notesToReviewer?: string
}

const htmlToMd = (html: string) =>
    new Promise<string>((resolve, reject) => {
        const converter = new HtmlToMdConverter()
        converter.convert(html, (err: any, md: string) => (err ? reject(err) : resolve(md)))
    })

export const publishFirefoxExtension = async (
    { addOnSlug, xpiPath, sourcesArchivePath = DEFAULT_SOURCES_ARCHIVE_PATH, notesToReviewer }: PublishConfig,
    {
        notes,
        logger,
        email,
        password,
        amoBaseUrl = 'https://addons.mozilla.org',
    }: {
        notes: string
        email: string
        password: string
        logger: Logger
        amoBaseUrl?: string
    }
): Promise<ReleaseInfo> => {
    let browser: Browser | undefined
    try {
        let args: string[] | undefined
        // see https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-fails-due-to-sandbox-issues
        /* istanbul ignore if */
        if (process.getuid() === 0 || process.env.TRAVIS) {
            logger.log('Disabling Chrome sandbox')
            args = ['--no-sandbox', '--disable-setuid-sandbox']
        }
        browser = await launch({ args })
        const page = await browser.newPage()
        const submitUrl = `${amoBaseUrl}/en-US/developers/addon/${addOnSlug}/versions/submit/`
        logger.log(`Navigating to ${submitUrl}`)
        await Promise.all([page.waitForNavigation(), page.goto(submitUrl)])

        // Login
        if (await page.evaluate(/* istanbul ignore next */ () => location.pathname === '/oauth/signin')) {
            logger.log('Redirected to signin page')
            await page.waitForSelector('.sign-in input.email')
            logger.log('Filling signin form')
            await page.evaluate(
                /* istanbul ignore next */
                (email: string, password: string) => {
                    const emailInput = document.querySelector('.sign-in input.email') as HTMLInputElement
                    emailInput.value = email
                    const passwordInput = document.querySelector('.sign-in input.password') as HTMLInputElement
                    passwordInput.value = password
                },
                email,
                password
            )
            logger.log('Submitting signin form')
            await Promise.all([page.waitForNavigation(), page.click('#submit-btn')])
            if (await page.evaluate(/* istanbul ignore next */ () => !!document.querySelector('input.totp-code'))) {
                throw new Error(
                    `Cannot sign into ${email} because 2FA is enabled. Disable 2FA to use semantic-release-firefox`
                )
            }
        }

        /* istanbul ignore next */
        if (page.url() !== submitUrl) {
            throw new Error(`Could not navigate to ${submitUrl}, landed at ${page.url()}`)
        }
        logger.success('Signin successful')

        // Upload xpi
        const addOnFileInput = (await page.$('#upload-addon'))!
        logger.log(`Uploading xpi ${xpiPath}`)
        await addOnFileInput.uploadFile(xpiPath)
        let status: 'status-fail' | 'status-pass' | '' | null
        const uploadStart = Date.now()
        while (true) {
            const progress: string | null = await page.evaluate(
                /* istanbul ignore next */ () => {
                    const uploadStatus = document.getElementById('uploadstatus')
                    return uploadStatus && uploadStatus.textContent
                }
            )
            logger.log(
                'Upload progress: ' +
                    (progress || '')
                        .replace('Cancel', '')
                        .replace(/\s+/g, ' ')
                        .trim()
            )
            status = await page.evaluate(
                /* istanbul ignore next */ () => {
                    const uploadStatusResults = document.getElementById('upload-status-results')
                    return uploadStatusResults && uploadStatusResults.className
                }
            )
            if (status) {
                break
            }
            await new Promise<void>(resolve => setTimeout(resolve, 1000))
            if (Date.now() >= uploadStart + 10 * 60 * 1000) {
                throw new Error('Timeout: Uploading xpi took longer than 10min')
            }
        }
        logger.success('xpi upload successful')

        // Get validation report
        const statusHtml = await page.evaluate(
            /* istanbul ignore next */ () => document.getElementById('upload-status-results')!.innerHTML
        )
        const statusMarkdown = await htmlToMd(statusHtml)
        if (status === 'status-fail') {
            logger.error(statusMarkdown)
            throw new Error('Extension validation failed')
        } else {
            logger.log(statusMarkdown)
        }

        // Upload source code
        logger.log(`Selecting sources archive ${sourcesArchivePath}`)
        const sourceFileInput = (await page.$('#id_source'))!
        await sourceFileInput.uploadFile(sourcesArchivePath)

        logger.log('Submitting form')
        logger.log('Waiting for upload...')
        await Promise.all([
            // Uploading the sources can take a while, so set timeout to 10min
            page.waitForNavigation({ timeout: 10 * 60 * 1000 }),
            page.click('#submit-upload-file-finish'),
        ])

        // Check if there were errors
        const errorlistHtml: string | null = await page.evaluate(
            /* istanbul ignore next */ () => {
                const errorList = document.querySelector('#upload-file > .errorlist')
                return errorList && errorList.innerHTML
            }
        )
        if (errorlistHtml) {
            const errorlistMarkdown = (await htmlToMd(errorlistHtml)).trim()
            if (errorlistMarkdown) {
                logger.error(errorlistMarkdown)
                throw new Error('Form submission failed')
            }
        }
        logger.success('Submission successful')

        // Input release notes
        logger.log('Adding release notes')
        await page.evaluate(
            /* istanbul ignore next */ (notes: string) => {
                // we only fill out the first release notes input box found, whatever language it is
                // semantic-release does not have a story for localized release notes
                const textarea = document.querySelector<HTMLTextAreaElement>(
                    '#trans-releasenotes > textarea:first-of-type'
                )!
                textarea.value = notes
            },
            notes
        )
        if (notesToReviewer) {
            logger.log('Adding notes to reviewer')
            await page.evaluate(
                /* istanbul ignore next */ (notesToReviewer: string) => {
                    // we only fill out the first release notes input box found, whatever language it is
                    // semantic-release does not have a story for localized release notes
                    const textarea = document.getElementById('id_approvalnotes') as HTMLTextAreaElement
                    textarea.value = notesToReviewer
                },
                notesToReviewer
            )
        }
        logger.log('Submitting details form')
        await Promise.all([
            page.waitForNavigation(),
            page.click('#submit-describe button[type="submit"]:not(.delete-button)'),
        ])

        // Print the final page and check that it includes "Version Submitted"
        const finalHtml: string | null = await page.evaluate(
            /* istanbul ignore next */ () => {
                const element = document.querySelector('.addon-submission-process')
                return element && element.innerHTML
            }
        )
        const finalMd = finalHtml && (await htmlToMd(finalHtml)).trim()
        logger.log(finalMd)
        /* istanbul ignore if */
        if (!finalMd || !/version submitted/i.test(finalMd)) {
            throw new Error('Something went wrong submitting the release notes')
        } else {
            logger.success('Details submission succesful')
        }

        const id: number = await page.evaluate(
            /* istanbul ignore next */ () => location.pathname.match(/\/submit\/(\d+)\/finish$/)![1]
        )
        logger.success(`Published https://addons.mozilla.org/en-US/developers/addon/sourcegraph/versions/${id}`)

        return {
            name: 'Firefox Add-on',
            url: `https://addons.mozilla.org/en-US/firefox/addon/${addOnSlug}/`,
        }
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}

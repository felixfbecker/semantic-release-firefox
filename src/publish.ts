import delay from 'delay'
import marked = require('marked')
// @ts-ignore
import TerminalRenderer = require('marked-terminal')
import { authenticator } from 'otplib'
import retry from 'p-retry'
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

async function htmlToMd(html: string): Promise<string> {
    const converter = new HtmlToMdConverter()
    const md = await new Promise<string>((resolve, reject) => {
        converter.convert(html, (err: any, md: string) => (err ? reject(err) : resolve(md)))
    })
    return md.trim()
}

function printMarkdown(md: string): void {
    // tslint:disable-next-line:no-console
    console.log(marked(md, { renderer: new TerminalRenderer() }))
}

export const publishFirefoxExtension = async (
    { addOnSlug, xpiPath, sourcesArchivePath = DEFAULT_SOURCES_ARCHIVE_PATH, notesToReviewer }: PublishConfig,
    {
        notes,
        logger,
        email,
        password,
        totpSecret,
        amoBaseUrl = 'https://addons.mozilla.org',
    }: {
        notes: string
        email: string
        password: string
        totpSecret: string
        logger: Logger
        amoBaseUrl?: string
    }
): Promise<ReleaseInfo> => {
    let browser: Browser | undefined
    try {
        let args: string[] | undefined
        // see https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-fails-due-to-sandbox-issues
        /* istanbul ignore if */
        if (process.getuid() === 0 || process.env.CI) {
            logger.log('Disabling Chrome sandbox')
            args = ['--no-sandbox', '--disable-setuid-sandbox']
        }
        browser = await launch({ args })
        const page = await browser.newPage()
        page.on('console', message => {
            logger.log('Console:', message.type().toUpperCase(), message.text())
        })
        const submitUrl = `${amoBaseUrl}/en-US/developers/addon/${addOnSlug}/versions/submit/`
        logger.log(`Navigating to ${submitUrl}`)
        await Promise.all([page.waitForNavigation(), page.goto(submitUrl)])

        // Login
        while (await page.evaluate(/* istanbul ignore next */ () => location.pathname === '/authorization')) {
            logger.log('Waiting for redirection to signin page')
            await page.waitForNavigation()
        }
        if (await page.evaluate(/* istanbul ignore next */ () => /^\/oauth(\/signin)?\/?/.test(location.pathname))) {
            logger.log('Redirected to signin page')
            await page.waitForSelector('input[type="email"]')
            logger.log('Entering email')
            await page.evaluate(
                /* istanbul ignore next */
                (email: string) => {
                    const emailInput = document.querySelector<HTMLInputElement>('input[type="email"]')!
                    emailInput.value = email
                },
                email
            )
            logger.log('Continuing to password')
            await page.click('#submit-btn')
            await page.waitForSelector('input[type="password"]')
            await page.evaluate(
                /* istanbul ignore next */
                (password: string) => {
                    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]')!
                    passwordInput.value = password
                },
                password
            )
            logger.log('Submitting password')
            await Promise.all([page.waitForNavigation(), page.click('#submit-btn')])
            await page.waitForFunction(/* istanbul ignore next */ () => location.pathname !== '/authorization')
            if (await page.evaluate(/* istanbul ignore next */ () => location.pathname === '/inline_totp_setup')) {
                throw new Error(
                    `Cannot sign into ${email} because 2-factor authentication is not set up for the account. Please enable set up 2FA to use semantic-release-firefox and add the 2FA secret as the environment variable \`FIREFOX_TOTP_SECRET\`. Click on "Can't scan code?" when being shown the setup QR code to reveal the TOTP secret in plain text.`
                )
            }
            await page.waitForSelector('input.totp-code')
            logger.log('Generating 2FA code')
            const totpCode = authenticator.generate(totpSecret)
            logger.log('Entering 2FA code')
            await page.evaluate(
                /* istanbul ignore next */
                (totpCode: string) => {
                    const totpCodeInput = document.querySelector<HTMLInputElement>('input.totp-code')!
                    totpCodeInput.value = totpCode
                },
                totpCode
            )
            logger.log('Submitting')
            await page.click('[type="submit"]')
            logger.log('Waiting for navigation to submit page...')
            try {
                await page.waitForFunction(
                    /* istanbul ignore next */ (submitUrl: string) => location.href === submitUrl,
                    { timeout: 6000 },
                    submitUrl
                )
            } catch (error) {
                logger.error(`Current URL: ${page.url()}`)
                /* istanbul ignore next */
                if (error.name !== 'TimeoutError') {
                    throw error
                }
                if ((await page.$('input.totp-code')) && (await page.$('input.totp-code.invalid'))) {
                    const message = await page.evaluate(
                        /* istanbul ignore next */ () => {
                            const tooltipId = document
                                .querySelector<HTMLInputElement>('input.totp-code')!
                                .getAttribute('aria-described-by')
                            const tooltip = document.querySelector('#' + tooltipId)
                            return tooltip && tooltip.textContent && tooltip.textContent.trim()
                        }
                    )
                    throw new Error(`2FA verification failed: ${message}`)
                }
                throw new Error(`2FA verification failed`)
            }
        }

        /* istanbul ignore next */
        if (page.url() !== submitUrl) {
            throw new Error(`Could not navigate to ${submitUrl}, landed at ${page.url()}`)
        }
        logger.success('Signin successful')

        // Upload xpi
        retry(
            async () => {
                await delay(1000)
                const addOnFileInput = await page.waitForSelector('#upload-addon')
                await delay(1000)
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
                    if (progress === null) {
                        logger.log('No upload status yet')
                    } else {
                        logger.log(
                            'Upload progress: ' +
                                (progress || '')
                                    .replace('Cancel', '')
                                    .replace(/\s+/g, ' ')
                                    .trim()
                        )
                    }
                    status = await page.evaluate(
                        /* istanbul ignore next */ () => {
                            const uploadStatusResults = document.getElementById('upload-status-results')
                            return (
                                uploadStatusResults &&
                                (uploadStatusResults.className as 'status-fail' | 'status-pass' | '')
                            )
                        }
                    )
                    if (status) {
                        break
                    }
                    await delay(1000)
                    if (!progress && Date.now() >= uploadStart + 60 * 1000) {
                        logger.log('No upload progress after 1min. Reloading and retrying...')
                        throw new Error('No upload progress after 1min')
                    }
                    if (Date.now() >= uploadStart + 10 * 60 * 1000) {
                        throw new retry.AbortError('Timeout: Uploading xpi took longer than 10min')
                    }
                }
            },
            {
                onFailedAttempt: async () => {
                    logger.log('Reloading and retrying...')
                    await page.reload()
                },
                retries: 3,
            }
        )
        logger.success('xpi upload successful')

        // Get validation report
        const statusHtml = await page.evaluate(
            /* istanbul ignore next */ () => document.getElementById('upload-status-results')!.innerHTML
        )
        const statusMarkdown = await htmlToMd(statusHtml)
        logger.log('Validation summary:')
        printMarkdown(statusMarkdown)
        if (status === 'status-fail') {
            throw new Error('Extension validation failed')
        }

        logger.log('Submitting form')
        logger.log('Waiting for being redirected...')
        await page.waitForSelector('#submit-upload-file-finish')
        await Promise.all([page.waitForNavigation(), page.click('#submit-upload-file-finish')])

        logger.log('Waiting for "Do You Need to Submit Source Code?" form to appear...')
        await page.waitForSelector('#submit-source input[name="has_source"]')
        if (sourcesArchivePath) {
            // Select "yes"
            logger.log('Answering yes to "Do You Need to Submit Source Code?"')
            await page.click('#submit-source input[name="has_source"][value="yes"]')

            // Upload source code
            await page.waitForSelector('#id_source')
            logger.log(`Selecting sources archive ${sourcesArchivePath}`)
            const sourceFileInput = (await page.$('#id_source'))!
            await sourceFileInput.uploadFile(sourcesArchivePath)
        } else {
            logger.log('Answering no to "Do You Need to Submit Source Code?"')
            await page.click('#submit-source input[name="has_source"][value="no"]')
        }

        logger.log('Submitting form')
        logger.log('Waiting for ' + (sourcesArchivePath ? 'sources to upload' : 'being redirected') + '...')
        await Promise.all([
            // Uploading sources can take a while, so set timeout to 10min
            page.waitForNavigation({ timeout: 10 * 60 * 1000 }),
            page.click('#submit-source [type="submit"]:not(.delete-button)'),
        ])

        // Check if there were errors
        const errorlistHtml: string | null = await page.evaluate(
            /* istanbul ignore next */ () => {
                const errorList = document.querySelector('#upload-file > .errorlist')
                return errorList && errorList.innerHTML
            }
        )
        if (errorlistHtml) {
            const errorlistMarkdown = await htmlToMd(errorlistHtml)
            if (errorlistMarkdown) {
                logger.error('Error list:')
                printMarkdown(errorlistMarkdown)
                throw new Error('Form submission failed')
            }
        }
        logger.success('Submission successful')

        // Input release notes
        logger.log('Adding release notes')
        await page.evaluate(
            /* istanbul ignore next */ (notes: string) => {
                // we only fill out the first release notes input box found, whatever language it is.
                // semantic-release does not have a story for localized release notes.
                // The name has a suffix for the locale, so use a ^= selector.
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name^="release_notes"]')!
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
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="approval_notes"]')!
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
        const finalMd = finalHtml && (await htmlToMd(finalHtml))
        if (finalMd) {
            logger.log('Report:')
            printMarkdown(finalMd)
        }
        /* istanbul ignore if */
        if (!finalMd || !/version submitted/i.test(finalMd)) {
            throw new Error('Something went wrong submitting the release notes')
        } else {
            logger.success('Details submission succesful')
        }

        const id: string = await page.evaluate(
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

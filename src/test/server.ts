// tslint:disable:no-console

import * as path from 'path'

import { authenticator } from '@otplib/preset-default'
import { wrap } from 'async-middleware'
import * as bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import express from 'express'
import { Fields, Files, IncomingForm } from 'formidable'
import morgan from 'morgan'

const AMO_FIXTURES_DIR = __dirname + '/../../fixtures/amo'

const checkAuth: express.Handler = (request, response, next) => {
    if (request.cookies.signedIn !== 'true') {
        response.redirect('/oauth/signin?redirectTo=' + encodeURIComponent(request.url))
        return
    }
    next()
}

export interface MockAMO {
    app: express.Application
    extensionVersionUploads: ExtensionVersionUpload[]
}

export interface ExtensionVersionUpload {
    slug: string
    versionId: number
    hasSources?: boolean
    sourcesFileName?: string
    releaseNotes?: string
    notesToReviewer?: string
}

export const createMockAMOServer = ({
    email,
    password,
    totpSecret,
}: {
    email: string
    password: string
    totpSecret: string
}): MockAMO => {
    const extensionVersionUploads: ExtensionVersionUpload[] = []

    const app = express()

    const formDataBodyParser = bodyParser.urlencoded({ extended: false })

    app.use(morgan('dev'))
    app.use(cookieParser())

    let enteredEmail = false
    let enteredPassword = false
    app.route('/oauth/signin')
        .get((request, response) => {
            response.sendFile(path.join(AMO_FIXTURES_DIR, 'signin_email.html'))
        })
        .post(formDataBodyParser, (request, response) => {
            if (!enteredEmail) {
                if (!request.body || request.body.email !== email) {
                    response.status(401).send('Wrong email')
                    return
                }
                enteredEmail = true
                response.sendFile(path.join(AMO_FIXTURES_DIR, 'signin_password.html'))
                return
            }
            if (!enteredPassword) {
                if (!request.body || request.body.password !== password) {
                    response.status(401).send('Wrong password')
                    return
                }
                enteredPassword = true
                response.sendFile(path.join(AMO_FIXTURES_DIR, 'signin_2fa.html'))
                return
            }
            if (
                !request.body ||
                !request.body.totpCode ||
                !authenticator.verify({ token: request.body.totpCode, secret: totpSecret })
            ) {
                response.status(401).send('Wrong 2FA code')
            }
            response.cookie('signedIn', 'true')
            response.redirect(303, request.query.redirectTo)
        })

    // Submit
    app.route('/en-US/developers/addon/:slug/versions/submit/')
        .get(checkAuth, (request, response, next) => {
            response.sendFile(path.join(AMO_FIXTURES_DIR, 'submit.html'), next)
        })
        .post(
            checkAuth,
            wrap((request, response) => {
                const versionId = extensionVersionUploads.length
                extensionVersionUploads.push({ slug: request.params.slug, versionId })
                response.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/source`)
            })
        )

    // Sources
    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/source')
        .get(checkAuth, (request, response, next) => {
            response.sendFile(path.join(AMO_FIXTURES_DIR, 'sources.html'), next)
        })
        .post(
            checkAuth,
            wrap(async (request, response) => {
                const versionId = Number(request.params.versionId)
                const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
                if (!extensionVersionUpload) {
                    response.status(404).send(`Extension version upload ${versionId} not found`)
                    return
                }
                const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
                    const form = new IncomingForm()
                    form.parse(request, (error, fields, files) => (error ? reject(error) : resolve([fields, files])))
                })
                if (!fields.has_source) {
                    response.status(400).send('No option chosen')
                    return
                }
                if (fields.has_source === 'yes') {
                    if (!files.source) {
                        response.status(400).send('No sources zip provided')
                        return
                    }
                    extensionVersionUpload.sourcesFileName = files.source.name
                }
                extensionVersionUpload.hasSources = fields.has_source === 'yes'
                response.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/details`)
            })
        )

    // Details
    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/details')
        .get(checkAuth, (request, response, next) => {
            response.sendFile(path.join(AMO_FIXTURES_DIR, 'details.html'), next)
        })
        .post(checkAuth, formDataBodyParser, (request, response) => {
            const versionId = Number(request.params.versionId)
            const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
            if (!extensionVersionUpload) {
                response.status(404).send(`Extension version upload ${versionId} not found`)
                return
            }
            extensionVersionUpload.releaseNotes = request.body['release_notes_en-us']
            extensionVersionUpload.notesToReviewer = request.body.approval_notes
            response.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/finish`)
        })

    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/finish').get(
        checkAuth,
        (request, response, next) => {
            const versionId = Number(request.params.versionId)
            const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
            if (!extensionVersionUpload) {
                response.status(404).send(`Extension version upload ${versionId} not found`)
                return
            }
            response.sendFile(path.join(AMO_FIXTURES_DIR, 'finish.html'), next)
        }
    )

    return { app, extensionVersionUploads }
}

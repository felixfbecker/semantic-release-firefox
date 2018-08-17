// tslint:disable:no-console

import { wrap } from 'async-middleware'
import * as bodyParser from 'body-parser'
import cookieParser = require('cookie-parser')
import express = require('express')
import { Fields, Files, IncomingForm } from 'formidable'
import morgan = require('morgan')
import * as path from 'path'

const AMO_FIXTURES_DIR = __dirname + '/../../fixtures/amo'

const checkAuth: express.Handler = (req, res, next) => {
    if (req.cookies.signedIn !== 'true') {
        res.redirect('/oauth/signin?redirectTo=' + encodeURIComponent(req.url))
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

export const createMockAMOServer = ({ email, password }: { email: string; password: string }): MockAMO => {
    const extensionVersionUploads: ExtensionVersionUpload[] = []

    const app = express()

    const formDataBodyParser = bodyParser.urlencoded({ extended: false })

    app.use(morgan('dev'))
    app.use(cookieParser())

    app.route('/oauth/signin')
        .get((req, res, next) => {
            res.sendFile(path.join(AMO_FIXTURES_DIR, 'signin.html'))
        })
        .post(formDataBodyParser, (req, res, next) => {
            if (!req.body || req.body.email !== email || req.body.__password !== password) {
                res.status(401).send('Wrong credentials')
                return
            }
            res.cookie('signedIn', 'true')
            res.redirect(303, req.query.redirectTo)
        })

    // Submit
    app.route('/en-US/developers/addon/:slug/versions/submit/')
        .get(checkAuth, (req, res, next) => {
            res.sendFile(path.join(AMO_FIXTURES_DIR, 'submit.html'), next)
        })
        .post(
            checkAuth,
            wrap(async (req, res) => {
                const versionId = extensionVersionUploads.length
                extensionVersionUploads.push({ slug: req.params.slug, versionId })
                res.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/source`)
            })
        )

    // Sources
    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/source')
        .get(checkAuth, (req, res, next) => {
            res.sendFile(path.join(AMO_FIXTURES_DIR, 'sources.html'), next)
        })
        .post(
            checkAuth,
            wrap(async (req, res, next) => {
                const versionId = Number(req.params.versionId)
                const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
                if (!extensionVersionUpload) {
                    res.status(404).send(`Extension version upload ${versionId} not found`)
                    return
                }
                const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
                    const form = new IncomingForm()
                    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve([fields, files])))
                })
                if (!fields.has_source) {
                    res.status(400).send('No option chosen')
                    return
                }
                if (fields.has_source === 'yes') {
                    if (!files.source) {
                        res.status(400).send('No sources zip provided')
                        return
                    }
                    extensionVersionUpload.sourcesFileName = files.source.name
                }
                extensionVersionUpload.hasSources = fields.has_source === 'yes'
                res.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/details`)
            })
        )

    // Details
    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/details')
        .get(checkAuth, (req, res, next) => {
            res.sendFile(path.join(AMO_FIXTURES_DIR, 'details.html'), next)
        })
        .post(checkAuth, formDataBodyParser, (req, res, next) => {
            const versionId = Number(req.params.versionId)
            const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
            if (!extensionVersionUpload) {
                res.status(404).send(`Extension version upload ${versionId} not found`)
                return
            }
            extensionVersionUpload.releaseNotes = req.body['releasenotes_en-us']
            extensionVersionUpload.notesToReviewer = req.body.approvalnotes
            res.redirect(303, `/en-US/developers/addon/sourcegraph/versions/submit/${versionId}/finish`)
        })

    app.route('/en-US/developers/addon/sourcegraph/versions/submit/:versionId/finish').get(
        checkAuth,
        (req, res, next) => {
            const versionId = Number(req.params.versionId)
            const extensionVersionUpload = extensionVersionUploads.find(upload => upload.versionId === versionId)
            if (!extensionVersionUpload) {
                res.status(404).send(`Extension version upload ${versionId} not found`)
                return
            }
            res.sendFile(path.join(AMO_FIXTURES_DIR, 'finish.html'), next)
        }
    )

    return { app, extensionVersionUploads }
}

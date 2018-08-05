import { PrepareConfig, prepareFirefoxExtension } from './prepare'
import { PublishConfig, publishFirefoxExtension } from './publish'
import { PrepareStep, PublishStep, VerifyConditionsStep } from './semantic-release'
import { VerifyConditionsConfig, verifyFirefoxConditions } from './verify'

let verifed = false
let prepared = false

export const verifyConditions: VerifyConditionsStep<VerifyConditionsConfig> = async (config, context) => {
    verifyFirefoxConditions(context)
    verifed = true
}

export const prepare: PrepareStep<PrepareConfig> = async (config, { nextRelease: { version }, logger, cwd }) => {
    if (!verifed) {
        throw new Error(
            'verifyConditions was not called. semantic-release-firefox needs to be included in the verifyConditions step'
        )
    }
    await prepareFirefoxExtension(config, { version, cwd, logger })
    prepared = true
}

export const publish: PublishStep<PublishConfig> = async (config, { nextRelease: { notes }, env, logger }) => {
    if (!prepared) {
        throw new Error('prepare was not called. semantic-release-firefox needs to be included in the prepare step')
    }
    await publishFirefoxExtension(config, { notes, email: env.FIREFOX_EMAIL, password: env.FIREFOX_PASSWORD, logger })
}

import { VerifyConditionsStep } from './semantic-release'

export interface VerifyConditionsConfig {}

export const verifyFirefoxConditions: VerifyConditionsStep<VerifyConditionsConfig> = (config, { env }) => {
    const { FIREFOX_EMAIL, FIREFOX_PASSWORD } = env
    if (!FIREFOX_EMAIL || !FIREFOX_PASSWORD) {
        throw new Error('Environment variables FIREFOX_EMAIL and FIREFOX_PASSWORD must be set')
    }
}

export interface VerifyConditionsConfig {}

export const verifyFirefoxConditions = ({ env }: { env: Record<string, string> }) => {
    const { FIREFOX_EMAIL, FIREFOX_PASSWORD, FIREFOX_TOTP_SECRET } = env
    if (!FIREFOX_EMAIL || !FIREFOX_PASSWORD) {
        throw new Error('Environment variables FIREFOX_EMAIL, FIREFOX_PASSWORD and FIREFOX_TOTP_SECRET must be set')
    }
    if (!FIREFOX_TOTP_SECRET) {
        throw new Error(
            'Mozilla AMO requires 2-factor authentication now. Please enable 2FA for the AMO account and add the 2FA secret as the environment variable FIREFOX_TOTP_SECRET. Click on "Can\'t scan code?" when being shown the setup QR code to reveal the TOTP secret in plain text.'
        )
    }
}

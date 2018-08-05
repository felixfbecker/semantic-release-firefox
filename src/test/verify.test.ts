import * as assert from 'assert'
import { verifyFirefoxConditions } from '../verify'

describe('verifyFirefoxConditions()', () => {
    it('should throw if FIREFOX_EMAIL is not set', () => {
        assert.throws(() => {
            verifyFirefoxConditions({ env: { FIREFOX_PASSWORD: 'abc' } })
        })
    })
    it('should throw if FIREFOX_PASSWORD is not set', () => {
        assert.throws(() => {
            verifyFirefoxConditions({ env: { FIREFOX_EMAIL: 'test@test.com' } })
        })
    })
})

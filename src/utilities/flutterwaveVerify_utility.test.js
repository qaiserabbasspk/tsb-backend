const axios = require('axios')
const { verifyFlutterwaveTransaction } = require('./flutterwaveVerify_utility')

jest.mock('axios')

const OLD_ENV = process.env

beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...OLD_ENV, FLW_SECRET_KEY: 'test-secret' }
})

afterAll(() => {
    process.env = OLD_ENV
})

function mockFlwResponse({ amount, currency, txRef = 'qb-1', status = 'successful' }) {
    axios.get.mockResolvedValue({
        data: {
            status: 'success',
            data: { status, tx_ref: txRef, amount, currency },
        },
    })
}

describe('verifyFlutterwaveTransaction', () => {
    test('accepts a matching amount and currency', async () => {
        mockFlwResponse({ amount: 130, currency: 'NGN', txRef: 'qb-1' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(true)
    })

    test('rejects when the charged currency differs from the expected currency', async () => {
        // Guest paid 500 NGN for a 500 GHS booking — same number, wrong currency
        mockFlwResponse({ amount: 500, currency: 'NGN', txRef: 'qb-1' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 500, 'GHS')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/currency mismatch/i)
    })

    test('matches currency case-insensitively', async () => {
        mockFlwResponse({ amount: 130, currency: 'ngn', txRef: 'qb-1' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(true)
    })

    test('fails closed when no expected currency is supplied', async () => {
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, '')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/currency is required/i)
        expect(axios.get).not.toHaveBeenCalled()
    })

    test('rejects an underpaid amount even when currency matches', async () => {
        mockFlwResponse({ amount: 50, currency: 'NGN', txRef: 'qb-1' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/amount mismatch/i)
    })

    test('rejects a tx_ref mismatch', async () => {
        mockFlwResponse({ amount: 130, currency: 'NGN', txRef: 'other-ref' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/reference mismatch/i)
    })

    test('rejects an unsuccessful transaction status', async () => {
        mockFlwResponse({ amount: 130, currency: 'NGN', txRef: 'qb-1', status: 'failed' })
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(false)
    })

    test('returns not-configured when the secret key is missing', async () => {
        delete process.env.FLW_SECRET_KEY
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/not configured/i)
    })

    test('handles a network failure without throwing', async () => {
        axios.get.mockRejectedValue(new Error('network down'))
        const result = await verifyFlutterwaveTransaction('123', 'qb-1', 130, 'NGN')
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/could not reach flutterwave/i)
    })
})

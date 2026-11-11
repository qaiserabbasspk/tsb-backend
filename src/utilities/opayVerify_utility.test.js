const axios = require('axios')
const { verifyOpayTransaction } = require('./opayVerify_utility')

jest.mock('axios')

const OLD_ENV = process.env

beforeEach(() => {
    jest.resetAllMocks()
    process.env = {
        ...OLD_ENV,
        OPAY_PUBLIC_KEY: 'test-public',
        OPAY_PRIVATE_KEY: 'test-private',
        OPAY_MERCHANT_ID: 'test-merchant',
    }
})

afterAll(() => {
    process.env = OLD_ENV
})

function mockOpayResponse({ totalKobo, currency = 'NGN', reference = 'qb-1', status = 'SUCCESS', orderNo = 'order-1' }) {
    axios.post.mockResolvedValue({
        data: {
            code: '00000',
            message: 'SUCCESSFUL',
            data: { status, reference, orderNo, amount: { total: totalKobo, currency } },
        },
    })
}

describe('verifyOpayTransaction', () => {
    test('accepts a matching amount (kobo converted to naira)', async () => {
        mockOpayResponse({ totalKobo: 13000, reference: 'qb-1' }) // 130 NGN
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(true)
        expect(result.amount).toBe(130)
    })

    test('rejects when the charged currency is not NGN', async () => {
        mockOpayResponse({ totalKobo: 13000, currency: 'USD', reference: 'qb-1' })
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/currency mismatch/i)
    })

    test('rejects an underpaid amount', async () => {
        mockOpayResponse({ totalKobo: 5000, reference: 'qb-1' }) // 50 NGN
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/amount mismatch/i)
    })

    test('rejects a reference mismatch', async () => {
        mockOpayResponse({ totalKobo: 13000, reference: 'other-ref' })
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/reference mismatch/i)
    })

    test('rejects a non-SUCCESS status', async () => {
        mockOpayResponse({ totalKobo: 13000, reference: 'qb-1', status: 'PENDING' })
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/PENDING/)
    })

    test('rejects a non-00000 response code', async () => {
        axios.post.mockResolvedValue({ data: { code: '90000', message: 'Order not found' } })
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/90000/)
    })

    test('returns not-configured when keys are missing', async () => {
        delete process.env.OPAY_PRIVATE_KEY
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/not configured/i)
        expect(axios.post).not.toHaveBeenCalled()
    })

    test('requires a reference', async () => {
        const result = await verifyOpayTransaction('', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/reference is required/i)
    })

    test('handles a network failure without throwing', async () => {
        axios.post.mockRejectedValue(new Error('network down'))
        const result = await verifyOpayTransaction('qb-1', 130)
        expect(result.valid).toBe(false)
        expect(result.reason).toMatch(/could not reach opay/i)
    })
})

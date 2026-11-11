const axios = require('axios')
const ExchangeRate = require('../models/exchangeRate')
const { getRate, convertAmount } = require('./currency_utility')

jest.mock('axios')
jest.mock('../models/exchangeRate')

const OLD_ENV = process.env

beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...OLD_ENV, FLW_SECRET_KEY: 'test-secret', EXCHANGE_RATE_MARKUP_PERCENT: '0' }
})

afterAll(() => {
    process.env = OLD_ENV
})

function mockFlwRate(rate) {
    axios.get.mockResolvedValue({ data: { status: 'success', data: { rate } } })
}

describe('getRate', () => {
    test('returns identity rate for a same-currency pair without calling Flutterwave', async () => {
        const result = await getRate('NGN', 'NGN')
        expect(result).toEqual({ rate: 1, fetchedAt: expect.any(Date), stale: false })
        expect(axios.get).not.toHaveBeenCalled()
    })

    test('serves a fresh cached rate without a live fetch', async () => {
        ExchangeRate.findOne.mockResolvedValue({ rate: 1.5, fetchedAt: new Date() })
        const result = await getRate('EUR', 'CAD')
        expect(result.rate).toBe(1.5)
        expect(result.stale).toBe(false)
        expect(axios.get).not.toHaveBeenCalled()
    })

    test('fetches live and caches when the stored rate is stale', async () => {
        const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000) // 7h old, past the 6h TTL
        ExchangeRate.findOne.mockResolvedValue({ rate: 1.4, fetchedAt: staleDate })
        mockFlwRate(1.55)
        ExchangeRate.findOneAndUpdate.mockResolvedValue({ rate: 1.55, fetchedAt: new Date() })

        const result = await getRate('EUR', 'CAD')
        expect(axios.get).toHaveBeenCalledTimes(1)
        expect(result.rate).toBe(1.55)
        expect(result.stale).toBe(false)
    })

    test('applies the configured markup on a live fetch', async () => {
        process.env.EXCHANGE_RATE_MARKUP_PERCENT = '3'
        ExchangeRate.findOne.mockResolvedValue(null)
        mockFlwRate(100)
        ExchangeRate.findOneAndUpdate.mockImplementation((_query, update) =>
            Promise.resolve({ rate: update.rate, fetchedAt: update.fetchedAt })
        )

        const result = await getRate('USD', 'KES')
        expect(result.rate).toBeCloseTo(103, 5)
    })

    test('falls back to a stale cached rate when the live fetch fails', async () => {
        const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000)
        ExchangeRate.findOne.mockResolvedValue({ rate: 1.4, fetchedAt: staleDate })
        axios.get.mockRejectedValue(new Error('network down'))

        const result = await getRate('EUR', 'CAD')
        expect(result.rate).toBe(1.4)
        expect(result.stale).toBe(true)
    })

    test('returns null - never a fabricated rate - when nothing is available at all', async () => {
        ExchangeRate.findOne.mockResolvedValue(null)
        axios.get.mockRejectedValue(new Error('network down'))

        const result = await getRate('EUR', 'CAD')
        expect(result).toBeNull()
    })

    test('returns null when FLW_SECRET_KEY is not configured', async () => {
        process.env.FLW_SECRET_KEY = ''
        ExchangeRate.findOne.mockResolvedValue(null)

        const result = await getRate('EUR', 'CAD')
        expect(result).toBeNull()
        expect(axios.get).not.toHaveBeenCalled()
    })
})

describe('convertAmount', () => {
    test('converts using the resolved rate, rounded up to a whole number', async () => {
        ExchangeRate.findOne.mockResolvedValue({ rate: 1.23456, fetchedAt: new Date() })
        const result = await convertAmount(100, 'EUR', 'CAD')
        expect(result).toBe(124)
    })

    test('returns null when no rate is available', async () => {
        ExchangeRate.findOne.mockResolvedValue(null)
        axios.get.mockRejectedValue(new Error('network down'))
        const result = await convertAmount(100, 'EUR', 'CAD')
        expect(result).toBeNull()
    })
})

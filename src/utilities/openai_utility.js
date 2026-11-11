const axios = require('axios')

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/**
 * Sends a chat completion request to OpenAI and returns the assistant's
 * message content. Throws if OPENAI_API_KEY is not configured or the
 * request fails — callers decide how to handle/log that.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {boolean} [params.jsonResponse] - ask the model to return strict JSON
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<string>} raw assistant message content
 */
async function chatCompletion({
    systemPrompt,
    userPrompt,
    jsonResponse = false,
    maxTokens = 700,
    temperature = 0.6,
}) {
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.AI_CONCIERGE_MODEL || 'gpt-4.1-mini'

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured')
    }

    const response = await axios.post(
        OPENAI_ENDPOINT,
        {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: maxTokens,
            temperature,
            ...(jsonResponse ? { response_format: { type: 'json_object' } } : {}),
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 20000,
        }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
        throw new Error('OpenAI returned an empty response')
    }
    return content
}

module.exports = { chatCompletion }

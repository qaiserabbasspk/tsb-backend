
const crypto = require('crypto');

function generateHotelbedsSignature() {
  const apiKey = process.env.HOTELBEDS_API_KEY;
  const apiSecret = process.env.HOTELBEDS_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      'HOTELBEDS_API_KEY and HOTELBEDS_API_SECRET are required'
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const signature = crypto
    .createHash('sha256')
    .update(`${apiKey}${apiSecret}${timestamp}`)
    .digest('hex');

  return signature;
}

function getHotelbedsHeaders() {
  return {
    'Api-Key': process.env.HOTELBEDS_API_KEY,
    'X-Signature': generateHotelbedsSignature(),
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json'
  };
}

module.exports = {
  generateHotelbedsSignature,
  getHotelbedsHeaders
};

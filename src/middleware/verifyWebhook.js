/**
 * Verifies that incoming webhook requests genuinely came from Flutterwave.
 * Flutterwave sends the hash you configured on your dashboard in the
 * 'verif-hash' header. Compare it to your stored FLW_SECRET_HASH.
 * Docs: https://developer.flutterwave.com/docs/integration-guides/webhooks
 */
module.exports = function verifyWebhook(req, res, next) {
  const signature = req.headers['verif-hash'];

  if (!signature || signature !== process.env.FLW_SECRET_HASH) {
    console.warn('[Webhook] Invalid or missing signature — rejecting request');
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  next();
};

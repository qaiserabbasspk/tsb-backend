const cache = require("memory-cache");

// This middleware function checks if the response has already been cached using the request URL as the cache key.
// If the response is already cached, it is returned immediately.
// If not, the response is modified to cache the response body and then sent to the client.

module.exports = {
  cacheMiddleware: (duration) => {
    return (req, res, next) => {
      const key = "__express__" + req.originalUrl || req.url;
      const cachedResponse = cache.get(key);
      if (cachedResponse) {
        return res.send(cachedResponse);
      } else {
        res.sendResponse = res.send;
        res.send = (body) => {
          cache.put(key, body, duration * 1000);
          res.sendResponse(body);
        };
        next();
      }
    };
  },
};

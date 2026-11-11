require("dotenv").config();
const ResponseMessage = require("../utilities/messages_utility");

function versioningMiddleware(req, res, next) {
  const versionMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (versionMatch) {
    req.version = versionMatch[process.env.API_VERSION];
  } else {
    res.status(400).json({ message: ResponseMessage.VERSIONING });
  }
  next();
}

module.exports = versioningMiddleware;

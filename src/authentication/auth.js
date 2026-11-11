const { verify } = require("jsonwebtoken");
const Response = require("../utilities/response_utility");
const ResponseMessage = require("../utilities/messages_utility");
const Host = require("../models/hosts");
const Administrator = require("../models/administrator");
const { getSettings } = require("../utilities/settings_utility");

module.exports = {
  bearerToken: (req, res, next) => {
    let token = req.get("authorization");
    if (token) {
      token = token.slice(7);
      verify(token, process.env.JWK_SECRET, (err, decodedObject) => {
        if (err) {
          const status = err.name === 'TokenExpiredError' ? 401 : 400;
          return Response.errorResponse(res, status, err);
        } else {
          req.user = decodedObject?.key;
          next();
        }
      });
    } else {
      return Response.customResponse(res, 401, ResponseMessage.ACCESS_DENIED);
    }
  },

  // Does not require a token. If a valid one is present, req.user is set
  // (so the route can tell an authenticated admin/host apart from a guest);
  // otherwise the request proceeds anonymously instead of being rejected.
  optionalBearerToken: (req, res, next) => {
    let token = req.get("authorization");
    if (!token) return next();

    token = token.slice(7);
    verify(token, process.env.JWK_SECRET, (err, decodedObject) => {
      if (!err) {
        req.user = decodedObject?.key;
      }
      next();
    });
  },

  // Must run after bearerToken (needs req.user). Re-fetches the host because
  // isEmailVerified can flip true after the token was issued, so the JWT
  // payload itself can't be trusted for this check.
  requireHostVerified: async (req, res, next) => {
    try {
      // Super admin can switch host email verification off entirely.
      const { hostEmailVerificationEnabled } = await getSettings();
      if (!hostEmailVerificationEnabled) {
        return next();
      }
      const host = await Host.findById(req.user?.id);
      if (!host) {
        return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
      }
      if (!host.isEmailVerified) {
        return Response.customResponse(
          res,
          403,
          `You need to verify your email first. Check your inbox for the verification link, or resend it from the Verify Email page. Need help? Contact ${process.env.SUPPORT_EMAIL}.`
        );
      }
      next();
    } catch (err) {
      return Response.errorResponse(res, 500, err.message || err);
    }
  },

  // Super-admin gate. Must run after bearerToken. Only a token whose id resolves
  // to an Administrator document passes — host/guest tokens are rejected.
  requireAdministrator: async (req, res, next) => {
    try {
      const admin = await Administrator.findById(req.user?.id);
      if (!admin) {
        return Response.customResponse(
          res,
          403,
          "Administrator access required."
        );
      }
      next();
    } catch (err) {
      return Response.errorResponse(res, 500, err.message || err);
    }
  },
};

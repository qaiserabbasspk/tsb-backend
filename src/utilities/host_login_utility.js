const Host = require("../models/hosts");

const { sign } = require("jsonwebtoken");
const { compareSync } = require("bcryptjs");

const DateUtil = require("./date_utility");
const Response = require("./response_utility");
const ResponseMessage = require("./messages_utility");
const { loginValidation } = require("../validations/login");
const { createActivityLog } = require("./activitylog_utility");
const { getSettings } = require("./settings_utility");
const moduleName = `SignIn`;
const loginStatus = 1;

const hostLogin = async (req, res, model) => {
  const body = req.body;
  const { error } = loginValidation(body);

  if (error) {
    return Response.sendValidationErrorMessage(res, 400, error);
  }

  const user = await model.findOne({ email: body.username });

  if (!user) {
    return Response.customResponse(res, 400, ResponseMessage.INVALID_USERNAME);
  }

  if (!user.status) {
    return Response.customResponse(res, 400, ResponseMessage.UNAUTHORIZED_USER);
  }

  var status, dbId;
  var userStatus = {};

  if (user.code.startsWith("HO")) {
    userStatus = await Host.findOne({ code: user.code });
    status = userStatus.status;
    dbId = userStatus._id;
  }

  const validPassword = compareSync(body.password, user.password);

  if (!validPassword) {
    return Response.customResponse(res, 400, ResponseMessage.INVALID_PASSWORD);
  }

  user.password = undefined;

  // When the super admin has turned host email verification off, report hosts as
  // verified so the portal's verification banner/gate never blocks them.
  const { hostEmailVerificationEnabled } = await getSettings();
  const effectiveEmailVerified =
    user.isEmailVerified || !hostEmailVerificationEnabled;

  const jsontoken = sign({ key: user }, process.env.JWK_SECRET, {
    expiresIn: process.env.JWK_EXPIRATION,
  });

  const action = `Account ${moduleName} For - ${user.code}`;
  const person = user.code;

  await createActivityLog(moduleName, action, person);

  return res.status(res.statusCode).json({
    loginStatus: loginStatus,
    id: user._id,
    code: user.code,
    name: user.name,
    status: status,
    isAdmin: user.isAdmin,
    isHost: user.isHost,
    isEmailVerified: effectiveEmailVerified,
    avatar: user.avatar,
    email: user.email,
    authorization: {
      validFor: process.env.JWK_EXPIRATION,
      validFrom: DateUtil.validFromDate(),
      validUpto: DateUtil.expirationDate(),
      token: jsontoken,
    },
  });
};

module.exports = { hostLogin };

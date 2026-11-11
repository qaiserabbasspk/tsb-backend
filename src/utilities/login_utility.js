const Role = require("../models/roles");
const PropertyOwner = require("../models/propertyOwners");
const Tenant = require("../models/tenants");
const HandyMan = require("../models/HandyMen");
const PropertyAgent = require("../models/propertyAgents");

const { sign } = require("jsonwebtoken");
const { compareSync } = require("bcryptjs");

const DateUtil = require("../utilities/date_utility");
const Response = require("../utilities/response_utility");
const ResponseMessage = require("./messages_utility");
const { loginValidation } = require("../validations/login");
const { createActivityLog } = require("../utilities/activitylog_utility");
const moduleName = `SignIn`;
const loginStatus = 1;

const login = async (req, res, model) => {
  const body = req.body;
  const { error } = loginValidation(body);

  if (error) {
    return Response.sendValidationErrorMessage(res, 400, error);
  }

  const user = await model.findOne({ email: body.username });

  // console.log("loggedUser: " + user);

  if (!user) {
    return Response.customResponse(res, 400, ResponseMessage.INVALID_USERNAME);
  }

  if (!user.status) {
    return Response.customResponse(res, 400, ResponseMessage.UNAUTHORIZED_USER);
  }

  var status,dbId,propertyOwnerCode;
  var userStatus = {};

  if (user.code.startsWith("PO") && user.isOwner == 0) {
    userStatus = await PropertyOwner.findOne({ code: user.code });
    status = userStatus.status;
    dbId = userStatus._id;
  } else if (user.code.startsWith("TN") && user.isOwner == 0 || user.code.startsWith("TN") && user.isOwner == 1) {
    userStatus = await Tenant.findOne({ code: user.code });
    status = userStatus.status;
    dbId = userStatus._id;
  } else if (user.code.startsWith("HM") && user.isOwner == 0 || user.code.startsWith("HM") && user.isOwner == 1) {
    userStatus = await HandyMan.findOne({ code: user.code });
    status = userStatus.status;
    dbId = userStatus._id;
  } else if (user.code.startsWith("AG") && user.isOwner == 0 || user.code.startsWith("AG") && user.isOwner == 1) {
    userStatus = await PropertyAgent.findOne({ code: user.code });
    status = userStatus.status;
    dbId = userStatus._id;
    propertyOwnerCode = userStatus.ownerCode;
  } else if (user.code.startsWith("SO") && user.isOwner == 1 || user.code.startsWith("PO") && user.isOwner == 1) {
    userStatus = await PropertyOwner.findOne({ code: user.code });
    // status = userStatus.status;
    // dbId = userStatus._id;
    status = 1;
  }
  // console.log('1:' + userStatus + status);

  const validPassword = compareSync(body.password, user.password);

  if (!validPassword) {
    return Response.customResponse(res, 400, ResponseMessage.INVALID_PASSWORD);
  }

  user.password = undefined;

  const jsontoken = sign({ key: user }, process.env.JWK_SECRET, {
    expiresIn: process.env.JWK_EXPIRATION,
  });

  // GET THE USER ROLE AND ASSOCIATED PERMISSIONS
  const role = await Role.findById({ _id: user.roleId });
  const claims = role.claims;

  // GET THE ADMIN ROLE AND ASSOCIATED PERMISSIONS
  const superRole = await Role.findOne({ name: { $regex: /^AD/, $options: 'i' } });
  if (!superRole) {
    // throw new Error("Role not found");
    return Response.customResponse(res, 404, "ADMIN Role not found");
  }
  const roleSuper = superRole.name;
  const superClaims = superRole.claims;
  // console.log("role: " + roleSuper);
  // console.log("claims: " + superClaims);

  if (!role) {
    return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
  }

  const action = `Account ${moduleName} For - ${user.code}`;
  const person = user.code;

  await createActivityLog(moduleName, action, person);

  if (user.code.toLowerCase().startsWith("so") && user.isOwner == 1 || user.code.toLowerCase().startsWith("po") && user.isOwner == 1) {
    // SUPER ADMIN AND PROPERTY OWNER
    return res.status(res.statusCode).json({
      loginStatus: loginStatus,
      id: user.code.toLowerCase().startsWith("so") ? user.id : userStatus._id,
      name: user.name,
      systemOwner: user.code,
      status: status,
      avatar: user.avatar,
      username: user.email,
      role: role.name,
      isOwner: user.isOwner,
      // permissions: claims,
      permissions: superClaims,
      authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token: jsontoken,
      },
    });
  } else if (user.code.toLowerCase().startsWith("po") && user.isOwner == 0) {
    // PROPERTY OWNER
    return res.status(res.statusCode).json({
      loginStatus: loginStatus,
      id: dbId,
      name: user.name,
      propertyOwner: user.code,
      status: status,
      avatar: user.avatar,
      username: user.email,
      role: role.name,
      isOwner: user.isOwner,
      permissions: claims,
      authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token: jsontoken,
      },
    });
  } else if (user.code.toLowerCase().startsWith("tn") && user.isOwner == 0 || user.code.toLowerCase().startsWith("tn") && user.isOwner == 1) {
    // TENANT
    return res.status(res.statusCode).json({
      loginStatus: loginStatus,
      id: dbId,
      name: user.name,
      tenant: user.code,
      status: status,
      avatar: user.avatar,
      username: user.email,
      role: role.name,
      isOwner: user.isOwner,
      permissions: claims,
      authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token: jsontoken,
      },
    });
  } else if (user.code.toLowerCase().startsWith("hm") && user.isOwner == 0 || user.code.toLowerCase().startsWith("hm") && user.isOwner == 1) {
    // HANDYMAN
    return res.status(res.statusCode).json({
      loginStatus: loginStatus,
      id: dbId,
      name: user.name,
      handyMan: user.code,
      status: status,
      avatar: user.avatar,
      username: user.email,
      role: role.name,
      isOwner: user.isOwner,
      permissions: claims,
      authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token: jsontoken,
      },
    });
  } else if (user.code.toLowerCase().startsWith("ag") && user.isOwner == 0 || user.code.toLowerCase().startsWith("ag") && user.isOwner == 1) {
    // AGENT
    return res.status(res.statusCode).json({
      loginStatus: loginStatus,
      id: dbId,
      name: user.name,
      agent: user.code,
      status: status,
      avatar: user.avatar,
      username: user.email,
      role: role.name,
      isOwner: user.isOwner,
      propertyOwner: propertyOwnerCode,
      permissions: claims,
      authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token: jsontoken,
      },
    });
  }
};

module.exports = { login };

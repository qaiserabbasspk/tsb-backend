// MODELS
const Role = require("../../models/roles");
const Tenant = require("../../models/tenants");
const HandyMan = require("../../models/HandyMen");
const SystemUser = require("../../models/systemUsers");
const PropertyOwner = require("../../models/propertyOwners");
const PropertyAgent = require("../../models/propertyAgents");

// VALIDATIONS
const { systemUserValidation } = require("../../validations/systemUsers");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const { login } = require("../../utilities/login_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { changePassword } = require("../../utilities/changepassword_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { resetPassword } = require("../../utilities/resetpassword_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");
// const { findRole } = require("../../utilities/role_finder_utility");
const { createAccount } = require("../../utilities/accounts_utility");

const moduleName = `SystemUser`;

module.exports = {
  create: async (req, res) => {
    try {
      const body = req.body;
      const { error } = systemUserValidation(body);

      // Validation error handling
      if (error) return Response.sendValidationErrorMessage(res, 400, error);

      // Check for existing user
      const existingUser = await SystemUser.findOne({ email: body.email });
      if (existingUser) return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);

      // Validate role
      const role = await Role.findById(body.roleId);
      if (!role) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

      // Extract role name
      const roleName = role.name?.toLowerCase() || "";

      // Determine the code prefix based on the role
      let codePrefix = "SO"; // Default for generic users
      if (roleName.startsWith("o")) codePrefix = "PO"; // PropertyOwner
      else if (roleName.startsWith("t")) codePrefix = "TN"; // Tenant
      else if (roleName.startsWith("h")) codePrefix = "HM"; // HandyMan
      else if (roleName.startsWith("ag")) codePrefix = "AG"; // PropertyAgent

      // Generate unique code and hashed password
      const uniqueCode = unique.randomCode();
      const generatedCode = codePrefix + uniqueCode; // Code with appropriate prefix
      const hashedPassword = unique.passwordHash(body.password);

      // Prepare phone and address fields
      const phone = { ...body.phone };
      const address = { ...body.address };

      // Create SystemUser
      const user = new SystemUser({
        ownerCode: body.actionBy,
        code: generatedCode, // Use the same code
        name: body.name,
        email: body.email,
        roleId: body.roleId,
        status: 1,
        avatar: body.avatar.replace(/\s+/g, ""),
        isOwner: body.isOwner || 0,
        password: hashedPassword,
        phone,
        address,
        createdOn: DateUtil.currentDate(),
      });

      const newUser = await user.save();
      // console.log("SystemUser created:", newUser);

      // Log the action
      const action = `New ${moduleName} - ${generatedCode}`;
      await createActivityLog(moduleName, action, body.actionBy);
      await accountOpening(req, res);

      // Role-based account creation (if applicable)
      if (codePrefix !== "SO") {
        // Use the same code (generatedCode) for the role-specific account
        if (roleName.startsWith("o")) {
          await createAccount(PropertyOwner, newUser, generatedCode, "PropertyOwner", moduleName, body.actionBy);
        } else if (roleName.startsWith("t")) {
          await createAccount(Tenant, newUser, generatedCode, "Tenant", moduleName, body.actionBy);
        } else if (roleName.startsWith("h")) {
          await createAccount(HandyMan, newUser, generatedCode, "HandyMan", moduleName, body.actionBy);
        } else if (roleName.startsWith("ag")) {
          await createAccount(PropertyAgent, newUser, generatedCode, "PropertyAgent", moduleName, body.actionBy);
        }
      }

      // Send success response
      return Response.successResponse(res, 201, newUser);
    } catch (err) {
      // console.error("Error creating user:", err.message);
      return Response.errorResponse(res, 500, err.message);
    }
  },

  getUsers: async (req, res) => {
    try {
      const totalUsers = await SystemUser.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalUsers
      );

      if (totalUsers === 0) {
        return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      const users = await SystemUser.find()
        .sort({ _id: -1 })
        .skip(skip)
        .select("-password")
        .limit(pagination.pageSize)
        // .populate({ path: "role", select: "id name claims" });
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (users.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      pagination.data = users.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalUsers;


      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getUsersByRole: async (req, res) => {
    try {
      const role = await Role.findById(req.params.id);

      if (!role) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const roleId = role._id;
      const totalUsers = await SystemUser.countDocuments({
        roleId: roleId,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalUsers
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const users = await SystemUser.find()
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ])
        .select("-password")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalUsers === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = users.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalUsers;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getUsersByCreator: async (req, res) => {
    try {
      const role = await Role.find({ ownerCode: req.params.creator });

      if (!role) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const owner = req.params.creator;
      const totalUsers = await SystemUser.countDocuments({
        ownerCode: owner,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalUsers
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const users = await SystemUser.find({ ownerCode: owner })
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ])
        .select("-password")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalUsers === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = users.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalUsers;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  get: async (req, res) => {
    try {
      const user = await SystemUser.findById(req.params.id)
        .select("-password")
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (!user) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const userData = {
        id: user._id,
        code: user.code,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar.replace(/\s+/g, ""),
        status: user.status,
        createdOn: user.createdOn,
        updatedOn: user.updatedOn,
        role: user.role ? user.role.name : null,
        permissions: user.role ? user.role.claims : null,
      };

      return Response.successResponse(res, res.statusCode, userData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const user = await SystemUser.findById(body.id);

      if (!user) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      // Check if the email is being updated
      if (body.email && body.email !== user.email) {
        const existingEmail = await SystemUser.findOne({
          email: body.email,
        });

        if (existingEmail) {
          return Response.customResponse(
            res,
            404,
            ResponseMessage.EMAIL_EXISTS
          );
        }
        user.email = body.email;
      }

      user.ownerCode = body.actionBy || user.ownerCode;
      user.name = body.name || user.name;
      user.avatar = body.avatar.replace(/\s+/g, "") || user.avatar;
      user.status = body.status;
      user.address = body.address || user.address;
      user.actionBy = body.userId || user.actionBy;
      user.actionBy = body.userId || user.actionBy;
      user.email = body.email || user.email;
      user.roleId = user.roleId;
      user.isOwner = user.isOwner;
      user.password = user.password;
      user.updatedOn = DateUtil.currentDate();

      const updatedUser = await user.save();

      const action = `Updated ${moduleName} - ${user.code}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);

      return res.status(res.statusCode).json(updatedUser);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const param = req.params;
      const userId = param.userId;

      const user = await SystemUser.findById(param.id);

      if (!user) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await user.deleteOne();

      const action = `Deleted ${moduleName} - ${user.code}`;
      await createActivityLog(moduleName, action, userId);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  changePassword: async (req, res) => {
    await changePassword(req, res, SystemUser, moduleName);
  },

  resetPassword: async (req, res) => {
    await resetPassword(req, res, SystemUser, moduleName);
  },

  login: async (req, res) => {
    await login(req, res, SystemUser);
  },
};

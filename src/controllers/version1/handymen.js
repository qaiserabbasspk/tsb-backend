// MODELS
const Role = require("../../models/roles");
const HandyMan = require("../../models/HandyMen");
const SystemUser = require("../../models/systemUsers");
const { findRole } = require("../../utilities/role_finder_utility");

// VALIDATIONS
const { handyManValidation } = require("../../validations/handymen");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const { login } = require("../../utilities/login_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { resetPassword } = require("../../utilities/resetpassword_utility");
const { changePassword } = require("../../utilities/changepassword_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");

const moduleName = `HandyMan`;

module.exports = {

  create: async (req, res) => {
    try {
      const body = req.body;
      const { error } = handyManValidation(body);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const existingHandyMan = await HandyMan.findOne({
        email: body.username,
        name: body.name,
      });

      if (existingHandyMan) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const phone = { ...body.phone };
      const address = { ...body.address };

      const uniqueCode = unique.randomCode();
      const hashedPassword = unique.passwordHash(body.password);

      // Find a role where the name starts with "H" -HANDYMAN
      const role = await findRole("H");

      if (!role) {
        return Response.customResponse(res, 404, "No role found with name starting with 'H' for HANDYMAN");
      }

      const handyMan = HandyMan({
        ownerCode: body.actionBy,
        code: "HM" + uniqueCode,
        name: body.name,
        email: body.email,
        roleId: role._id,
        status: 1,
        avatar: body.avatar.replace(/\s+/g, ""),
        isOwner: 0,
        password: hashedPassword,
        phone,
        address,
        createdOn: DateUtil.currentDate(),
      });

      const newHandyMan = await handyMan.save();

      const action = `New ${moduleName} - ${"HM" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      if (newHandyMan._id !== "" || newHandyMan != null) {
        const account = new SystemUser({
          _id: newHandyMan._id,
          ownerCode: newHandyMan.ownerCode,
          code: newHandyMan.code,
          name: newHandyMan.name,
          email: newHandyMan.email,
          roleId: newHandyMan.roleId,
          status: 1,
          avatar: newHandyMan.avatar,
          isOwner: 0,
          password: newHandyMan.password,
          phone: newHandyMan.phone,
          address: newHandyMan.address,
          createdOn: DateUtil.currentDate(),
        });

        await account.save();
        await createActivityLog("SystemUser", `New SystemUser - ${newHandyMan.name}`, person);
        await accountOpening(req, res);
      }

      return Response.successResponse(res, 201, newHandyMan);

    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getHandyMen: async (req, res) => {
    try {
      const totalHandyMen = await HandyMan.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalHandyMen
      );

      if (totalHandyMen == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      // Fetch HandyMen with population
      const handyMen = await HandyMan.find()
        .sort({ _id: -1 })
        .skip(skip)
        .select("-password")
        .limit(pagination.pageSize)
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (handyMen.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      pagination.data = handyMen.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalHandyMen;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getHandyMenByRole: async (req, res) => {
    try {
      const role = await Role.findById(req.params.id);

      if (!role) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const roleId = role._id;
      const totalHandyMen = await HandyMan.countDocuments({
        roleId: roleId,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalHandyMen
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const HandyMen = await HandyMan.find()
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

      if (totalHandyMen === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = HandyMen.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalHandyMen;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  get: async (req, res) => {
    try {
      const handyMan = await HandyMan.findById(req.params.id)
        .select("-password")
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (!handyMan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const handyData = {
        id: handyMan._id,
        code: handyMan.code,
        name: handyMan.name,
        email: handyMan.email,
        avatar: handyMan.avatar.replace(/\s+/g, ""),
        status: handyMan.status,
        phone: handyMan.phone,
        address: handyMan.address,
        createdOn: handyMan.createdOn,
        updatedOn: handyMan.updatedOn,
        role: handyMan.role ? handyMan.role.name : null,
        permissions: handyMan.role ? handyMan.role.claims : null,
      };

      return Response.successResponse(res, res.statusCode, handyData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const handyMan = await HandyMan.findById(body.id);

      if (!handyMan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      // Check if the email is being updated
      if (body.email && body.email !== handyMan.email) {
        const existingEmail = await HandyMan.findOne({
          email: body.email,
        });

        if (existingEmail) {
          return Response.customResponse(
            res,
            404,
            ResponseMessage.EMAIL_EXISTS
          );
        }
        handyMan.email = body.email;
      }

      handyMan.ownerCode = body.actionBy || handyMan.ownerCode;
      handyMan.name = body.name || handyMan.name;
      handyMan.avatar = body.avatar.replace(/\s+/g, "") || handyMan.avatar;
      handyMan.roleId = body.roleId || handyMan.roleId;
      handyMan.status = body.status;
      handyMan.phone = body.phone || handyMan.phone;
      handyMan.address = body.address || handyMan.address;
      handyMan.email = body.email || handyMan.email;
      handyMan.isOwner = body.isOwner || 0;
      handyMan.updatedOn = DateUtil.currentDate();

      const updatedTenant = await handyMan.save();

      const action = `Updated ${moduleName} - ${handyMan.code}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);

      return res.status(res.statusCode).json(updatedTenant);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const param = req.params;
      const tenantId = param.tenantId;

      const handyMan = await HandyMan.findById(param.id);

      if (!handyMan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await handyMan.deleteOne();

      const action = `Deleted ${moduleName} - ${handyMan.code}`;
      await createActivityLog(moduleName, action, tenantId);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  changePassword: async (req, res) => {
    await changePassword(req, res, HandyMan, moduleName);
  },

  resetPassword: async (req, res) => {
    await resetPassword(req, res, HandyMan, moduleName);
  },

  login: async (req, res) => {
    // await login(req, res, HandyMan);
    await login(req, res, SystemUser);

  },
};

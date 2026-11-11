// MODELS
const Role = require("../../models/roles");
const PropertyAgent = require("../../models/propertyAgents");
const PropertyOwner = require("../../models/propertyOwners");

const SystemUser = require("../../models/systemUsers");
const { findRole } = require("../../utilities/role_finder_utility");

// VALIDATIONS
const { agentValidation } = require("../../validations/propertyAgents");

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
const { status } = require("../../utilities/status_change_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");

const moduleName = `PropertyAgent`;

module.exports = {

  create: async (req, res) => {
    try {
      const body = req.body;
      const { error } = agentValidation(body);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const existingAgent = await PropertyAgent.findOne({ email: body.username, name: body.name });

      if (existingAgent) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const findOwner = await PropertyOwner.findOne({ code: body.actionBy });
      // console.log('test' + findOwner.code);

      if (!findOwner) {
        return Response.customResponse(res, 400, ResponseMessage.NO_OWNER_RECORD);
      }

      const phone = { ...body.phone };
      const address = { ...body.address };

      const uniqueCode = unique.randomCode();
      const hashedPassword = unique.passwordHash(body.password);

      // Find a role where the name starts with "A" -AGENT
      const role = await findRole("A");

      if (!role) {
        return Response.customResponse(res, 404, "No role found with name starting with 'A' for AGENT");
      }

      const agent = PropertyAgent({
        ownerCode: findOwner.code,
        code: "AG" + uniqueCode,
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

      const newAgent = await agent.save();

      const action = `New ${moduleName} - ${"AG" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      if (newAgent._id !== "" || newAgent != null) {
        const account = new SystemUser({
          _id: newAgent._id,
          ownerCode: newAgent.ownerCode,
          code: newAgent.code,
          name: newAgent.name,
          email: newAgent.email,
          roleId: newAgent.roleId,
          status: 1,
          avatar: newAgent.avatar,
          isOwner: 0,
          password: newAgent.password,
          createdOn: DateUtil.currentDate(),
        });

        await account.save();
        await createActivityLog("SystemUser", `New SystemUser - ${newAgent.name}`, person);
        await accountOpening(req, res);
      }

      return Response.successResponse(res, 201, newAgent);

    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAgent: async (req, res) => {
    try {
      const totalAgent = await PropertyAgent.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalAgent
      );

      if (totalAgent == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      // Fetch PropertyAgent with population
      const handyMen = await PropertyAgent.find()
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

      pagination.rows = totalAgent;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAgentByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PropertyAgent.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalAgent = await PropertyAgent.countDocuments({
        ownerCode: creator,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalAgent
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyAgents = await PropertyAgent.find({ ownerCode: creator })
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

      if (totalAgent === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = propertyAgents.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalAgent;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  get: async (req, res) => {
    try {
      const agent = await PropertyAgent.findById(req.params.id)
        .select("-password")
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (!agent) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const agentData = {
        id: agent._id,
        code: agent.code,
        name: agent.name,
        email: agent.email,
        avatar: agent.avatar.replace(/\s+/g, ""),
        status: agent.status,
        phone: agent.phone,
        address: agent.address,
        createdOn: agent.createdOn,
        updatedOn: agent.updatedOn,
        role: agent.role ? agent.role.name : null,
        permissions: agent.role ? agent.role.claims : null,
      };

      return Response.successResponse(res, res.statusCode, agentData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const agent = await PropertyAgent.findById(body.id);

      if (!agent) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      // Check if the email is being updated
      if (body.email && body.email !== agent.email) {
        const existingEmail = await PropertyAgent.findOne({
          email: body.email,
        });

        if (existingEmail) {
          return Response.customResponse(
            res,
            404,
            ResponseMessage.EMAIL_EXISTS
          );
        }
        agent.email = body.email;
      }

      agent.ownerCode = body.actionBy || agent.ownerCode;
      agent.name = body.name || agent.name;
      agent.avatar = body.avatar.replace(/\s+/g, "") || agent.avatar;
      agent.roleId = body.roleId || agent.roleId;
      agent.status = body.status;
      agent.phone = body.phone || agent.phone;
      agent.address = body.address || agent.address;
      agent.email = body.email || agent.email;
      agent.isOwner = body.isOwner || 0;
      agent.updatedOn = DateUtil.currentDate();

      const updatedTenant = await agent.save();

      const action = `Updated ${moduleName} - ${agent.code}`;
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

      const agent = await PropertyAgent.findById(param.id);

      if (!agent) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await agent.deleteOne();

      const action = `Deleted ${moduleName} - ${agent.code}`;
      await createActivityLog(moduleName, action, tenantId);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  changePassword: async (req, res) => {
    await changePassword(req, res, PropertyAgent, moduleName);
  },

  resetPassword: async (req, res) => {
    await resetPassword(req, res, PropertyAgent, moduleName);
  },

  login: async (req, res) => {
    // await login(req, res, PropertyAgent);
    await login(req, res, SystemUser);

  },

  deActivateAndActivate: async (req, res) => {
    await status(req, res, PropertyAgent, moduleName);
  },
};

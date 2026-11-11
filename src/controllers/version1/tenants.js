const mongoose = require('mongoose');

// MODELS
const Role = require("../../models/roles");
const Tenant = require("../../models/tenants");
const Invoice = require("../../models/invoices");
const SystemUser = require("../../models/systemUsers");
const ApplicationFee = require("../../models/applicationFee");
const Charge = require("../../models/charges");
const ChargeType = require("../../models/chargeTypes");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");
const PaymentPeriod = require("../../models/paymentPeriods");
const PaymentMethod = require("../../models/paymentMethods");


// VALIDATIONS
const { tenantValidation } = require("../../validations/tenants");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const { login } = require("../../utilities/login_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const { findRole } = require("../../utilities/role_finder_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { resetPassword } = require("../../utilities/resetpassword_utility");
const { changePassword } = require("../../utilities/changepassword_utility");
const { changePasswordByAdmin } = require("../../utilities/changePasswordByAdmin_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");

const moduleName = `Tenant`;

module.exports = {

  create: async (req, res) => {
    try {
      const body = req.body;
      const { error } = tenantValidation(body);

      if (error)
        return Response.errorResponse(res, 400, error);

      const existingTenant = await Tenant.findOne({
        email: body.username,
        name: body.name,
      });

      if (existingTenant)
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);

      const phone = { ...body.phone };
      const address = { ...body.address };

      const uniqueCode = unique.randomCode();
      const hashedPassword = unique.passwordHash(body.password);

      // Find a role where the name starts with "H" -HANDYMAN
      const role = await findRole("T");

      if (!role)
        return Response.customResponse(res, 404, "No role found with name starting with 'T' for TENANT");

      const tenant = Tenant({
        ownerCode: body.actionBy,
        code: "TN" + uniqueCode,
        name: body.name,
        email: body.email,
        roleId: role._id,
        status: 0,
        avatar: body.avatar.replace(/\s+/g, ""),
        isOwner: 0,
        password: hashedPassword,
        phone,
        address,
        createdOn: DateUtil.currentDate(),
      });

      const newTenant = await tenant.save();

      const action = `New ${moduleName} - ${"TN" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      if (newTenant._id !== "" || newTenant != null) {
        const account = new SystemUser({
          _id: newTenant._id,
          ownerCode: newTenant.ownerCode,
          code: newTenant.code,
          name: newTenant.name,
          email: newTenant.email,
          roleId: newTenant.roleId,
          status: 1,
          avatar: newTenant.avatar,
          isOwner: 0,
          password: newTenant.password,
          phone: newTenant.phone,
          address: newTenant.address,
          createdOn: DateUtil.currentDate(),
        });

        await account.save();
        await createActivityLog("SystemUser", `New SystemUser - ${newTenant.name}`, person);
        await accountOpening(req, res);
      }

      return Response.successResponse(res, 201, newTenant);

    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getTenants: async (req, res) => {
    try {
      const totalTenants = await Tenant.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalTenants
      );

      if (totalTenants == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      // Fetch tenants with population
      const tenants = await Tenant.find()
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

      if (tenants.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      pagination.data = tenants.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalTenants;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getUsersByCreator: async (req, res) => {
    try {
      const landlord = await PropertyOwner.find({ code: req.params.creator });

      if (!landlord) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const owner = req.params.creator;
      const totalUsers = await Tenant.countDocuments({
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

      const users = await Tenant.find({ ownerCode: owner })
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
      const tenant = await Tenant.findById(req.params.id)
        .select("-password")
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (!tenant) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const tenantData = {
        id: tenant._id,
        code: tenant.code,
        name: tenant.name,
        email: tenant.email,
        avatar: tenant.avatar.replace(/\s+/g, ""),
        status: tenant.status,
        phone: tenant.phone,
        address: tenant.address,
        createdOn: tenant.createdOn,
        updatedOn: tenant.updatedOn,
        role: tenant.role ? tenant.role.name : null,
        permissions: tenant.role ? tenant.role.claims : null,
      };

      return Response.successResponse(res, res.statusCode, tenantData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const tenant = await Tenant.findById(body.id);

      if (!tenant) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      // Check if the email is being updated
      if (body.email && body.email !== tenant.email) {
        const existingEmail = await Tenant.findOne({
          email: body.email,
        });

        if (existingEmail) {
          return Response.customResponse(
            res,
            404,
            ResponseMessage.EMAIL_EXISTS
          );
        }
        tenant.email = body.email;
      }

      tenant.ownerCode = body.actionBy || tenant.ownerCode;
      tenant.name = body.name || tenant.name;
      tenant.avatar = body.avatar.replace(/\s+/g, "") || tenant.avatar;
      tenant.roleId = body.roleId || tenant.roleId;
      tenant.status = body.status;
      tenant.phone = body.phone || tenant.phone;
      tenant.address = body.address || tenant.address;
      tenant.actionBy = body.userId || tenant.actionBy;
      tenant.email = body.email || tenant.email;
      tenant.isOwner = body.isOwner || 0;
      tenant.updatedOn = DateUtil.currentDate();

      const updatedTenant = await tenant.save();

      const action = `Updated ${moduleName} - ${tenant.code}`;
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

      const tenant = await Tenant.findById(param.id);

      if (!tenant) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const invoice = await Invoice.findOne({ tenantId: tenant.id });

      if (invoice) {
        return Response.customResponse(res, 404, ResponseMessage.TENANT_INVOICE_EXIST);
      }

      await tenant.deleteOne();

      const action = `Deleted ${moduleName} - ${tenant.code}`;
      await createActivityLog(moduleName, action, tenantId);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  changePassword: async (req, res) => {
    await changePassword(req, res, Tenant, moduleName);
  },

  changePasswordByAdmin: async (req, res) => {
    await changePasswordByAdmin(req, res, Tenant, moduleName);
  },

  resetPassword: async (req, res) => {
    await resetPassword(req, res, Tenant, moduleName);
  },

  login: async (req, res) => {
    await login(req, res, SystemUser);
  },

  activateAccount: async (req, res) => {
    try {
      const body = req.body;

      const tenant = await Tenant.findById(body.tenantId);
      const property = await Property.findById(body.propertyId);
      const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);
      const applicationFee = await ApplicationFee.findById(body.applicationFeeId);
      const propertyOwner = await PropertyOwner.findById(property.propertyOwnerId);

      if (!applicationFee) {
        return Response.customResponse(res, 404, ResponseMessage.NO_APPLICATIONFEE_RECORD);
      }

      // console.log(`test1: ${invoice.totalAmount} test2: ${body.amount}`);
      if (applicationFee.amount != body.amount) {
        return Response.customResponse(res, 404, ResponseMessage.AMOUNT_ERROR);
      };

      if (tenant.status == 1)
        return Response.customResponse(res, 404, ResponseMessage.TENANT_ALREADY_ACTIVATED);

      if (!tenant)
        return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);

      if (!propertyOwner)
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);

      if (!property)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

      if (!propertyUnit)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);

      tenant.status = 1;
      await tenant.save();
      const uniqueCode = unique.randomCode();

      const action = `${moduleName} - ${tenant.code}`;
      const person = tenant.code;
      await createActivityLog(moduleName, action, person);

      let newInvoice = null;

      const someChargeType = await ChargeType.findOne({
        name: { $regex: /(Application Fee|Registration Fee|Background Fee|Screening Fee)/i }
      });

      if (!someChargeType) {
        // console.log(`owner: Matching ChargeType not found.`)
        // return Response.customResponse(res, 404, "Matching ChargeType not found.");
        someChargeType = await ChargeType.create({
          status: 1,
          accountType: "Revenue",
          name: "Application Fee",
          description: "Cost of background check",
          createdOn: DateUtil.currentDate(),
          ownerCode: propertyOwner.code,
        });
      }

      let charge = await Charge.findOne({
        name: { $regex: /(Application|Application Fee|Registration|Registration Fee)/i },
        ownerCode: propertyOwner.code,
      });

      if (!charge) {
        charge = await Charge.create({
          ownerCode: propertyOwner.code,
          propertyId: property._id,
          propertyUnitId: propertyUnit._id,
          chargeTypeId: someChargeType._id,
          currency: "USD",
          amount: applicationFee.amount,
          description: "Application Fee",
          status: 1,
          createdOn: DateUtil.currentDate(),
        });
      }

      var chargesWithDetails = [
        {
          "id": charge._id,
          "name": "Application Fee",
          "currency": "USD",
          "amount": applicationFee.amount,
          "accountType": "Revenue",
          "description": "Background Check Costs"
        }
      ];

      // 1. Find the first payment option
      let paymentOption = await PaymentMethod.findOne({
        name: { $regex: /(Card|Visa|Bank)/i },
        ownerCode: propertyOwner.code,
      });

      // 2. If none found, create one
      if (!paymentOption) {
        paymentOption = await PaymentMethod.create({
          name: "Card",
          description: "VISA or MasterCard",
          status: 1,
          ownerCode: propertyOwner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 3. Find the first payment period
      let paymentPeriod = await PaymentPeriod.findOne({
        name: { $regex: /(Annualy|Monthly|Weekly|Yearly|Annually|Annual)/i },
        ownerCode: propertyOwner.code,
      });

      // 4. If none found, create one
      if (!paymentPeriod) {
        paymentPeriod = await PaymentPeriod.create({
          name: "Per Application",
          description: "Application Fee",
          status: 1,
          ownerCode: propertyOwner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 5. Use their IDs
      const paymentOptionId = paymentOption._id;
      const paymentPeriodId = paymentPeriod._id;

      newInvoice = new Invoice({
        tenantId: tenant._id,
        ownerId: propertyOwner._id,
        propertyId: property._id,
        propertyUnitId: propertyUnit._id,
        paymentOptionId: paymentOptionId,
        paymentPeriodId: paymentPeriodId,
        charges: chargesWithDetails,
        invoiceNumber: `I-${uniqueCode}`,
        currency: "USD",
        totalAmount: applicationFee.amount,
        totalExpensesAmount: 0,
        totalRevenuesAmount: applicationFee.amount,
        isActive: true,
        isPaid: true,
        isVoid: false,
        isBatch: false,
        invoiceDate: DateUtil.currentDate(),
        dueDate: DateUtil.currentDate(),
        ownerCode: propertyOwner.code,
      });

      await newInvoice.save();

      const action2 = `New Invoice - ${newInvoice.invoiceNumber}`;
      await createActivityLog("Invoice Application", action2, tenant.code);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });

    } catch (error) {
      return Response.errorResponse(res, 500, error);
    }
  },
};

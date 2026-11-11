const mongoose = require('mongoose');

// MODELS
const Role = require("../../models/roles");
const Invoice = require("../../models/invoices");
const SystemUser = require("../../models/systemUsers");
const SubscriptionPlan = require("../../models/subscriptionPlans");
const Tenant = require("../../models/tenants");

const Charge = require("../../models/charges");
const ChargeType = require("../../models/chargeTypes");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");
const PaymentPeriod = require("../../models/paymentPeriods");
const PaymentMethod = require("../../models/paymentMethods");
const PropertyType = require("../../models/propertyTypes");
const PropertyStatus = require("../../models/propertyStatuses");
const PropertyCategory = require("../../models/propertyCategories");

// VALIDATIONS
const { ownerValidation } = require("../../validations/owners");

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
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");
// const { createSubscriptionInvoice } = require("../../utilities/invoice_utility");
const { isValidObjectId } = require("mongoose");

const moduleName = `PropertyOwner`;

module.exports = {

  create: async (req, res) => {
    try {
      const body = req.body;
      const { error } = ownerValidation(body);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const existingOwner = await PropertyOwner.findOne({
        email: body.username,
        name: body.name,
      });

      if (existingOwner) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const phone = { ...body.phone };
      const address = { ...body.address };

      const uniqueCode = unique.randomCode();
      const hashedPassword = unique.passwordHash(body.password);

      // Find a role where the name starts with "H" -HANDYMAN
      const role = await findRole("O");

      if (!role) {
        return Response.customResponse(res, 404, "No role found with name starting with 'O' for PROPERTY OWNER");
      }

      const owner = PropertyOwner({
        ownerCode: body.actionBy,
        code: "PO" + uniqueCode,
        name: body.name,
        email: body.email,
        roleId: role._id,
        status: body.status || 0,
        avatar: body.avatar.replace(/\s+/g, ""),
        isOwner: body.isOwner || 0,
        password: hashedPassword,
        phone,
        address,
        createdOn: DateUtil.currentDate(),
      });

      const newOwner = await owner.save();

      const action = `New ${moduleName} - ${"TN" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      if (newOwner._id !== "" || newOwner != null) {
        const account = new SystemUser({
          _id: newOwner._id,
          ownerCode: newOwner.ownerCode,
          code: newOwner.code,
          name: newOwner.name,
          email: newOwner.email,
          roleId: newOwner.roleId,
          status: 1,
          avatar: newOwner.avatar,
          isOwner: 0,
          password: newOwner.password,
          phone: newOwner.phone,
          address: newOwner.address,
          createdOn: DateUtil.currentDate(),
        });

        await account.save();
        await createActivityLog("SystemUser", `New SystemUser - ${newOwner.name}`, person);
        await accountOpening(req, res);
      }

      return Response.successResponse(res, 201, newOwner);

    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getOwners: async (req, res) => {
    try {
      const totalOwners = await PropertyOwner.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalOwners
      );

      if (totalOwners == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      // Fetch propertyOwners with population
      const propertyOwners = await PropertyOwner.find()
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

      if (propertyOwners.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      pagination.data = propertyOwners.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalOwners;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getOwnersByRole: async (req, res) => {
    try {
      const role = await Role.findById(req.params.id);

      if (!role) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const roleId = role._id;
      const totalOwners = await PropertyOwner.countDocuments({
        roleId: roleId,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalOwners
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyOwners = await PropertyOwner.find()
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

      if (totalOwners === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = propertyOwners.map((item) => ({
        ...item.toJSON(),
        role: item.role ? item.role.name : null,
        permissions: item.role ? item.role.claims : null,
      }));

      pagination.rows = totalOwners;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  get: async (req, res) => {
    try {
      const owner = await PropertyOwner.findById(req.params.id)
        .select("-password")
        .populate([
          {
            path: "role",
            select: "id name claims",
          },
        ]);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const ownerData = {
        id: owner._id,
        code: owner.code,
        name: owner.name,
        email: owner.email,
        avatar: owner.avatar.replace(/\s+/g, ""),
        status: owner.status,
        phone: owner.phone,
        address: owner.address,
        createdOn: owner.createdOn,
        updatedOn: owner.updatedOn,
        role: owner.role ? owner.role.name : null,
        permissions: owner.role ? owner.role.claims : null,
      };

      return Response.successResponse(res, res.statusCode, ownerData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const owner = await PropertyOwner.findById(body.id);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      // Check if the email is being updated
      if (body.email && body.email !== owner.email) {
        const existingEmail = await PropertyOwner.findOne({
          email: body.email,
        });

        if (existingEmail) {
          return Response.customResponse(
            res,
            404,
            ResponseMessage.EMAIL_EXISTS
          );
        }
        owner.email = body.email;
      }

      owner.name = body.name || owner.name;
      owner.avatar = body.avatar.replace(/\s+/g, "") || owner.avatar;
      owner.roleId = body.roleId || owner.roleId;
      owner.status = body.status;
      owner.phone = body.phone || owner.phone;
      owner.address = body.address || owner.address;
      owner.ownerCode = body.actionBy || owner.ownerCode;
      owner.email = body.email || owner.email;
      owner.isOwner = body.isOwner || 0;
      owner.updatedOn = DateUtil.currentDate();

      const updatedTenant = await owner.save();

      const action = `Updated ${moduleName} - ${owner.code}`;
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

      const owner = await PropertyOwner.findById(param.id);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      await owner.deleteOne();

      const action = `Deleted ${moduleName} - ${owner.code}`;
      await createActivityLog(moduleName, action, tenantId);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  changePassword: async (req, res) => {
    await changePassword(req, res, PropertyOwner, moduleName);
  },

  resetPassword: async (req, res) => {
    await resetPassword(req, res, PropertyOwner, moduleName);
  },

  login: async (req, res) => {
    await login(req, res, SystemUser);
  },

  activateAccount: async (req, res) => {
    try {
      const body = req.body;

      const owner = await PropertyOwner.findById(body.ownerId);
      const subscriptionPlan = await SubscriptionPlan.findById(body.subscriptionId);

      if (!subscriptionPlan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_SUBSCRIPTION_RECORD);
      }

      if (subscriptionPlan.amount != body.amount) {
        return Response.customResponse(res, 404, ResponseMessage.AMOUNT_ERROR);
      };

      if (owner.status == 1) {
        return Response.customResponse(res, 404, ResponseMessage.SUBSCRIPTION_ALREADY_PAID);
      };

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      owner.status = 1;
      await owner.save();

      const action = `${moduleName} - ${owner.code}`;
      const person = owner.code;
      await createActivityLog(moduleName, action, person);
      const uniqueCode = unique.randomCode();

      // 1. Find the first property category
      let propertyCategory = await PropertyCategory.findOne({
        name: { $regex: /(Apartment|House)/i },
        ownerCode: owner.code,
      });

      // 2. If none found, create one
      if (!propertyCategory) {
        propertyCategory = await PropertyCategory.create({
          name: "Apartment House",
          description: "Standalone bungalow house",
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 3. Find the first property type
      let propertyType = await PropertyType.findOne({
        name: { $regex: /(For Rent|Rent|To Let)/i },
        ownerCode: owner.code,
      });

      // 4. If none found, create one
      if (!propertyType) {
        propertyType = await PropertyType.create({
          name: "For Rent",
          description: "House To Let",
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 5. Find the first property
      let property = null;

      const address = {
        city: owner.address.city ? owner.address.city : "",
        state: owner.address.state ? owner.address.state : "",
        zipcode: owner.address.zipcode ? owner.address.zipcode : "",
      };

      // 6. If none found, create one
      if (!property) {
        property = await Property.create({
          code: "PR" + uniqueCode,
          description: `${owner.name} Real Estate`,
          yearBuilt: 2019,
          image: "rentrack-light.png",
          address: address,
          propertyTypeId: propertyType._id,
          propertyOwnerId: owner._id,
          propertyCategoryId: propertyCategory._id,
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 7. Find the first propertyStatus
      let propertyStatus = await PropertyStatus.findOne({
        name: { $regex: /(Vacant|Free|To Let)/i },
        ownerCode: owner.code,
      });

      // 8. If none found, create one
      if (!propertyStatus) {
        propertyStatus = await PropertyStatus.create({
          name: "Vacant",
          description: "Ready For Occupation",
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 9. Find the first propertyUnit
      let propertyUnit = null;

      // 10. Find the first propertyUnit
      if (!propertyUnit) {
        propertyUnit = await PropertyUnit.create({
          code: "PU" + uniqueCode,
          status: 1,
          name: `Unit - ${uniqueCode}`,
          description: `Unit - ${uniqueCode},${address.city}, ${address.state}`,
          currency: "USD",
          price: 0,
          size: 0,
          unit: "Sqm",
          bedRoom: 0,
          bathRoom: 0,
          kitchen: 0,
          parking: 0,
          propertyId: property._id,
          propertyStatusId: propertyStatus._id,
          gallery: [],
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 11. Find the first payment option
      let paymentOption = await PaymentMethod.findOne({
        name: { $regex: /(Card|Visa|Bank)/i },
        ownerCode: owner.code,
      });

      // 12. If none found, create one
      if (!paymentOption) {
        paymentOption = await PaymentMethod.create({
          name: "Card",
          description: "VISA or MasterCard",
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 13. Find the first payment period
      let paymentPeriod = await PaymentPeriod.findOne({
        name: { $regex: /(Annualy|Monthly|Weekly|Yearly|Annually|Annual)/i },
        ownerCode: owner.code,
      });

      // 14. If none found, create one
      if (!paymentPeriod) {
        paymentPeriod = await PaymentPeriod.create({
          name: "Annualy",
          description: "Annual Payment",
          status: 1,
          ownerCode: owner.code,
          createdOn: DateUtil.currentDate(),
        });
      }

      // 15. Use their IDs
      const paymentOptionId = paymentOption._id;
      const paymentPeriodId = paymentPeriod._id;

      let newInvoice = null;

      const someChargeType = await ChargeType.findOne({
        name: { $regex: /(Subscription Fee|Subscribe Fee|Plan)/i }
      });

      if (!someChargeType) {
        // console.log(`owner: Matching ChargeType not found.`)
        // return Response.customResponse(res, 404, "Matching ChargeType not found.");
        someChargeType = await ChargeType.create({
          status: 1,
          accountType: "Expense",
          name: "Subscription Fee",
          description: "Costs Towards Usage of Rentrack",
          createdOn: DateUtil.currentDate(),
          ownerCode: owner.code,
        });
      }

      let charge = await Charge.findOne({
        name: { $regex: /(Subscription|Subscription Fee|Service|Service Fee)/i },
        ownerCode: owner.code,
      });

      if (!charge) {
        charge = await Charge.create({
          ownerCode: owner.code,
          propertyId: property._id,
          propertyUnitId: propertyUnit._id,
          chargeTypeId: someChargeType._id,
          currency: "USD",
          amount: subscriptionPlan.amount,
          description: "Subscription Fee",
          status: 1,
          createdOn: DateUtil.currentDate(),
        });
      }

      var chargesWithDetails = [
        {
          "id": charge._id,
          "name": "Subscription Fee",
          "currency": "USD",
          "amount": subscriptionPlan.amount,
          "accountType": "Expense",
          "description": "Cost Towards Usage of Rentrack"
        }
      ];

      // 16. Create a default self tenant
      let tenant = null;
      let role = await Role.findOne({
        name: { $regex: /(Tenant)/i },
      });

      tenant = await Tenant.create({
        ownerCode: body.actionBy,
        code: "TN" + uniqueCode,
        name: owner.name,
        email: owner.email,
        roleId: role._id,
        status: 0,
        avatar: owner.avatar,
        isOwner: 0,
        password: owner.password,
        phone: owner.phone,
        address: owner.address,
        createdOn: DateUtil.currentDate(),
      });

      newInvoice = new Invoice({
        ownerId: owner._id,
        tenantId: tenant._id,
        propertyId: property._id,
        propertyUnitId: propertyUnit._id,
        paymentOptionId: paymentOptionId,
        paymentPeriodId: paymentPeriodId,
        charges: chargesWithDetails,
        invoiceNumber: `I-${uniqueCode}`,
        currency: "USD",
        totalAmount: subscriptionPlan.amount,
        totalExpensesAmount: subscriptionPlan.amount,
        totalRevenuesAmount: 0,
        isActive: true,
        isPaid: true,
        isVoid: false,
        isBatch: false,
        invoiceDate: DateUtil.currentDate(),
        dueDate: DateUtil.currentDate(),
        ownerCode: owner.code,
      });

      await newInvoice.save();

      const action2 = `New Invoice - ${newInvoice.invoiceNumber}`;
      await createActivityLog("Invoice Subscription", action2, owner.code);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });

    } catch (error) {
      return Response.errorResponse(res, 500, error);
    }
  },
};

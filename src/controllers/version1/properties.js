// MODELS
const Property = require("../../models/properties");
const PropertyType = require("../../models/propertyTypes");
const PropertyOwner = require("../../models/propertyOwners");
const PropertyCategory = require("../../models/propertyCategories");

// VALIDATIONS
const { propertyValidation } = require("../../validations/properties");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Property`;

module.exports = {
  create: async (req, res) => {
    try {
      const body = req.body;
      const uniqueCode = unique.randomCode();
      const { error } = propertyValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const existingProperty = await Property.findOne({
        propertyOwnerId: body.ownerId,
      });

      if (existingProperty) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const type = await PropertyType.findById(body.propertyTypeId);
      const owner = await PropertyOwner.findById(body.propertyOwnerId);
      const category = await PropertyCategory.findById(body.propertyCategoryId);

      if (!owner)
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);

      if (!type)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYTYPE_RECORD);

      if (!category)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYCATEGORY_RECORD);

      const address = {
        city: body.address.city ? body.address.city : "",
        state: body.address.state ? body.address.state : "",
        zipcode: body.address.zipcode ? body.address.zipcode : "",
      };

      const property = new Property({
        code: "PR" + uniqueCode,
        description: body.description,
        yearBuilt: body.buildYear,
        image: body.avatar.replace(/\s+/g, ""),
        address: address,
        propertyTypeId: body.propertyTypeId,
        propertyOwnerId: body.propertyOwnerId,
        propertyCategoryId: body.propertyCategoryId,
        status: 1,
        ownerCode: body.actionBy,
        createdOn: DateUtil.currentDate(),
      });

      const newProperty = await property.save();

      const action = `New ${moduleName}- ${"PR" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newProperty);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getProperties: async (req, res) => {
    try {
      const totalProperties = await Property.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalProperties
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await Property.find()
        .populate([
          { path: "owner" },
          { path: "category", select: "name" },
          { path: "propertyType", select: "name" },
          // { path: "propertyType" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalProperties === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = pagination.data.map((item) => ({
        ...item.toJSON(),
        owner: item.owner ? item.owner.name : null,
        category: item.category ? item.category.name : null,
        propertyType: item.propertyType ? item.propertyType.name : null,
        // propertyType: item.propertyType ? item.propertyType : null,
      }));

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertiesByOwner: async (req, res) => {
    try {
      // Fetch the owner by code
      const owner = await PropertyOwner.findOne({ code: req.params.code });

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      // Use the owner code for filtering
      const ownerCode = owner.code;

      // Count total properties for pagination
      const totalProperties = await Property.countDocuments({ ownerCode: ownerCode });

      // Return a "No Data" response if no properties exist
      if (totalProperties === 0) {
        return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
      }

      // Get pagination parameters
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalProperties
      );

      // Ensure the requested page is within range
      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
      }

      // Fetch properties with pagination
      const properties = await Property.find({ ownerCode: ownerCode })
        .populate([
          { path: "owner" },
          { path: "category", select: "name" },
          { path: "propertyType", select: "name" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      // Map the results with owner, category, and propertyType details
      pagination.data = properties.map((item) => ({
        ...item.toJSON(),
        owner: item.owner ? item.owner.name : null,
        category: item.category ? item.category.name : null,
        propertyType: item.propertyType ? item.propertyType.name : null,
      }));

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message || err);
    }
  },

  get: async (req, res) => {
    try {
      const property = await Property.findById(req.params.id).populate([
        { path: "owner" },
        { path: "category", select: "name" },
        { path: "propertyType", select: "name" },
      ]);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const propertyData = {
        id: property._id,
        code: property.code,
        description: property.description,
        yearBuilt: property.yearBuilt,
        image: property.image,
        status: property.status,
        address: property.address,
        owner: property.owner ? property.owner : null,
        category: property.category ? property.category.name : null,
        propertyType: property.propertyType ? property.propertyType.name : null,
        createdOn: property.createdOn,
      };

      return Response.successResponse(res, res.statusCode, propertyData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;

      const type = await PropertyType.findById(body.propertyTypeId);
      const owner = await PropertyOwner.findById(body.propertyOwnerId);
      const category = await PropertyCategory.findById(body.propertyCategoryId);
      const property = await Property.findById(body.id);

      if (!owner)
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);

      if (!type)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYTYPE_RECORD);

      if (!category)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYCATEGORY_RECORD);

      if (!property)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

      property.description = body.description || property.description;
      property.yearBuilt = body.buildYear || property.yearBuilt;
      property.image = body.avatar.replace(/\s+/g, "") || property.image;
      property.address = body.address || property.address;
      property.status = body.status || property.status;
      property.ownerCode = body.actionBy || property.ownerCode;
      property.propertyTypeId = body.propertyTypeId || property.propertyTypeId;
      property.propertyOwnerId = property.propertyOwnerId;
      property.propertyCategoryId =
        body.propertyCategoryId || property.propertyCategoryId;
      property.updatedOn = DateUtil.currentDate();

      const updatedProperty = await property.save();

      const action = `Updated ${moduleName} - ${property.code}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, updatedProperty);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const param = req.params;
      const property = await Property.findById(param.id);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
      }

      await property.deleteOne();

      const action = `Deleted ${moduleName}- ${property.code}`;
      const person = param.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.customResponse(
        res,
        res.statusCode,
        ResponseMessage.SUCCESS_MESSAGE
      );
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  search: async (req, res) => {
    try {
      const body = req.body;

      // Check if IDs exist
      const owner = body.ownerId ? await PropertyOwner.findById(body.ownerId) : null;
      const propertyType = body.propertyTypeId ? await PropertyType.findById(body.propertyTypeId) : null;
      const propertyCategory = body.propertyCategoryId ? await PropertyCategory.findById(body.propertyCategoryId) : null;

      if (body.ownerId && !owner) return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      if (body.propertyTypeId && !propertyType) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYTYPE_RECORD);
      if (body.propertyCategoryId && !propertyCategory) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYCATEGORY_RECORD);

      // Build query
      const searchText = req.query.searchText || "";
      let query = {};
      if (searchText) {
        query.$or = [
          { code: { $regex: searchText, $options: "i" } },
          { ownerCode: { $regex: searchText, $options: "i" } },
          { "address.city": { $regex: searchText, $options: "i" } },
          { "address.state": { $regex: searchText, $options: "i" } },
        ];
      }
      if (body.ownerId) query.propertyOwnerId = body.ownerId;
      if (body.propertyTypeId) query.propertyTypeId = body.propertyTypeId;
      if (body.propertyCategoryId) query.propertyCategoryId = body.propertyCategoryId;
      if (body.minYear || body.maxYear) {
        query.yearBuilt = {};
        if (body.minYear) query.yearBuilt.$gte = body.minYear;
        if (body.maxYear) query.yearBuilt.$lte = body.maxYear;
      }

      // console.log("Query Object:", JSON.stringify(query, null, 2));

      // Get total properties
      const totalProperties = await Property.countDocuments(query);
      // console.log("Total Properties Found:", totalProperties);

      if (totalProperties === 0) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      // Get pagination
      const { pagination, skip } = await PaginationUtility.paginationParams(req, totalProperties);
      // console.log("Pagination:", pagination);

      if (pagination.page > pagination.pages || pagination.page < 1) {
        return Response.customResponse(res, 400, "Page is Out of Range");
      }

      // Get paginated properties
      const properties = await Property.find(query)
        .populate([
          { path: "owner" },
          { path: "category", select: "name" },
          { path: "propertyType", select: "name" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      const responseData = properties.map((item) => ({
        ...item.toJSON(),
        owner: item.owner ? item.owner.name : null,
        category: item.category ? item.category.name : null,
        propertyType: item.propertyType ? item.propertyType.name : null,
      }));

      pagination.data = responseData;
      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      // console.error("Error:", err);
      return Response.errorResponse(res, 500, err.message || err);
    }
  },

};

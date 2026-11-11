// MODELS
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyStatus = require("../../models/propertyStatuses");
const PropertyOwner = require("../../models/propertyOwners");

// VALIDATIONS
const { propertyUnitValidation } = require("../../validations/propertyUnits");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PropertyUnity`;

module.exports = {
  create: async (req, res) => {
    try {
      const body = req.body;
      const uniqueCode = unique.randomCode();
      const { error } = propertyUnitValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const existingPropertyUnit = await PropertyUnit.findOne({
        name: body.name,
        propertyId: body.propertyId,
      });

      if (existingPropertyUnit) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const property = await Property.findById(body.propertyId);
      const status = await PropertyStatus.findById(body.propertyStatusId);

      if (!property)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

      if (!status)
        return Response.customResponse(res, 404, ResponseMessage.NO_STATUS_RECORD);

      const properties = new PropertyUnit({
        code: "PU" + uniqueCode,
        status: 1,
        name: body.name,
        description: body.description,
        currency: body.currency,
        price: body.price,
        size: body.size,
        unit: body.unit,
        bedRoom: body.bedRoom,
        bathRoom: body.bathRoom,
        kitchen: body.kitchen,
        parking: body.parking,
        propertyId: body.propertyId,
        propertyStatusId: body.propertyStatusId,
        gallery: body.gallery.map((per) => ({
          name: per.name,
        })),
        ownerCode: body.actionBy,
        createdOn: DateUtil.currentDate(),
      });

      const newPropertyUnit = await properties.save();

      const action = `New ${moduleName}- ${"PU" + uniqueCode}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newPropertyUnit);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyUnits: async (req, res) => {
    try {
      const totalPropertyUnits = await PropertyUnit.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyUnits
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await PropertyUnit.find()
        .populate({
          path: "property",
          select: "code description yearBuilt status address propertyTypeId",
          populate: {
            path: "propertyType",
            select: "name description",
          },
        })
        .populate({
          path: "availabilityStatus",
          select: "name description",
        })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalPropertyUnits === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = pagination.data.map((item) => {
        const itemJSON = item.toJSON();
        const property = itemJSON.property || null;

        // Extract propertyType.name if it exists
        const propertyTypeName = property?.propertyType?.name || null;

        return {
          ...itemJSON,
          property: property
            ? {
              ...property,
              propertyType: propertyTypeName, // Replace object with string
            }
            : null,
          availabilityStatus: itemJSON.availabilityStatus || null,
        };
      });

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyUnitsByOwner: async (req, res) => {
    try {
      // Fetch the property by code
      const property = await PropertyOwner.findOne({ code: req.params.code });

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      // Use the property code for filtering
      const ownerCode = property.code;

      // Count total propertyUnits for pagination
      const totalPropertyUnits = await PropertyUnit.countDocuments({ ownerCode: ownerCode });

      // Return a "No Data" response if no propertyUnits exist
      if (totalPropertyUnits === 0) {
        return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
      }

      // Get pagination parameters
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyUnits
      );

      // Ensure the requested page is within range
      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
      }

      // Fetch propertyUnits with pagination
      const propertyUnits = await PropertyUnit.find({ ownerCode: ownerCode })
        .populate({
          path: "property",
          select: "code description yearBuilt status address propertyTypeId",
          populate: {
            path: "propertyType",
            select: "name description",
          },
        })
        .populate({
          path: "availabilityStatus",
          select: "name description",
        })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      // Map the results with property, category, and propertyStatus details
      pagination.data = propertyUnits.map((item) => {
        const itemJSON = item.toJSON();
        const property = itemJSON.property || null;

        // Extract propertyType.name if it exists
        const propertyTypeName = property?.propertyType?.name || null;

        return {
          ...itemJSON,
          property: property
            ? {
              ...property,
              propertyType: propertyTypeName, // Replace object with string
            }
            : null,
          availabilityStatus: itemJSON.availabilityStatus || null,
        };
      });

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message || err);
    }
  },

  get: async (req, res) => {
    try {
      const property = await PropertyUnit.findById(req.params.id)
        .populate({
          path: "property",
          select: "code description yearBuilt status address propertyTypeId",
          populate: {
            path: "propertyType",
            select: "name description",
          },
        })
        .populate({
          path: "availabilityStatus",
          select: "name description",
        });

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const propertyObj = property.property ? property.property.toJSON() : null;
      const propertyTypeName = propertyObj?.propertyType?.name || null;

      const propertyData = {
        id: property._id,
        code: property.code,
        status: property.status,
        name: property.name,
        description: property.description,
        ownerCode: property.ownerCode,
        currency: property.currency,
        price: property.price,
        size: property.size,
        unit: property.unit,
        bedRoom: property.bedRoom,
        bathRoom: property.bathRoom,
        kitchen: property.kitchen,
        parking: property.parking,
        gallery: property.gallery,
        property: propertyObj
          ? {
            ...propertyObj,
            propertyType: propertyTypeName, // 👈 Only the name as string
          }
          : null,
        availabilityStatus: property.availabilityStatus || null,
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

      const property = await PropertyUnit.findById(body.id);
      const props = await Property.findById(body.propertyId);
      const status = await PropertyStatus.findById(body.propertyStatusId);

      if (!props)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

      if (!status)
        return Response.customResponse(res, 404, ResponseMessage.NO_STATUS_RECORD);

      if (!property)
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_UNIT);


      property.code = property.code;
      property.status = body.status;
      property.name = body.name || property.name;
      property.description = body.description || property.description;
      property.currency = body.currency || property.currency;
      property.price = body.price || property.price;
      property.size = body.size || property.size;
      property.unit = body.unit || property.unit;
      property.bedRoom = body.bedRoom || property.bedRoom;
      property.bathRoom = body.bathRoom || property.bathRoom;
      property.kitchen = body.kitchen || property.kitchen;
      property.unit = body.unit || property.unit;
      property.gallery = body.gallery || property.gallery;
      property.propertyId = body.propertyId || property.propertyId;
      property.propertyStatusId = body.propertyStatusId || property.propertyStatusId;
      property.ownerCode = body.actionBy || property.ownerCode;
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
      const property = await PropertyUnit.findById(param.id);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
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
      const property = body.propertyId ? await Property.findById(body.propertyId) : null;
      const propertyStatus = body.propertyStatusId ? await PropertyStatus.findById(body.propertyStatusId) : null;

      if (body.propertyId && !property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
      }

      if (body.propertyStatusId && !propertyStatus) {
        return Response.customResponse(res, 404, ResponseMessage.NO_STATUS_RECORD);
      }

      // Build query
      const searchText = req.query.searchText || "";
      let query = {};

      if (searchText) {
        query.$or = [
          { code: { $regex: searchText, $options: "i" } },
          { name: { $regex: searchText, $options: "i" } },
          { ownerCode: { $regex: searchText, $options: "i" } },
          { "availabilityStatus.name": { $regex: searchText, $options: "i" } },
        ];
      }

      if (body.propertyId) query.propertyId = body.propertyId;
      if (body.propertyStatusId) query.propertyStatusId = body.propertyStatusId;
      if (body.bedRoom) query.bedRoom = body.bedRoom;
      if (body.bathRoom) query.bathRoom = body.bathRoom;
      if (body.kitchen) query.kitchen = body.kitchen;
      if (body.parking) query.parking = body.parking;

      // Price range filter
      if (body.minPrice || body.maxPrice) {
        query.price = {};
        if (body.minPrice) query.price.$gte = body.minPrice;
        if (body.maxPrice) query.price.$lte = body.maxPrice;
      }

      // Get total propertyUnits
      const totalPropertyUnits = await PropertyUnit.countDocuments(query);

      // Handle no data case immediately
      if (totalPropertyUnits === 0) {
        return res.status(200).json({
          page: 1,
          pages: 0,
          pageSize: 10,
          rows: 0,
          data: []
        });
      }

      // Proceed with pagination
      const { pagination, skip } = await PaginationUtility.paginationParams(req, totalPropertyUnits);

      // Handle out-of-range page with valid empty response
      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          page: pagination.page,
          pages: pagination.pages,
          pageSize: pagination.pageSize,
          rows: totalPropertyUnits,
          data: []
        });
      }

      // Get paginated propertyUnits
      const propertyUnits = await PropertyUnit.find(query)
        .populate([
          { path: "property", select: "code description yearBuilt status address" },
          { path: "availabilityStatus", select: "name description" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      // Handle case where no results on current page
      if (propertyUnits.length === 0) {
        return res.status(200).json({
          page: pagination.page,
          pages: pagination.pages,
          pageSize: pagination.pageSize,
          rows: totalPropertyUnits,
          data: []
        });
      }

      // Build response
      pagination.data = propertyUnits.map((item) => ({
        ...item.toJSON(),
        property: item.property || null,
        availabilityStatus: item.availabilityStatus || null,
      }));

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message || err);
    }
  }

};

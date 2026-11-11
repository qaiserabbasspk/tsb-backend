// MODELS
const DocumentType = require("../../models/documentTypes");

// VALIDATIONS
const { documentValidation } = require("../../validations/documentTypes");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `DocumentType`;

module.exports = {
  create: async (req, res) => {
    try {
      const documentData = req.body;

      const { error } = documentValidation(documentData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const document = DocumentType({
        ownerCode: documentData.actionBy,
        name: documentData.name,
        status: documentData.status,
        createdOn: DateUtil.currentDate(),
      });

      const newDocument = await document.save();

      const action = `New ${moduleName} - ${newDocument.name}`;
      const person = documentData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newDocument);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAllDocumentTypes: async (req, res) => {
    try {
      const totalDocuments = await DocumentType.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalDocuments
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await DocumentType.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize); // Explicitly populate the virtual field

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getDocumentTypeByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await DocumentType.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await DocumentType.countDocuments({
        ownerCode: creator,
      });


      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyStatus
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyStatus = await DocumentType.find({ ownerCode: creator })
        .select("-createdOn -updatedOn")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      pagination.data = propertyStatus.map((pagination) => {
        pagination.id = pagination._id.toHexString();
        return pagination;
      });

      pagination.rows = totalPropertyStatus;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getDocument: async (req, res) => {
    try {
      const id = req.params.id;

      const foundDocument = await DocumentType.findById(id);

      if (!foundDocument) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, foundDocument);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      if (!body.actionBy) {
        return Response.customResponse(
          res,
          400,
          ResponseMessage.ACTIONBY_REQUIRED
        );
      }

      const foundDocument = await DocumentType.findById(body.id);

      if (!foundDocument) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      foundDocument.ownerCode = body.actionBy || foundDocument.ownerCode;
      foundDocument.name = body.name || foundDocument.name;
      foundDocument.status = body.status;
      foundDocument.updatedOn = DateUtil.currentDate();

      const update = await foundDocument.save();

      const action = `Updated ${moduleName} - ${foundDocument.name}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, update);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const docType = await DocumentType.findById(req.params.id);

      if (!docType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DOCUMENT_RECORD);
      }

      await docType.deleteOne();

      const action = `Deleted ${moduleName} - ${docType.code}`;
      const person = req.params.createdBy;
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

  deActivateAndActivate: async (req, res) => {
    await status(req, res, DocumentType, moduleName);
  },
};

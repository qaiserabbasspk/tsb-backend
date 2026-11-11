// MODELS
const Document = require("../../models/documents");

// VALIDATIONS
const { documentValidation } = require("../../validations/documents");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Document`;

module.exports = {
  create: async (req, res) => {
    try {
      const documentData = req.body;

      const { error } = documentValidation(documentData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const document = Document({
        name: documentData.name,
        documentype: documentData.documentype,
        status: documentData.status,
        createdOn: DateUtil.currentDate(),
      });

      const newDocument = await document.save();

      const action = `New ${moduleName} - ${newDocument._id}`;
      const person = documentData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newDocument);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAllDocuments: async (req, res) => {
    try {
      const totalDocuments = await Document.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalDocuments
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await Document.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize)
        .populate("documentType");

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getDocument: async (req, res) => {
    try {
      const id = req.params.id;

      const foundDocument = await Document.findById(id).populate(
        "documentType"
      );

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

      const foundDocument = await Document.findById(body.id);

      if (!foundDocument) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      foundDocument.name = body.name || foundDocument.name;
      foundDocument.type = body.type || foundDocument.type;
      foundDocument.updatedOn = DateUtil.currentDate();

      const update = await foundDocument.save();

      const action = `Updated ${moduleName} - ${foundDocument._id}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, update);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  deActivateAndActivate: async (req, res) => {
    await status(req, res, Document, moduleName);
  },
};

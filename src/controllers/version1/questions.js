// MODELS
const Question = require("../../models/questions");

// VALIDATIONS
const { questionValidation } = require("../../validations/questions");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Question`;

module.exports = {
  create: async (req, res) => {
    try {
      const questionData = req.body;

      const { error } = questionValidation(questionData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const question = Question({
        name: questionData.name,
        category: questionData.category,
        status: 1,
        ownerCode: questionData.actionBy,
        createdOn: DateUtil.currentDate(),
      });

      const newDocument = await question.save();

      const action = `New ${moduleName} - ${newDocument._id}`;
      const person = questionData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newDocument);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAllQuestions: async (req, res) => {
    try {
      const totalCurrency = await Question.countDocuments();

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalCurrency
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await Question.find()
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalCurrency === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getQuestion: async (req, res) => {
    try {
      const id = req.params.id;

      const foundDocument = await Question.findById(id);

      if (!foundDocument) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, foundDocument);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  geByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await Question.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await Question.countDocuments({
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

      const propertyStatus = await Question.find({ ownerCode: creator })
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

  getByType: async (req, res) => {
    try {
      const category = req.params.type; // Changed cat to category for clarity

      // Count total questions in the specified category
      const totalQns = await Question.countDocuments({ category });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalQns
      );

      // Check if the requested page exceeds available pages
      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      // Fetch questions by category with pagination
      const questions = await Question.find({ category })
        .select('-createdOn -updatedOn')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      // Format the response
      pagination.data = questions.map((question) => ({
        id: question._id.toHexString(),
        ...question._doc // Spread the document data
      }));

      pagination.rows = pagination.data;

      return Response.paginationResponse(res, res.statusCode, pagination);
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

      const foundDocument = await Question.findById(body.id);

      if (!foundDocument) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      foundDocument.name = body.name || foundDocument.name;
      foundDocument.category = body.category || foundDocument.category;
      foundDocument.status = body.status || foundDocument.status;
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
    await status(req, res, Question, moduleName);
  },
};

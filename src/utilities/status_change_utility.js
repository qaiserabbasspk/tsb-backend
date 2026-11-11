const ResponseMessage = require("./messages_utility");
const Response = require("../utilities/response_utility");
const DateUtil = require("../utilities/date_utility");
const { createActivityLog } = require("../utilities/activitylog_utility");

const status = async (req, res, model, moduleName) => {
  try {
    const body = req.body;

    const currentData = await model.findById(body.id);
    if (!currentData) {
      return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    }

    const newStatus = currentData.status === 1 ? 0 : 1;

    const updateOperation = {
      $set: {
        status: newStatus,
        updatedOn: DateUtil.currentDate(),
      },
    };

    const updatedData = await model.findByIdAndUpdate(
      body.id,
      updateOperation,
      { new: true }
    );

    if (!updatedData) {
      return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    }

    const action = `Updated ${moduleName} status to ${newStatus} - ${updatedData._id}`;
    const person = body.actionBy;
    await createActivityLog(moduleName, action, person);

    return Response.customResponse(
      res,
      res.statusCode,
      ResponseMessage.DATA_DEACTIVATED
    );
  } catch (err) {
    return Response.errorResponse(res, 500, err);
  }
};

module.exports = { status };

module.exports = {
  sendValidationErrorMessage: async (res, statusCode, error) => {
    if (!res || res.headersSent) {
      console.error(`Cannot send validation error: ${error.message}`);
      return;
    }
    return res.status(statusCode).json({
      message: error.message,
    });
  },

  errorResponse: (res, statusCode, error) => {
    // Most callers pass a real Error, but several pass a plain canned string
    // (e.g. ResponseMessage.FILE_UPLOAD_ERROR) — strings have no .message,
    // so that used to serialize as {message: undefined}, which JSON.stringify
    // drops entirely, leaving the frontend's shared error handler with no text
    // to show but the literal word "undefined".
    const message = typeof error === "string" ? error : error?.message;
    if (!res || res.headersSent) {
      console.error(`Cannot send error response: ${message}`);
      return;
    }
    return res.status(statusCode).json({
      message,
    });
  },

  successResponse: (res, statusCode, model) => {
    if (!res || res.headersSent) {
      console.error(`Cannot send success response`);
      return;
    }
    return res.status(statusCode).json(model);
  },

  customResponse: (res, statusCode, result) => {
    if (!res || res.headersSent) {
      console.error(`Cannot send custom response: ${result}`);
      return;
    }
    return res.status(statusCode).json({
      message: result,
    });
  },

  paginationResponse: (res, statusCode, pagination) => {
    if (!res || res.headersSent) {
      console.error(`Cannot send pagination response`);
      return;
    }
    return res.status(statusCode).json({
      page: pagination.page,
      pages: pagination.pages,
      pageSize: pagination.pageSize,
      rows: pagination.rows,
      data: pagination.data,
    });
  },
};

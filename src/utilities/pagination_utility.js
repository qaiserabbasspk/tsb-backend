require("dotenv").config();
const Pagination = require("../models/pagination");

module.exports = {
  paginationParams: async (req, totalItems) => {
    const defaultPage = process.env.DEFAULT_PAGE;
    const defaultPageSize = process.env.DEFAULT_PAGESIZE;
    const pagination = new Pagination({});

    pagination.page = parseInt(req.query.page) || defaultPage;
    pagination.pageSize = parseInt(req.query.pageSize) || defaultPageSize;
    pagination.rows = totalItems;
    pagination.pages = Math.ceil(totalItems / pagination.pageSize);
    const skip = (pagination.page - 1) * pagination.pageSize;

    return { pagination, skip };
  },
};

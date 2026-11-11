const Blog = require("../../models/blog");
const { blogValidation } = require("../../validations/blog");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Blog`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = blogValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const blog = Blog({
                title: body.title,
                slug: body.slug,
                content: body.content,
                featuredImage: body.featuredImage,
                publisher: body.publisher,
                location: body.location,
                isActive: body.isActive
            });

            const newBlog = await blog.save();

            return Response.successResponse(res, res.statusCode, newBlog);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalBlogs = await Blog.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBlogs
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await Blog.find()
                .select()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
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

    getById: async (req, res) => {
        try {
            const blogId = req.params.id;

            const blog = await Blog.findById(blogId).select();

            if (!blog) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, blog);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },
}
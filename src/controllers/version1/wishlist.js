const Wishlist = require("../../models/wishlist");
const User = require("../../models/hosts");
const Room = require("../../models/rooms");
const { wishListValidation } = require("../../validations/wishlist");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Wishlist`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = wishListValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const user = await User.findById(body.userId);
            const room = await Room.findById(body.roomId);

            if (!user)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!room)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const wish = Wishlist({
                userId: body.userId,
                roomId: body.roomId
            });

            const newWishlist = await wish.save();

            const action = `New ${moduleName} - ${newWishlist.roomId}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newWishlist);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getByUser: async (req, res) => {
        try {
            const user = await User.findById(req.params.id);

            if (!user) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const totalWishlist = await Wishlist.countDocuments({ userId: user.id });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalWishlist
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Wishlist.find({ userId: user.id })
                .populate([
                    { path: "user", select: "id name code avatar" },
                    { path: "room", select: "id code title subtitle description gallery price currency rating guests bedroom bed bath" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalWishlist === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const wishlist = await Wishlist.findById(param.id);

            if (!wishlist) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await wishlist.deleteOne();

            const action = `Deleted ${moduleName}- ${wishlist.userId}`;
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
}